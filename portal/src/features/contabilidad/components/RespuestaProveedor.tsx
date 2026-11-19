import { useState } from 'react';
import { CheckCircle2, Download, FileUp, MessageSquareReply, Trash2, XCircle } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Field, Input } from '../../../components/ui/Input';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError, guardarBlob } from '../../../api/client';
import * as apiContabilidad from '../../../api/contabilidad';
import { formatFecha } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';
import type { DocumentoContabilidadDetalle, RespuestaProveedor as Respuesta } from '../../../types/contabilidad';
import { ConfirmModal } from '../../reclamos/components/ConfirmModal';

const ACEPTA = 'application/pdf,image/jpeg,image/png,image/webp';
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const REGISTRO_SAP_RE = /^[A-Z0-9-]{4,20}$/i;

/** Número que pide cada respuesta: nota de crédito si aprobó, registro SAP si no (igual que el backend). */
const NOMBRE_NUMERO: Record<Respuesta, string> = { aprobado: 'número de nota de crédito', no_aprobado: 'número de registro SAP' };
const ETIQUETA_NUMERO: Record<Respuesta, string> = { aprobado: 'Nota de crédito', no_aprobado: 'Registro SAP' };

const OPCIONES: Array<{ id: Respuesta; titulo: string; detalle: string }> = [
  { id: 'aprobado', titulo: 'Aprobado', detalle: 'El proveedor aceptó: número de nota de crédito y, si lo tienes, el documento.' },
  { id: 'no_aprobado', titulo: 'No aprobado', detalle: 'El proveedor no aceptó: número de registro SAP y, si lo tienes, el documento.' },
];

/**
 * Respuesta del proveedor a la nota de débito (2026-11-18). Contabilidad elige:
 * Aprobado (número de nota de crédito) o No aprobado (número de registro SAP),
 * el número obligatorio y el documento opcional (2026-11-19).
 * Con la respuesta el documento deja de estar pendiente. Se puede quitar si fue un error.
 */
export function RespuestaProveedor({ doc, onActualizado }: { doc: DocumentoContabilidadDetalle; onActualizado: (d: DocumentoContabilidadDetalle) => void }) {
  const avisos = useAvisos();
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [registroSap, setRegistroSap] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);
  const r = doc.Respuesta;

  const descargar = () =>
    apiContabilidad
      .descargarArchivoRespuesta(doc.DocumentoId)
      .then((b) => guardarBlob(b, r?.archivoNombre || 'respuesta'))
      .catch(() => avisos.error('No se pudo descargar el archivo.'));

  if (r) {
    const aprobado = r.estado === 'aprobado';
    return (
      <GlassCard className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <MessageSquareReply size={17} /> Respuesta del proveedor
        </h2>
        <div className={cn('flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm', aprobado ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10')}>
          <span className={cn('flex items-center gap-2 font-bold', aprobado ? 'text-success' : 'text-danger')}>
            {aprobado ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {aprobado ? 'Aprobado por el proveedor' : 'No aprobado por el proveedor'}
          </span>
          {r.registroSap && (
            <span>
              {ETIQUETA_NUMERO[r.estado]}: <strong className="font-mono">{r.registroSap}</strong>
            </span>
          )}
          <span className="text-xs opacity-75">
            Registrado el {r.at ? formatFecha(r.at) : '—'}
            {r.porNombre && <> por {r.porNombre}</>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.tieneArchivo && (
            <Button variant="secondary" onClick={descargar}>
              <Download size={15} /> {aprobado ? 'Nota de crédito' : 'Documento SAP'}
              {r.archivoNombre && <span className="max-w-[14rem] truncate font-normal opacity-70">· {r.archivoNombre}</span>}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setQuitar(true)}>
            <Trash2 size={15} /> Quitar respuesta
          </Button>
        </div>
        {quitar && (
          <ConfirmModal
            titulo="Quitar la respuesta del proveedor"
            textoConfirmar="Quitar la respuesta"
            onClose={() => setQuitar(false)}
            onConfirm={async () => {
              onActualizado(await apiContabilidad.quitarRespuesta(doc.DocumentoId));
              avisos.ok('Se quitó la respuesta del proveedor.');
              setQuitar(false);
            }}
          >
            Se borra la respuesta (y su documento, si tiene), y el documento vuelve a quedar pendiente. Úsalo si se registró por error.
          </ConfirmModal>
        )}
      </GlassCard>
    );
  }

  const elegirArchivo = (f: File | null) => {
    setError(null);
    if (f && !TIPOS.includes(f.type)) {
      setArchivo(null);
      return setError('El archivo debe ser un PDF o una foto (JPG, PNG o WebP).');
    }
    setArchivo(f);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respuesta) return setError('Elige si el proveedor aprobó o no.');
    const registro = registroSap.trim().toUpperCase();
    const nombre = NOMBRE_NUMERO[respuesta];
    if (!registro) return setError(`Escribe el ${nombre}.`);
    if (!REGISTRO_SAP_RE.test(registro)) return setError(`El ${nombre} solo lleva números y letras, de 4 a 20.`);
    setGuardando(true);
    setError(null);
    try {
      onActualizado(await apiContabilidad.registrarRespuesta(doc.DocumentoId, { respuesta, registroSap: registro, archivo }));
      avisos.ok(respuesta === 'aprobado' ? 'Respuesta registrada: aprobado.' : 'Respuesta registrada: no aprobado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la respuesta.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <MessageSquareReply size={17} /> Respuesta del proveedor
        </h2>
        <p className="text-sm opacity-70">Cuando el proveedor conteste, registra lo que respondió. El documento deja de estar pendiente.</p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Respuesta del proveedor" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPCIONES.map((o) => {
            const activo = respuesta === o.id;
            const bien = o.id === 'aprobado';
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => {
                  setRespuesta(o.id);
                  setError(null);
                }}
                className={cn(
                  'flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  activo
                    ? bien
                      ? 'border-success/50 bg-success/10'
                      : 'border-danger/50 bg-danger/10'
                    : 'border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]'
                )}
              >
                <span className={cn('flex items-center gap-2 font-bold', activo && (bien ? 'text-success' : 'text-danger'))}>
                  {bien ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {o.titulo}
                </span>
                <span className="text-xs opacity-70">{o.detalle}</span>
              </button>
            );
          })}
        </div>

        {respuesta && (
          <Field label={respuesta === 'aprobado' ? 'Número de nota de crédito' : 'Número de registro SAP'}>
            <Input value={registroSap} onChange={(e) => setRegistroSap(e.target.value)} maxLength={20} placeholder="Ej. 5100012345" className="font-mono" />
          </Field>
        )}

        {respuesta && (
          <Field label={respuesta === 'aprobado' ? 'Documento de la nota de crédito' : 'Documento SAP'} opcional>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-black/15 px-4 py-3 text-sm hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]">
              <FileUp size={18} className="shrink-0 opacity-70" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{archivo ? archivo.name : 'Elegir archivo'}</span>
                <span className="block text-xs opacity-60">PDF o foto (JPG, PNG o WebP)</span>
              </span>
              <input type="file" accept={ACEPTA} className="sr-only" onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        )}

        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {respuesta && (
          <div className="flex justify-end">
            <Button type="submit" estado={guardando ? 'cargando' : null}>
              Guardar respuesta
            </Button>
          </div>
        )}
      </form>
    </GlassCard>
  );
}
