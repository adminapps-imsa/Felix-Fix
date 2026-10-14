import { useEffect, useState } from 'react';
import { Mail, Plus, Save, Send, X } from 'lucide-react';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';
import { formatFecha } from '../../../lib/formatters';
import { EnviarProveedorModal } from './EnviarProveedorModal';
import * as apiProductosDanados from '../../../api/productosDanados';
import type { ReporteDetalle } from '../../../types/productoDanado';

const MAX_CORREOS = 20;
// Validación básica en el navegador; el backend valida de nuevo.
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MINI_BOTON =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Correos del proveedor a los que se enviará el reporte (el envío se define
 * más adelante). Se pueden pegar varios a la vez separados por coma, punto y
 * coma o espacio. Los cambios se guardan con "Guardar correos".
 */
export function CorreosProveedor({
  reporte,
  editable,
  onActualizado,
}: {
  reporte: ReporteDetalle;
  editable: boolean;
  onActualizado: (r: ReporteDetalle) => void;
}) {
  const [correos, setCorreos] = useState<string[]>(reporte.CorreosProveedor);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const { puede } = useAuth();
  // El envío (y reenvío) al proveedor solo se hace mientras el reporte está Pendiente (el backend responde 409 si no).
  const puedeEnviar = puede(P.pdEnviar) && reporte.Estado === 'Pendiente';

  useEffect(() => setCorreos(reporte.CorreosProveedor), [reporte.CorreosProveedor]);

  const cambios = correos.join('|') !== reporte.CorreosProveedor.join('|');

  const agregar = () => {
    const nuevos = texto
      .split(/[\s,;]+/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    if (!nuevos.length) return;
    const invalidos = nuevos.filter((c) => !CORREO_RE.test(c));
    if (invalidos.length) {
      setError(`Correo inválido: ${invalidos.join(', ')}`);
      return;
    }
    const lista = [...new Set([...correos, ...nuevos])];
    if (lista.length > MAX_CORREOS) {
      setError(`Máximo ${MAX_CORREOS} correos por reporte.`);
      return;
    }
    setCorreos(lista);
    setTexto('');
    setError(null);
    setGuardado(false);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onActualizado(await apiProductosDanados.guardarCorreos(reporte.ReporteId, correos));
      setGuardado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los correos.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium opacity-70">
        <Mail size={14} /> Correos del proveedor
      </h3>

      {correos.length ? (
        <div className="flex flex-wrap gap-1.5">
          {correos.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.03] py-1 pl-3 pr-1.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
              {c}
              {editable && (
                <button
                  type="button"
                  aria-label={`Quitar ${c}`}
                  className="grid h-5 w-5 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                  onClick={() => {
                    setCorreos((l) => l.filter((x) => x !== c));
                    setGuardado(false);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm opacity-60">Sin correos todavía.</p>
      )}

      {editable && (
        <>
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
            <input
              type="text"
              inputMode="email"
              className="h-8 min-w-0 basis-full rounded-lg border border-black/10 bg-white/70 px-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/50 sm:flex-1 sm:basis-auto dark:border-white/10 dark:bg-white/5"
              placeholder="proveedor@empresa.com (puedes pegar varios separados por coma)"
              aria-label="Correo del proveedor"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregar();
                }
              }}
            />
            <button type="button" className={`${MINI_BOTON} border border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5`} onClick={agregar} disabled={!texto.trim()}>
              <Plus size={13} /> Agregar
            </button>
            <button
              type="button"
              className={`${MINI_BOTON} bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500`}
              onClick={guardar}
              disabled={!cambios || guardando}
            >
              <Save size={13} /> {guardando ? 'Guardando…' : 'Guardar correos'}
            </button>
          </div>
          {cambios && !guardando && <p className="text-xs text-warning">Hay cambios sin guardar.</p>}
          {guardado && !cambios && <p className="text-xs text-success">Correos guardados.</p>}
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      {(puedeEnviar || reporte.EnviadoProveedorAt) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-brand-500/5 px-3 py-2.5">
          <span className="min-w-0 flex-1 text-xs">
            {reporte.EnviadoProveedorAt ? (
              <>
                <strong className="text-success">Enviado al proveedor</strong> el {formatFecha(reporte.EnviadoProveedorAt)} por{' '}
                {reporte.EnviadoProveedorPorNombre || reporte.EnviadoProveedorPor}
                {reporte.EnviosProveedor > 1 && ` · ${reporte.EnviosProveedor} envíos`}
              </>
            ) : (
              <span className="opacity-70">Todavía no se ha enviado al proveedor.</span>
            )}
          </span>
          {puedeEnviar && (
            <button
              type="button"
              className={`${MINI_BOTON} bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500`}
              disabled={!reporte.CorreosProveedor.length || cambios}
              title={cambios ? 'Guarda los correos antes de enviar' : !reporte.CorreosProveedor.length ? 'Agrega un correo del proveedor' : undefined}
              onClick={() => setEnviar(true)}
            >
              <Send size={13} /> {reporte.EnviadoProveedorAt ? 'Reenviar al proveedor' : 'Enviar al proveedor'}
            </button>
          )}
        </div>
      )}

      {enviar && <EnviarProveedorModal reporteId={reporte.ReporteId} onClose={() => setEnviar(false)} onEnviado={onActualizado} />}
    </section>
  );
}
