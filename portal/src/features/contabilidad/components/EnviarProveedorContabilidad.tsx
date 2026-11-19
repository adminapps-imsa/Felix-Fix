import { useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2, Mail, Paperclip, Send, X } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Field, Textarea } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiContabilidad from '../../../api/contabilidad';
import { formatFecha } from '../../../lib/formatters';
import type { DocumentoContabilidadDetalle, VistaPreviaCorreoProveedor } from '../../../types/contabilidad';

const MAX_CORREOS = 20;
const MAX_COMENTARIO = 2000;
const MAX_ADJUNTOS = 10;
const TIPOS_ADJUNTO = '.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
const EXT_PERMITIDAS = /\.(pdf|xlsx|xls|jpe?g|png|webp)$/i;
const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
// Validación básica en el navegador; el backend valida de nuevo.
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Contabilidad envía al proveedor la nota de débito (2026-11-18): escribe los
 * correos (se proponen los usados antes en el reclamo) y un comentario que va
 * dentro del correo. Antes de enviar ve el correo tal como le llega.
 */
export function EnviarProveedorContabilidad({ doc, onEnviado }: { doc: DocumentoContabilidadDetalle; onEnviado: (d: DocumentoContabilidadDetalle) => void }) {
  const [correos, setCorreos] = useState<string[]>(doc.CorreosProveedor);
  const [texto, setTexto] = useState('');
  const [comentario, setComentario] = useState('');
  // Otros archivos que van en el correo además del PDF del documento (no se guardan en el reclamo).
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verCorreo, setVerCorreo] = useState(false);
  const envio = doc.EnvioProveedor;

  useEffect(() => setCorreos(doc.CorreosProveedor), [doc.CorreosProveedor]);

  /** Agrega lo escrito (uno o varios separados por coma, punto y coma o espacio). Devuelve la lista nueva o null si hay error. */
  const agregar = (): string[] | null => {
    const nuevos = texto
      .split(/[\s,;]+/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    if (!nuevos.length) return correos;
    const invalidos = nuevos.filter((c) => !CORREO_RE.test(c));
    if (invalidos.length) {
      setError(`Correo inválido: ${invalidos.join(', ')}`);
      return null;
    }
    const lista = [...new Set([...correos, ...nuevos])];
    if (lista.length > MAX_CORREOS) {
      setError(`Máximo ${MAX_CORREOS} correos.`);
      return null;
    }
    setCorreos(lista);
    setTexto('');
    setError(null);
    return lista;
  };

  const agregarArchivos = (lista: FileList | null) => {
    if (!lista?.length) return;
    const nuevos = [...lista];
    const malos = nuevos.filter((f) => !EXT_PERMITIDAS.test(f.name));
    if (malos.length) return setError(`Solo fotos (JPG, PNG o WebP), Excel o PDF. No se puede adjuntar: ${malos.map((f) => f.name).join(', ')}`);
    // El mismo archivo (nombre y tamaño) no se agrega dos veces.
    const clave = (f: File) => `${f.name}|${f.size}`;
    const juntos = [...adjuntos, ...nuevos.filter((f) => !adjuntos.some((a) => clave(a) === clave(f)))];
    if (juntos.length > MAX_ADJUNTOS) return setError(`Máximo ${MAX_ADJUNTOS} archivos además del PDF del documento.`);
    setAdjuntos(juntos);
    setError(null);
  };

  const abrirCorreo = () => {
    const lista = agregar();
    if (!lista) return;
    if (!lista.length) return setError('Escribe al menos un correo del proveedor.');
    setVerCorreo(true);
  };

  // Con la respuesta del proveedor ya registrada no se puede enviar (el backend responde 409):
  // solo se muestra cuándo se envió. Para reenviar, primero «Quitar respuesta».
  if (doc.Estado !== 'pendiente') {
    return (
      <GlassCard className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Send size={17} /> Enviar al proveedor
        </h2>
        {envio ? (
          <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm">
            Enviado {envio.veces > 1 ? `${envio.veces} veces; la última ` : ''}el {envio.at ? formatFecha(envio.at) : '—'}
            {envio.porNombre && <> por <strong className="font-semibold">{envio.porNombre}</strong></>}
            {envio.para && <span className="block break-words text-xs opacity-75">A: {envio.para}</span>}
          </div>
        ) : (
          <p className="text-sm opacity-70">No se envió desde el portal.</p>
        )}
        <p className="text-xs opacity-60">El proveedor ya respondió. Para volver a enviarlo, primero quita la respuesta.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Send size={17} /> Enviar al proveedor
        </h2>
        <p className="text-sm opacity-70">El proveedor recibe el PDF de este documento, sus productos y tu comentario. Te llega copia y su respuesta te llega a ti.</p>
      </div>

      {envio && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm">
          Enviado {envio.veces > 1 ? `${envio.veces} veces; la última ` : ''}el {envio.at ? formatFecha(envio.at) : '—'}
          {envio.porNombre && <> por <strong className="font-semibold">{envio.porNombre}</strong></>}
          {envio.para && <span className="block break-words text-xs opacity-75">A: {envio.para}</span>}
          {envio.comentario && <span className="mt-1 block whitespace-pre-line text-xs opacity-75">«{envio.comentario}»</span>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium opacity-85">
          <Mail size={14} /> Correos del proveedor
        </span>
        {correos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {correos.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.03] py-1 pl-3 pr-1.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
                {c}
                <button
                  type="button"
                  aria-label={`Quitar ${c}`}
                  className="grid h-5 w-5 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                  onClick={() => setCorreos((l) => l.filter((x) => x !== c))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
          <input
            type="text"
            inputMode="email"
            className="h-9 min-w-0 basis-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/50 sm:flex-1 sm:basis-auto dark:border-white/10 dark:bg-white/5"
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
          <Button variant="secondary" onClick={() => agregar()} disabled={!texto.trim()}>
            Agregar
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium opacity-85">
          <Paperclip size={14} /> Adjuntos <span className="text-xs font-normal opacity-60">(opcional)</span>
        </span>
        <p className="text-xs opacity-60">
          El PDF del documento ({doc.AdjuntoNombre}) siempre va. Puedes agregar otros archivos: fotos, Excel o PDF, hasta {MAX_ADJUNTOS}.
        </p>
        {adjuntos.length > 0 && (
          <ul className="flex flex-col gap-1">
            {adjuntos.map((f) => (
              <li key={`${f.name}|${f.size}`} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-1.5 text-sm dark:border-white/10">
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip size={13} className="shrink-0 opacity-60" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-xs opacity-50">{tamano(f.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${f.name}`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                  onClick={() => setAdjuntos((l) => l.filter((x) => x !== f))}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {adjuntos.length < MAX_ADJUNTOS && (
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-black/20 px-4 py-2 text-sm font-semibold hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.05]">
            <FilePlus2 size={15} /> Agregar archivos
            <input
              type="file"
              multiple
              accept={TIPOS_ADJUNTO}
              className="sr-only"
              onChange={(e) => {
                agregarArchivos(e.target.files);
                e.target.value = ''; // permite volver a elegir el mismo archivo después de quitarlo
              }}
            />
          </label>
        )}
      </div>

      <Field label="Comentario para el proveedor" opcional>
        <Textarea
          rows={4}
          maxLength={MAX_COMENTARIO}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Va dentro del correo, arriba de los datos del documento."
        />
      </Field>

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="flex justify-end">
        <Button onClick={abrirCorreo} disabled={doc.AdjuntoIdx === null}>
          <Send size={15} /> {envio ? 'Ver correo y reenviar' : 'Ver correo y enviar'}
        </Button>
      </div>

      {verCorreo && (
        <ModalCorreo
          doc={doc}
          datos={{ correos, comentario }}
          adjuntos={adjuntos}
          onClose={() => setVerCorreo(false)}
          onEnviado={(d) => {
            onEnviado(d);
            setComentario('');
            setAdjuntos([]);
          }}
        />
      )}
    </GlassCard>
  );
}

function ModalCorreo({
  doc,
  datos,
  adjuntos,
  onClose,
  onEnviado,
}: {
  doc: DocumentoContabilidadDetalle;
  datos: apiContabilidad.DatosCorreoProveedor;
  adjuntos: File[];
  onClose: () => void;
  onEnviado: (d: DocumentoContabilidadDetalle) => void;
}) {
  const [vista, setVista] = useState<VistaPreviaCorreoProveedor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [rechazados, setRechazados] = useState<string[] | null>(null);
  const avisos = useAvisos();

  useEffect(() => {
    apiContabilidad
      .vistaPreviaCorreoProveedor(doc.DocumentoId, datos, adjuntos)
      .then(setVista)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo armar el correo.'));
    // Se arma una vez al abrir, con los datos de ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bloqueado = !vista || !vista.configurado || vista.avisos.length > 0;

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const { envio, ...d } = await apiContabilidad.enviarCorreoProveedor(doc.DocumentoId, datos, adjuntos);
      onEnviado(d);
      if (envio?.rechazados?.length) setRechazados(envio.rechazados);
      else {
        onClose();
        avisos.ok(`${doc.NumeroDocumento || 'Documento'} enviado al proveedor.`);
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
            <Send size={15} /> {enviando ? 'Enviando…' : `Enviar a ${datos.correos.length} correo${datos.correos.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {!vista && !error && (
        <div role="status" aria-label="Armando el correo…" className="flex flex-col gap-3">
          <Esqueleto className="h-24 w-full rounded-xl" />
          <Esqueleto className="h-[40vh] w-full rounded-xl" />
        </div>
      )}
      {rechazados && (
        <div className="mb-3 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            El correo se envió, pero el servidor rechazó {rechazados.length === 1 ? 'esta dirección' : 'estas direcciones'}: <strong className="break-words">{rechazados.join(', ')}</strong>.
          </span>
        </div>
      )}
      {error && <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {vista && (
        <div className="flex flex-col gap-3">
          {!vista.configurado && (
            <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>El envío de correos todavía no está configurado en el servidor. Puedes ver el correo, pero aún no se puede enviar.</span>
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
            <dd className="break-words font-medium">{vista.para.join(', ') || '—'}</dd>
            <dt className="opacity-60">Copia</dt>
            <dd className="break-words">{vista.cc.length ? vista.cc.join(', ') : '—'}</dd>
            <dt className="opacity-60">Responder a</dt>
            <dd className="break-words">{vista.responderA || '—'}</dd>
            <dt className="opacity-60">Asunto</dt>
            <dd className="break-words font-medium">{vista.asunto}</dd>
            <dt className="opacity-60">Adjuntos</dt>
            <dd className="flex flex-wrap gap-1.5">
              {vista.adjuntos.length ? (
                vista.adjuntos.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                    <Paperclip size={12} /> {a}
                  </span>
                ))
              ) : (
                <span className="opacity-60">Ninguno</span>
              )}
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
