import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Avisos flotantes («toasts») para confirmar una acción: «Guardado»,
 * «Enviado al proveedor», «Reclamo devuelto»… Aparecen arriba, justo debajo
 * del menú (a la derecha en escritorio, al centro en celular), para no tapar
 * las barras fijas de abajo (Guardar, Crear…). Se van solos y se pueden cerrar.
 *   const avisos = useAvisos();  avisos.ok('Guardado.');  avisos.error('No se pudo…');
 */

type Tipo = 'ok' | 'error' | 'info';
interface Aviso {
  id: number;
  tipo: Tipo;
  texto: string;
  saliendo?: boolean;
}

interface Api {
  ok: (texto: string) => void;
  error: (texto: string) => void;
  info: (texto: string) => void;
}

const Contexto = createContext<Api | null>(null);
const DURACION: Record<Tipo, number> = { ok: 4000, info: 5000, error: 7000 };
const MAXIMO = 3;

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => {
    // Primero sale (animación de 160 ms) y después se borra.
    setAvisos((a) => a.map((x) => (x.id === id ? { ...x, saliendo: true } : x)));
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 180);
  }, []);

  const agregar = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = siguiente.current++;
      setAvisos((a) => [...a.slice(-(MAXIMO - 1)), { id, tipo, texto }]);
      setTimeout(() => quitar(id), DURACION[tipo]);
    },
    [quitar]
  );

  const api = useMemo<Api>(() => ({ ok: (t) => agregar('ok', t), error: (t) => agregar('error', t), info: (t) => agregar('info', t) }), [agregar]);

  return (
    <Contexto.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[300] flex flex-col items-center gap-2 px-4 sm:items-end"
        >
          {avisos.map((a) => (
            <AvisoFlotante key={a.id} aviso={a} onCerrar={() => quitar(a.id)} />
          ))}
        </div>,
        document.body
      )}
    </Contexto.Provider>
  );
}

const ICONO: Record<Tipo, React.ReactNode> = {
  ok: <CheckCircle2 size={18} className="text-success" aria-hidden />,
  error: <XCircle size={18} className="text-danger" aria-hidden />,
  info: <Info size={18} className="text-brand-600 dark:text-brand-400" aria-hidden />,
};

function AvisoFlotante({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  // Al pasar el ratón no se va (para alcanzar a leerlo); el temporizador de afuera igual lo quita después.
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);
  return (
    <div
      role={aviso.tipo === 'error' ? 'alert' : 'status'}
      data-saliendo={aviso.saliendo ? 'true' : undefined}
      className={cn(
        'anim-aviso pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-black/5 bg-[var(--glass-bg)] px-4 py-3 text-sm shadow-[var(--shadow-elevada)] dark:border-white/10',
        !visible && 'opacity-0'
      )}
    >
      <span className="mt-px shrink-0">{ICONO[aviso.tipo]}</span>
      <p className="min-w-0 flex-1 leading-snug">{aviso.texto}</p>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="-m-1 shrink-0 rounded-full p-1 opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
        <X size={15} />
      </button>
    </div>
  );
}

/** Los avisos del portal. Fuera del proveedor no hace nada (no rompe pruebas ni pantallas sueltas). */
export function useAvisos(): Api {
  return useContext(Contexto) ?? { ok: () => {}, error: () => {}, info: () => {} };
}
