import { Activity, History, KeyRound, Mail, Settings, Store, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { cn } from '../../../lib/cn';
import { UsuariosTab } from '../components/UsuariosTab';
import { TiendasTab } from '../components/TiendasTab';
import { RolesTab } from '../components/RolesTab';
import { HistorialTab } from '../components/HistorialTab';
import { CorreosTab } from '../components/CorreosTab';
import { BitacoraTab } from '../components/BitacoraTab';

type Seccion = 'usuarios' | 'tiendas' | 'roles' | 'correos' | 'historial' | 'bitacora';

/**
 * Secciones en el orden en que se configura a alguien: quién entra (roles),
 * dónde trabaja (tienda), qué puede hacer cada rol; luego correos e historial.
 */
const SECCIONES: { id: Seccion; titulo: string; resumen: string; descripcion: string; icono: typeof Users }[] = [
  {
    id: 'usuarios',
    titulo: 'Usuarios',
    resumen: 'Quién entra y con qué rol',
    descripcion: 'Marca o quita los roles de cada persona. Se guarda en Keycloak al momento.',
    icono: Users,
  },
  {
    id: 'tiendas',
    titulo: 'Tiendas',
    resumen: 'Qué tienda ve cada persona',
    descripcion: 'Pon a cada persona en su tienda para que vea solo lo de ella, o limítala a lo que crea.',
    icono: Store,
  },
  {
    id: 'roles',
    titulo: 'Roles y permisos',
    resumen: 'Qué puede hacer cada rol',
    descripcion: 'Elige un rol y marca lo que puede ver y hacer en cada módulo.',
    icono: KeyRound,
  },
  {
    id: 'correos',
    titulo: 'Correos',
    resumen: 'Avisos que manda el portal',
    descripcion: 'Cuándo sale cada correo, quién lo recibe y cómo se ve. Desde aquí se envía la bienvenida.',
    icono: Mail,
  },
  {
    id: 'historial',
    titulo: 'Historial',
    resumen: 'Quién cambió qué',
    descripcion: 'Los últimos 100 cambios de accesos: roles, permisos, tiendas y bienvenidas.',
    icono: History,
  },
  {
    id: 'bitacora',
    titulo: 'Bitácora',
    resumen: 'Qué pasa en el portal',
    descripcion: 'Todo lo que hace cada persona y todo lo que sale mal, por fecha, persona, rol y módulo. Se guarda 180 días.',
    icono: Activity,
  },
];

export function ConfiguracionPage() {
  // La sección queda en la dirección (?seccion=tiendas): se puede compartir y sobrevive a recargar.
  const [params, setParams] = useSearchParams();
  const { puede } = useAuth();
  // Sin ser administrador (supervisor GOF con usuarios.tiendas) solo ve Tiendas.
  const secciones = puede(P.config) ? SECCIONES : SECCIONES.filter((s) => s.id === 'tiendas');
  const pedida = params.get('seccion');
  const actual = secciones.find((s) => s.id === pedida) ?? secciones[0];
  const elegir = (id: Seccion) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id === 'usuarios') n.delete('seccion');
        else n.set('seccion', id);
        return n;
      },
      { replace: true }
    );
  const Icono = actual.icono;

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina>
        <TituloPagina icono={Settings} titulo="Configuración">
          <p className="bajada-pagina">
            {puede(P.config)
              ? 'Quién entra al portal, dónde trabaja y qué puede hacer. Los usuarios y roles vienen de Keycloak; las tiendas y los permisos se definen aquí.'
              : 'En qué tienda trabaja cada persona con rol Gof.'}
          </p>
        </TituloPagina>
      </BandaPagina>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Secciones: columna en escritorio, fila deslizable en celular. */}
        <nav aria-label="Secciones de configuración" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul role="tablist" aria-orientation="vertical" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {secciones.map((s) => {
              const activo = s.id === actual.id;
              const I = s.icono;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    aria-controls="config-panel"
                    onClick={() => elegir(s.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                      activo ? 'glass-card ring-2 ring-brand-500/50' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
                        activo ? 'bg-brand-500 text-white dark:bg-brand-400' : 'bg-black/5 opacity-70 dark:bg-white/10'
                      )}
                    >
                      <I size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block whitespace-nowrap text-sm font-semibold', activo && 'text-brand-700 dark:text-brand-300')}>{s.titulo}</span>
                      <span className="hidden truncate text-xs opacity-60 lg:block">{s.resumen}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section id="config-panel" role="tabpanel" aria-labelledby="config-titulo" className="flex min-w-0 flex-col gap-4">
          <header className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Icono size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="config-titulo" className="text-xl font-bold">
                {actual.titulo}
              </h2>
              <p className="text-sm opacity-70">{actual.descripcion}</p>
            </div>
          </header>

          {/* key: al cambiar de sección entra con su animación y su estado empieza de cero. */}
          <div key={actual.id} className="anim-aparecer min-w-0">
            {actual.id === 'usuarios' && <UsuariosTab />}
            {actual.id === 'tiendas' && <TiendasTab />}
            {actual.id === 'roles' && <RolesTab />}
            {actual.id === 'correos' && <CorreosTab />}
            {actual.id === 'historial' && <HistorialTab />}
            {actual.id === 'bitacora' && <BitacoraTab />}
          </div>
        </section>
      </div>
    </div>
  );
}
