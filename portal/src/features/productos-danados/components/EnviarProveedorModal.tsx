import { useEffect, useState } from 'react';
import { AlertTriangle, Image, Paperclip, Send } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAvisos } from '../../../components/ui/Avisos';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { ApiError } from '../../../api/client';
import * as apiProductosDanados from '../../../api/productosDanados';
import type { ReporteDetalle, VistaPreviaCorreo } from '../../../types/productoDanado';

/**
 * Antes de enviar, la compradora ve el correo tal como le llegará al
 * proveedor: destinatarios, copia, adjuntos y el mensaje con la foto.
 */
export function EnviarProveedorModal({
  reporteId,
  onClose,
  onEnviado,
}: {
  reporteId: number;
  onClose: () => void;
  onEnviado: (r: ReporteDetalle) => void;
}) {
  const [vista, setVista] = useState<VistaPreviaCorreo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Direcciones que el servidor de correo rechazó: se avisa en vez de cerrar como si todo saliera bien.
  const [rechazados, setRechazados] = useState<string[] | null>(null);
  const avisos = useAvisos();

  useEffect(() => {
    apiProductosDanados
      .vistaPreviaCorreo(reporteId)
      .then(setVista)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo armar el correo.'));
  }, [reporteId]);

  const bloqueado = !vista || !vista.configurado || vista.avisos.length > 0;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const { envio, ...reporte } = await apiProductosDanados.enviarAlProveedor(reporteId);
      onEnviado(reporte);
      // Con direcciones rechazadas el aviso queda en el modal (hay que revisarlas); si no, se confirma con un aviso flotante.
      if (envio?.rechazados?.length) setRechazados(envio.rechazados);
      else {
        onClose();
        avisos.ok(`Reporte #${reporteId} enviado al proveedor.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el correo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      title="Enviar al proveedor"
      onClose={onClose}
      size="xl"
      layer="z-[60]"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            {rechazados ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button onClick={enviar} disabled={bloqueado || rechazados !== null} estado={enviando ? 'cargando' : null}>
            <Send size={15} /> {enviando ? 'Enviando…' : `Enviar${vista ? ` a ${vista.para.length} correo${vista.para.length === 1 ? '' : 's'}` : ''}`}
          </Button>
        </>
      }
    >
      {/* Mientras se arma el correo: la forma de los datos y de la vista previa. */}
      {!vista && !error && (
        <div role="status" aria-label="Armando el correo…" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/10">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3">
                <Esqueleto className="h-3.5 w-20 shrink-0" />
                <Esqueleto className={i % 2 ? 'h-3.5 w-1/3' : 'h-3.5 w-1/2'} />
              </div>
            ))}
          </div>
          <Esqueleto className="h-3 w-40" />
          <Esqueleto className="h-[40vh] w-full rounded-xl" />
        </div>
      )}
      {rechazados && (
        <div className="mb-3 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            El correo se envió, pero el servidor rechazó {rechazados.length === 1 ? 'esta dirección' : 'estas direcciones'}:{' '}
            <strong className="break-words">{rechazados.join(', ')}</strong>. Revisa los correos del proveedor.
          </span>
        </div>
      )}
      {error && <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {vista && (
        <div className="flex flex-col gap-3">
          {!vista.configurado && (
            <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>
                El envío de correos todavía no está configurado en el servidor. Puedes revisar cómo se verá el correo, pero aún no se puede enviar.
              </span>
            </div>
          )}
          {vista.avisos.map((a) => (
            <div key={a} className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {a}
            </div>
          ))}

          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-black/10 p-3 text-sm dark:border-white/10">
            <dt className="opacity-60">Para</dt>
            <dd className="break-words font-medium">{vista.para.length ? vista.para.join(', ') : '—'}</dd>
            <dt className="opacity-60">Copia</dt>
            <dd className="break-words">{vista.cc.length ? vista.cc.join(', ') : '—'}</dd>
            <dt className="opacity-60">Responder a</dt>
            <dd className="break-words">{vista.responderA || '—'}</dd>
            <dt className="opacity-60">Asunto</dt>
            <dd className="break-words font-medium">{vista.asunto}</dd>
            <dt className="opacity-60">Adjuntos</dt>
            <dd className="flex flex-wrap gap-1.5">
              {vista.conFoto && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                  <Image size={12} /> Foto de evidencia
                </span>
              )}
              {vista.adjuntos.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                  <Paperclip size={12} /> {a}
                </span>
              ))}
              {!vista.conFoto && !vista.adjuntos.length && <span className="opacity-60">Ninguno</span>}
            </dd>
          </dl>

          <div className="etiqueta">Así lo verá el proveedor</div>
          {/* sandbox sin permisos: el HTML del correo no puede ejecutar nada. */}
          <iframe title="Vista previa del correo" sandbox="" srcDoc={vista.html} className="h-[55vh] w-full rounded-xl border border-black/10 bg-white dark:border-white/10" />
        </div>
      )}
    </Modal>
  );
}
