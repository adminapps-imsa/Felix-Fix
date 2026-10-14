import { useState } from 'react';
import { History, KeyRound, Settings, Users } from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { cn } from '../../../lib/cn';
import { UsuariosTab } from '../components/UsuariosTab';
import { RolesTab } from '../components/RolesTab';
import { HistorialTab } from '../components/HistorialTab';

type Pestana = 'usuarios' | 'roles' | 'historial';

const PESTANAS: { id: Pestana; label: string; icon: typeof Users }[] = [
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'roles', label: 'Roles y permisos', icon: KeyRound },
  { id: 'historial', label: 'Historial', icon: History },
];

export function ConfiguracionPage() {
  const [pestana, setPestana] = useState<Pestana>('usuarios');

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina>
      <TituloPagina icono={Settings} titulo="Configuración">
        <p className="bajada-pagina">
          Quién entra al portal y qué puede hacer. Los usuarios y roles vienen de Keycloak; los permisos de cada rol se definen aquí.
        </p>
      </TituloPagina>
      </BandaPagina>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {PESTANAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold transition',
              pestana === id ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent opacity-60 hover:opacity-100'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' && <UsuariosTab />}
      {pestana === 'roles' && <RolesTab />}
      {pestana === 'historial' && <HistorialTab />}
    </div>
  );
}
