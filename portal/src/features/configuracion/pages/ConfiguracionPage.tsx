import { useState } from 'react';
import { History, KeyRound, Mail, Settings, Users } from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { cn } from '../../../lib/cn';
import { useIndicador } from '../../../lib/useIndicador';
import { UsuariosTab } from '../components/UsuariosTab';
import { RolesTab } from '../components/RolesTab';
import { HistorialTab } from '../components/HistorialTab';
import { CorreosTab } from '../components/CorreosTab';

type Pestana = 'usuarios' | 'roles' | 'correos' | 'historial';

const PESTANAS: { id: Pestana; label: string; icon: typeof Users }[] = [
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'roles', label: 'Roles y permisos', icon: KeyRound },
  { id: 'correos', label: 'Correos', icon: Mail },
  { id: 'historial', label: 'Historial', icon: History },
];

export function ConfiguracionPage() {
  const [pestana, setPestana] = useState<Pestana>('usuarios');
  // El subrayado de la pestaña activa se desliza hasta la elegida.
  const { ref, pos, listo } = useIndicador<HTMLDivElement>('[aria-selected="true"]', pestana);

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina>
      <TituloPagina icono={Settings} titulo="Configuración">
        <p className="bajada-pagina">
          Quién entra al portal y qué puede hacer. Los usuarios y roles vienen de Keycloak; los permisos de cada rol se definen aquí.
        </p>
      </TituloPagina>
      </BandaPagina>

      <div ref={ref} role="tablist" className="relative flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {pos && (
          <span
            aria-hidden
            className={cn('absolute h-0.5 rounded-full bg-brand-500', listo && 'transition-[left,width,top] duration-300 ease-[var(--ease-out)]')}
            style={{ left: pos.left, top: pos.top + pos.height - 2, width: pos.width }}
          />
        )}
        {PESTANAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn(
              // El subrayado lo dibuja el indicador de arriba; aquí solo el color.
              '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm font-semibold transition',
              pestana === id ? 'text-brand-600 dark:text-brand-400' : 'opacity-60 hover:opacity-100'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' && <UsuariosTab />}
      {pestana === 'roles' && <RolesTab />}
      {pestana === 'correos' && <CorreosTab />}
      {pestana === 'historial' && <HistorialTab />}
    </div>
  );
}
