export interface StoredUser {
  username: string;
  name: string;
  roles: string[];
}

export interface AuthUser {
  username: string;
  name: string;
  roles: Set<string>;
  /** Permisos efectivos según los roles actuales (GET /api/auth/me). */
  permisos: Set<string>;
  /** "Vista por": rol con el que se está viendo el portal (null = vista propia). */
  vista?: string | null;
  /** true solo para el Administrador real: puede usar "Vista por". */
  puedeVistaPor?: boolean;
  /** Límites de archivos del servidor (GET /api/auth/me). */
  limites?: Limites;
}

/** Límites de archivos en MB, tal como los tiene configurados el servidor. */
export interface Limites {
  evidenciaMb: number;
  adjuntoMb: number;
  correoMb: number;
}

interface StoredSession {
  token: string;
  user: StoredUser;
  exp: number;
  /** id_token de Keycloak: solo para el id_token_hint al cerrar sesión. */
  idToken?: string | null;
}

const STORAGE_KEY = 'felix-portal-session';

function decodeExpMs(token: string): number {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function loadSession(): { token: string; user: AuthUser } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredSession = JSON.parse(raw);
    if (!stored.exp || stored.exp <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Los permisos no se guardan: se piden al backend al cargar (pueden haber cambiado).
    return { token: stored.token, user: { ...stored.user, roles: new Set(stored.user.roles), permisos: new Set() } };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(token: string, user: StoredUser, idToken?: string | null): void {
  const stored: StoredSession = { token, user, exp: decodeExpMs(token), idToken: idToken || null };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/** id_token de Keycloak de la sesión guardada (aunque el JWT del portal ya haya vencido). */
export function getIdToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession).idToken || null : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  setVista(null);
}

// "Vista por" se guarda por pestaña (sessionStorage): sobrevive a recargar,
// pero una pestaña nueva abre con la vista propia. El backend la valida.
const VISTA_KEY = 'felix-portal-vista';

export function getVista(): string | null {
  try {
    return sessionStorage.getItem(VISTA_KEY);
  } catch {
    return null;
  }
}

export function setVista(rol: string | null): void {
  try {
    if (rol) sessionStorage.setItem(VISTA_KEY, rol);
    else sessionStorage.removeItem(VISTA_KEY);
  } catch {
    // sin almacenamiento disponible: la vista dura hasta recargar
  }
}

/** Cuándo vence la sesión del portal (ms epoch, del `exp` del token); null si no hay sesión. */
export function getSessionExp(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const exp = (JSON.parse(raw) as StoredSession).exp;
    return exp > 0 ? exp : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return loadSession()?.token ?? null;
}
