import { jwtVerify, createRemoteJWKSet, SignJWT } from 'jose';
import { env, isKeycloakConfigured, isSessionConfigured } from '../config/env.js';
import { unauthorized, serviceUnavailable, badGateway } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

let jwks = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(env.keycloak.jwksUri));
  }
  return jwks;
}

/**
 * Solo los roles de ESTE cliente: un "Administrador" de otro cliente o del
 * realm no debe dar acceso al portal. (Son el respaldo si Keycloak no
 * responde; normalmente los roles se leen en cada petición, ver auth.js.)
 */
function extractRoles(claims) {
  return [...new Set(claims.resource_access?.[env.keycloak.clientId]?.roles ?? [])];
}

async function exchangeCodeForKeycloakToken(code, redirectUri, codeVerifier) {
  const tokenUrl = `${env.keycloak.issuerUrl}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: env.keycloak.clientId,
    client_secret: env.keycloak.clientSecret,
  });
  // PKCE: Keycloak comprueba que el código lo canjea el mismo navegador que inició el login.
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  let res;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Error de red al contactar Keycloak');
    throw badGateway('No se pudo contactar a Keycloak.');
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.warn({ status: res.status, detail }, 'Keycloak rechazó el intercambio de código');
    throw unauthorized('No se pudo validar el inicio de sesión con Keycloak.');
  }

  return res.json();
}

/**
 * Intercambia el código de autorización con Keycloak (usando el client
 * secret, nunca expuesto al frontend) y emite un JWT de sesión propio —
 * el backend nunca reenvía el access_token de Keycloak al navegador.
 */
export async function iniciarSesionConCodigo(code, redirectUri, codeVerifier) {
  if (!isKeycloakConfigured() || !isSessionConfigured()) {
    throw serviceUnavailable(
      'Autenticación no configurada (faltan KEYCLOAK_ISSUER_URL/JWKS_URI/CLIENT_ID/CLIENT_SECRET o SESSION_JWT_SECRET).'
    );
  }

  const tokenResponse = await exchangeCodeForKeycloakToken(code, redirectUri, codeVerifier);

  let payload;
  try {
    ({ payload } = await jwtVerify(tokenResponse.access_token, getJwks(), {
      issuer: env.keycloak.issuerUrl,
    }));
  } catch (err) {
    logger.warn({ err: err.message }, 'Token de Keycloak inválido tras el intercambio');
    throw unauthorized('Token de Keycloak inválido.');
  }

  const user = {
    sub: payload.sub,
    username: payload.preferred_username || payload.sub,
    name: payload.name || payload.preferred_username || payload.sub,
    roles: extractRoles(payload),
  };

  const sessionToken = await new SignJWT({ username: user.username, name: user.name, roles: user.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(env.session.expiresIn)
    .sign(new TextEncoder().encode(env.session.jwtSecret));

  return { token: sessionToken, user };
}
