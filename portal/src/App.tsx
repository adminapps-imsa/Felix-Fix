import { Suspense } from 'react';
import { lazyConRecarga } from './lib/lazyConRecarga';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProductosDanadosPage } from './features/productos-danados/pages/ProductosDanadosPage';
import { useAuth } from './auth/useAuth';
import { ACCESO_CONTABILIDAD, ACCESO_PRODUCTOS, ACCESO_RECLAMOS, P } from './auth/permisos';

// Carga diferida: Reclamos trae SheetJS (pesado) y no debe engordar el resto del portal.
const ReclamosPage = lazyConRecarga(() => import('./features/reclamos/pages/ReclamosPage').then((m) => ({ default: m.ReclamosPage })));
const ReclamoDetallePage = lazyConRecarga(() =>
  import('./features/reclamos/pages/ReclamoDetallePage').then((m) => ({ default: m.ReclamoDetallePage }))
);
const ContabilidadPage = lazyConRecarga(() =>
  import('./features/contabilidad/pages/ContabilidadPage').then((m) => ({ default: m.ContabilidadPage }))
);
const DocumentoContabilidadPage = lazyConRecarga(() =>
  import('./features/contabilidad/pages/DocumentoContabilidadPage').then((m) => ({ default: m.DocumentoContabilidadPage }))
);
const InicioPage = lazyConRecarga(() => import('./features/inicio/InicioPage').then((m) => ({ default: m.InicioPage })));
const ConfiguracionPage = lazyConRecarga(() =>
  import('./features/configuracion/pages/ConfiguracionPage').then((m) => ({ default: m.ConfiguracionPage }))
);

function SinAcceso() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-bold">Todavía no tienes acceso</h1>
      <p className="mt-2 text-sm opacity-70">
        Tu usuario no tiene ningún rol con permisos en el portal. Pídele a un administrador que te asigne uno; en cuanto lo haga,
        esta página se actualiza sola.
      </p>
    </div>
  );
}

export default function App() {
  const { ready, authenticated, login, puede, user, servidorNoDisponible, reintentar } = useAuth();
  const accesoProductos = puede(...ACCESO_PRODUCTOS);
  const accesoReclamos = puede(...ACCESO_RECLAMOS);
  const accesoContabilidad = puede(...ACCESO_CONTABILIDAD);
  const accesoConfig = puede(P.config);
  // Página de inicio: "Inicio" (lo que le toca hoy) para quien trabaja en algún módulo.
  const accesoInicio = accesoProductos || accesoReclamos || accesoContabilidad;
  const inicio = accesoInicio ? '/inicio' : accesoConfig ? '/configuracion' : '/sin-acceso';

  if (!ready) {
    return <div className="grid min-h-svh place-items-center text-sm opacity-70">Cargando…</div>;
  }
  if (!authenticated && servidorNoDisponible) {
    // /auth/me falló por 503 o sin red: no es que falte la sesión, es que el servidor no respondió.
    return (
      <div className="grid min-h-svh place-items-center p-4 text-center text-sm">
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold">El servidor no está disponible.</p>
          <p className="opacity-70">No se pudo verificar tu sesión. Intenta de nuevo en un momento.</p>
          <button
            onClick={reintentar}
            className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!authenticated) {
    // Normalmente se redirige solo; si el regreso desde Keycloak falló, el
    // usuario necesita poder reintentar en vez de quedarse en esta pantalla.
    return (
      <div className="grid min-h-svh place-items-center p-4 text-center text-sm">
        <div className="flex flex-col items-center gap-3">
          <p className="opacity-70">No hay una sesión activa.</p>
          <button
            onClick={login}
            className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm opacity-60">Cargando…</p>}>
        {/* key: al cambiar de "Vista por" las páginas se montan de nuevo y vuelven a pedir sus datos con los permisos de esa vista. */}
        <Routes key={user?.vista || 'propia'}>
          {accesoInicio && <Route path="/inicio" element={<InicioPage />} />}
          {accesoProductos && <Route path="/productos-danados" element={<ProductosDanadosPage />} />}
          {accesoReclamos && <Route path="/reclamos" element={<ReclamosPage />} />}
          {accesoReclamos && <Route path="/reclamos/:token" element={<ReclamoDetallePage />} />}
          {accesoContabilidad && <Route path="/contabilidad" element={<ContabilidadPage />} />}
          {accesoContabilidad && <Route path="/contabilidad/:id" element={<DocumentoContabilidadPage />} />}
          {accesoConfig && <Route path="/configuracion" element={<ConfiguracionPage />} />}
          <Route path="/sin-acceso" element={<SinAcceso />} />
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
