import 'dotenv/config';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

// Esquema de SQL Server donde viven las tablas del portal (QA | Prod).
// Se interpola en las consultas, así que solo se aceptan identificadores simples.
export const SCHEMA_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function schema(value) {
  const s = value || 'QA';
  if (!SCHEMA_PATTERN.test(s)) throw new Error(`DB_SCHEMA inválido: "${s}"`);
  return s;
}

// Tabla externa (base.esquema.tabla) en el mismo servidor SQL; se interpola en
// la consulta, así que se valida cada parte y se arma con corchetes.
function tablaExterna(value) {
  const partes = (value || 'FelixApproval.dbo.compradoras_proveedores').split('.');
  if (partes.length !== 3 || !partes.every((p) => SCHEMA_PATTERN.test(p))) {
    throw new Error(`RECLAMOS_COMPRADORAS_TABLA inválida: "${value}" (formato base.esquema.tabla)`);
  }
  return partes.map((p) => `[${p}]`).join('.');
}

function sapConnectString() {
  const { DB_SAP_HOST: host, DB_SAP_PORT: port, DB_SAP_SID: sid } = process.env;
  return host && sid ? `${host}:${port || 1521}/${sid}` : '';
}

const dbSchema = schema(process.env.DB_SCHEMA);

export const env = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '',
  // IPs de proxies confiables (formato de Express "trust proxy"), separadas por coma.
  trustProxy: (process.env.TRUST_PROXY || 'loopback')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),

  db: {
    server: process.env.DB_SERVER || '',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || '',
    schema: dbSchema,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    encrypt: bool(process.env.DB_ENCRYPT, true),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, false),
  },

  keycloak: {
    issuerUrl: process.env.KEYCLOAK_ISSUER_URL || '',
    jwksUri: process.env.KEYCLOAK_JWKS_URI || '',
    clientId: process.env.KEYCLOAK_CLIENT_ID || '',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    authDisabled: bool(process.env.AUTH_DISABLED, false),
    // Rol del cliente que tiene todos los permisos del portal siempre.
    roleSuperAdmin: process.env.KEYCLOAK_ROLE_SUPERADMIN || 'Administrador',
  },

  session: {
    jwtSecret: process.env.SESSION_JWT_SECRET || '',
    expiresIn: process.env.SESSION_JWT_EXPIRES_IN || '12h',
  },

  evidence: {
    provider: process.env.EVIDENCE_STORAGE_PROVIDER || 'local',
    // Una carpeta por esquema (uploads/QA, uploads/Prod) para no mezclar fotos entre ambientes.
    localDir: process.env.EVIDENCE_LOCAL_DIR || `./uploads/${dbSchema}/productos-danados`,
    maxSizeMb: Number(process.env.EVIDENCE_MAX_SIZE_MB) || 5,
  },

  reclamos: {
    // Quién puede ver, crear, decidir o eliminar: Configuración → Roles y permisos.
    localDir: process.env.RECLAMOS_LOCAL_DIR || `./uploads/${dbSchema}/reclamos`,
    maxSizeMb: Number(process.env.RECLAMOS_MAX_SIZE_MB) || 15,
    // Permite crear sin documento SAP SOLO fuera de producción (QA/pruebas).
    sapDocOpcional: bool(process.env.RECLAMOS_SAP_DOC_OPCIONAL, false),
    // Catálogo compradora -> proveedor que mantiene el portal FelixApproval.
    // Se lee en vivo (solo lectura) para el dropdown de compradoras.
    compradorasTabla: tablaExterna(process.env.RECLAMOS_COMPRADORAS_TABLA),
  },

  // SAP (Oracle, solo lectura). Acepta SAP_ORACLE_* o las DB_SAP_* del .env
  // (host/puerto/SID por separado; el SID se usa como service name).
  sap: {
    user: process.env.SAP_ORACLE_USER || process.env.DB_SAP_USER || '',
    password: process.env.SAP_ORACLE_PASSWORD || process.env.DB_SAP_PASS || '',
    connectString: process.env.SAP_ORACLE_CONNECT_STRING || sapConnectString(),
    timeoutMs: Number(process.env.SAP_ORACLE_TIMEOUT_MS) || 15000,
    // Mandante productivo; las tablas de SAP viven en el esquema SAPSR3.
    mandante: process.env.SAP_MANDANTE || '600',
    esquema: process.env.SAP_ESQUEMA || 'SAPSR3',
    // Baja de inventario de Productos Dañados (POST /:id/procesar). Apagada por
    // defecto: la integración aún no existe y la ruta responde 503.
    procesarHabilitado: bool(process.env.SAP_PROCESAR_HABILITADO, false),
  },

  // Correo saliente (envío del reporte de Productos Dañados al proveedor).
  correo: {
    host: process.env.MAIL_HOST || '',
    port: Number(process.env.MAIL_PORT) || 587,
    // true = TLS directo (465); false = STARTTLS (587) o sin TLS (25).
    secure: bool(process.env.MAIL_SECURE, false),
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    from: process.env.MAIL_FROM || '',
    fromNombre: process.env.MAIL_FROM_NAME || 'Felix Fix',
    // Alternativa al SMTP: el correo se entrega a un webhook de n8n, que lo
    // envía con su conexión de Outlook. Si hay URL, tiene prioridad.
    n8nUrl: (process.env.MAIL_N8N_WEBHOOK_URL || '').trim(),
    n8nToken: process.env.MAIL_N8N_TOKEN || '',
    n8nHeader: (process.env.MAIL_N8N_HEADER || '').trim() || 'X-Portal-Token',
    n8nTimeoutMs: Number(process.env.MAIL_N8N_TIMEOUT_MS) || 60000,
    // Opcional: solo se permite enviar a estos dominios (p. ej. en pruebas con
    // "Direct Send" de Microsoft 365, que solo entrega dentro de la empresa).
    soloDominios: (process.env.MAIL_SOLO_DOMINIOS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    maxAdjuntosMb: Number(process.env.MAIL_MAX_ADJUNTOS_MB) || 20,
    // Avisos internos a cada área cuando un reporte le llega (por defecto sí).
    avisos: bool(process.env.MAIL_AVISOS, true),
    // Interruptor general para pruebas: con true no sale NINGÚN correo (avisos,
    // proveedor, bienvenida). El envío responde 503 CORREO_DESACTIVADO y queda en el log.
    desactivado: bool(process.env.MAIL_DESACTIVADO, false),
    // Dirección del portal para el enlace de los avisos (por defecto, el primer CORS_ORIGIN).
    portalUrl: (process.env.PORTAL_URL || (process.env.CORS_ORIGIN || '').split(',')[0] || '').trim().replace(/\/+$/, ''),
  },
};

export function isDbConfigured() {
  return Boolean(env.db.server && env.db.database && env.db.user && env.db.password);
}

export function isKeycloakConfigured() {
  return Boolean(
    env.keycloak.issuerUrl && env.keycloak.jwksUri && env.keycloak.clientId && env.keycloak.clientSecret
  );
}

export function isSessionConfigured() {
  return Boolean(env.session.jwtSecret);
}

export function isCorreoConfigured() {
  return Boolean(env.correo.n8nUrl || (env.correo.host && env.correo.from));
}

export function isSapConfigured() {
  return Boolean(env.sap.connectString && env.sap.user && env.sap.password);
}

/*
 * Candados de producción: si algo de esto quedó mal configurado, la API no
 * arranca (mejor caída y visible en el log que abierta sin autenticación).
 */
if (env.nodeEnv === 'production') {
  if (env.keycloak.authDisabled) {
    throw new Error('AUTH_DISABLED=true no está permitido con NODE_ENV=production: el portal quedaría sin inicio de sesión.');
  }
  if (env.session.jwtSecret.length < 32) {
    throw new Error('SESSION_JWT_SECRET debe tener al menos 32 caracteres en producción.');
  }
}
