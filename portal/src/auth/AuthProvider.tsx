import React, { createContext, useCallback, useEffect, useState } from 'react';
import { clearSession, getSessionExp, getToken, getVista, loadSession, saveSession, setVista, type AuthUser, type Limites } from './session';

export type { AuthUser };

interface AuthContextValue {
  ready: boolean;
  authenticated: boolean;
  /** true si no se pudo verificar la sesión porque el servidor no respondió (503 o error de red). */
  servidorNoDisponible: boolean;
  /** Vuelve a verificar la sesión (tras "El servidor no está disponible"). */
  reintentar: () => void;
  user: AuthUser | null;
  /** true si el usuario tiene al menos uno de los permisos. Solo para mostrar u ocultar; el backend decide. */
  puede: (...permisos: string[]) => boolean;
  login: () => void;
  logout: () => void;
  /** "Vista por" (solo Administrador): ver el portal con los permisos de un rol; null = vista propia. */
  cambiarVista: (rol: string | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  ready: false,
  authenticated: false,
  servidorNoDisponible: false,
  reintentar: () => {},
  user: null,
  puede: () => false,
  login: () => {},
  logout: () => {},
  cambiarVista: async () => {},
});

// Cada cuánto se vuelven a pedir los permisos (un cambio de rol se nota sin recargar).
const REFRESCO_MS = 2 * 60 * 1000;
// En "Vista por" más seguido: si el Administrador cambia los permisos del rol, se ve enseguida.
const REFRESCO_VISTA_MS = 15 * 1000;
// Aviso antes de que venza la sesión del portal (el token no se puede renovar sin volver a Keycloak).
const AVISO_VENCE_MS = 5 * 60 * 1000;

interface Me {
  username: string;
  name: string;
  roles: string[];
  permisos: string[];
  vista: string | null;
  puedeVistaPor: boolean;
  limites?: Limites;
}

/** Permisos actuales del usuario (en la vista activa). null = la sesión ya no es válida. */
async function pedirMe(): Promise<Me | null> {
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const vista = getVista();
  if (vista) headers['X-Vista-Rol'] = vista;
  const res = await fetch('/api/auth/me', { headers });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const aUsuario = (me: Me): AuthUser => ({
  username: me.username,
  name: me.name,
  roles: new Set(me.roles),
  permisos: new Set(me.permisos),
  vista: me.vista,
  puedeVistaPor: me.puedeVistaPor,
  limites: me.limites,
});

// Solo para desarrollo local, mientras no hay realm/client real de Keycloak.
// Activar con VITE_AUTH_DISABLED=true en portal/.env. Debe combinarse con
// AUTH_DISABLED=true en el .env del backend, si no la API seguirá
// respondiendo 503 en las rutas protegidas. NUNCA usar en producción.
const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

const KEYCLOAK_URL = (import.meta.env.VITE_KEYCLOAK_URL || '').replace(/\/+$/, '');
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || '';
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || '';
const CALLBACK_PATH = '/auth/callback';
const OAUTH_STATE_KEY = 'felix-portal-oauth-state';
const PKCE_VERIFIER_KEY = 'felix-portal-pkce-verifier';


function realmUrl(path: string): string {
  return `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}${path}`;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * PKCE (RFC 7636): el código que devuelve Keycloak solo se puede canjear con
 * el verificador que quedó en esta pestaña. Si el navegador no tiene
 * crypto.subtle (por ejemplo, fuera de HTTPS), el login sigue sin PKCE.
 */
async function crearPkce(): Promise<{ verifier: string; challenge: string } | null> {
  if (!window.crypto?.subtle) return null;
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(hash)) };
}

function redirectToLogin(): void {
  void (async () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    const params = new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      redirect_uri: `${window.location.origin}${CALLBACK_PATH}`,
      response_type: 'code',
      scope: 'openid',
      state,
    });
    const pkce = await crearPkce().catch(() => null);
    if (pkce) {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, pkce.verifier);
      params.set('code_challenge', pkce.challenge);
      params.set('code_challenge_method', 'S256');
    } else {
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    }
    window.location.href = realmUrl(`/protocol/openid-connect/auth?${params}`);
  })();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [servidorNoDisponible, setServidorNoDisponible] = useState(false);

  /** Pide los permisos actuales. Si la sesión venció, la borra y manda a iniciar sesión. */
  const refrescar = useCallback(async (): Promise<boolean> => {
    try {
      const me = await pedirMe();
      if (!me) {
        clearSession();
        setServidorNoDisponible(false);
        setAuthenticated(false);
        if (!AUTH_DISABLED) redirectToLogin();
        return false;
      }
      // La vista pedida ya no vale (rol borrado en Keycloak, o ya no es Administrador): vuelve a la propia.
      if (getVista() && !me.vista) setVista(null);
      setUser(aUsuario(me));
      setAuthenticated(true);
      setServidorNoDisponible(false);
      return true;
    } catch (err) {
      // 503 o sin red: si todavía no había sesión verificada, App muestra "El servidor no está disponible".
      setServidorNoDisponible(true);
      // Error de red puntual: se mantiene lo que había, se reintenta en el próximo ciclo.
      console.warn('No se pudieron actualizar los permisos.', err);
      return false;
    }
  }, []);

  useEffect(() => {
    if (AUTH_DISABLED) {
      console.warn(
        'VITE_AUTH_DISABLED=true: la UI se muestra con un usuario simulado, sin verificar Keycloak. No usar en producción.'
      );
      void refrescar().finally(() => setReady(true));
      return;
    }

    if (window.location.pathname === CALLBACK_PATH) {
      void handleCallback();
      return;
    }

    const session = loadSession();
    if (session) {
      setUser(session.user);
      void refrescar().finally(() => setReady(true));
    } else {
      redirectToLogin();
    }
  }, [refrescar]);

  // Mantener los permisos al día mientras la página está abierta.
  useEffect(() => {
    if (!authenticated) return;
    const id = window.setInterval(() => void refrescar(), user?.vista ? REFRESCO_VISTA_MS : REFRESCO_MS);
    const alVolver = () => document.visibilityState === 'visible' && void refrescar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [authenticated, refrescar, user?.vista]);

  async function handleCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY) || undefined;
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);

    if (!code || !state || state !== expectedState) {
      console.error('Callback de Keycloak inválido: falta el código o el state no coincide.');
      redirectToLogin();
      return;
    }

    try {
      const res = await fetch('/api/auth/keycloak-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri: `${window.location.origin}${CALLBACK_PATH}`, codeVerifier }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      saveSession(data.token, data.user);
      window.history.replaceState({}, '', '/');
      await refrescar();
    } catch (err) {
      console.error('No se pudo completar el inicio de sesión con Keycloak.', err);
    } finally {
      setReady(true);
    }
  }

  const puede = useCallback((...permisos: string[]) => permisos.some((p) => user?.permisos.has(p)), [user]);

  const reintentar = useCallback(() => {
    setReady(false);
    void refrescar().finally(() => setReady(true));
  }, [refrescar]);

  const value: AuthContextValue = {
    ready,
    authenticated,
    servidorNoDisponible,
    reintentar,
    user,
    puede,
    login: () => {
      if (!AUTH_DISABLED) redirectToLogin();
    },
    cambiarVista: async (rol: string | null) => {
      setVista(rol);
      await refrescar();
    },
    logout: () => {
      if (AUTH_DISABLED) return;
      clearSession();
      const params = new URLSearchParams({
        client_id: KEYCLOAK_CLIENT_ID,
        post_logout_redirect_uri: window.location.origin,
      });
      window.location.href = realmUrl(`/protocol/openid-connect/logout?${params}`);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authenticated && !AUTH_DISABLED && <AvisoVencimiento onRenovar={value.login} />}
    </AuthContext.Provider>
  );
}

/**
 * Avisa 5 minutos antes de que venza la sesión del portal. No hay renovación
 * silenciosa (el token lo emite el backend tras el login de Keycloak), así que
 * el aviso pide guardar el trabajo; "Iniciar sesión de nuevo" recarga vía Keycloak.
 */
function AvisoVencimiento({ onRenovar }: { onRenovar: () => void }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const [cerrado, setCerrado] = useState<number | null>(null);
  const exp = getSessionExp();

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 15 * 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!exp) return null;
  const resta = exp - ahora;
  // `cerrado` guarda el exp que se descartó: si la sesión cambia (nuevo login), el aviso vuelve a valer.
  if (resta > AVISO_VENCE_MS || resta <= 0 || cerrado === exp) return null;
  const minutos = Math.max(1, Math.ceil(resta / 60000));

  return (
    <div
      role="alert"
      className="anim-subir fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-white px-4 py-3 text-sm shadow-lg dark:bg-slate-900"
    >
      <span className="min-w-0 flex-1">
        <strong className="text-warning">Tu sesión vence en {minutos} minuto{minutos === 1 ? '' : 's'}.</strong> Guarda tu trabajo: al
        vencer tendrás que iniciar sesión de nuevo y se perderá lo que no hayas guardado.
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCerrado(exp)}
          className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          Entendido
        </button>
        <button
          type="button"
          onClick={onRenovar}
          title="Vuelve a iniciar sesión ahora (lo que no hayas guardado se pierde)"
          className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950"
        >
          Iniciar sesión de nuevo
        </button>
      </div>
    </div>
  );
}
