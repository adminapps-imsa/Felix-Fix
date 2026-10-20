import { useEffect, useState } from 'react';
import { MessageSquareText, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAvisos } from '../../../components/ui/Avisos';
import { Field, Input, Textarea } from '../../../components/ui/Input';
import { Combobox } from '../../../components/ui/Combobox';
import { CampoFecha } from '../../../components/ui/CampoFecha';
import { SelectorOpciones } from '../../../components/ui/SelectorOpciones';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { formatFecha } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';
import type { CatalogosReclamo, ComentarioReclamo, Reclamo } from '../../../types/reclamo';
import { useTiendas } from '../../productos-danados/hooks/useTiendas';

// Devolución entre la compradora y quien creó el reclamo:
//   la compradora lo devuelve con un comentario (estado «Con comentario de compradora»),
//   quien lo creó corrige los datos, los documentos SAP y sus PDF, y lo reenvía.
// Las reglas las revisa el backend (src/domain/reclamo.js); aquí solo se guía.

const MIN_COMENTARIO = 5;

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mensajeError = (err: unknown, porDefecto: string) => (err instanceof ApiError ? err.message : porDefecto);

/**
 * Tarjeta de la devolución: el comentario de la compradora a la vista, qué
 * hacer, los botones de quien corrige y el historial de idas y vueltas.
 */
export function DevolucionReclamo({
  reclamo,
  puedeCorregir,
  onActualizado,
}: {
  reclamo: Reclamo;
  puedeCorregir: boolean;
  onActualizado: (r: Reclamo) => void;
}) {
  const [editar, setEditar] = useState(false);
  const [reenviar, setReenviar] = useState(false);
  const comentarios = reclamo.Comentarios ?? [];
  const devuelto = reclamo.Status === 'devuelto';
  const ultima = [...comentarios].reverse().find((c) => c.Tipo === 'devuelto');
  if (!devuelto && !comentarios.length) return null;
  const creador = reclamo.CreatedByNombre || reclamo.CreatedBy;

  return (
    <GlassCard className={cn('flex flex-col gap-4', devuelto && 'ring-2 ring-brand-500/40')}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Undo2 size={17} className={devuelto ? 'text-brand-600 dark:text-brand-400' : undefined} />
        {devuelto ? 'Devuelto para corregir' : 'Correcciones'}
      </h2>

      {devuelto && ultima && (
        <div className="rounded-xl border-l-4 border-brand-500 bg-brand-500/10 px-4 py-3 dark:border-brand-400">
          <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">
            {ultima.UsuarioNombre} · {formatFecha(ultima.Fecha)}
          </p>
          <p className="mt-1 whitespace-pre-line text-[0.9375rem]">{ultima.Texto}</p>
        </div>
      )}

      {devuelto &&
        (puedeCorregir ? (
          <>
            <ol className="flex flex-col gap-1.5 text-sm opacity-80">
              <li>1. Corrige los datos o los documentos SAP con «Corregir datos».</li>
              <li>2. Si cambiaste un documento SAP, sube su PDF en Adjuntos y quita el que ya no va.</li>
              <li>3. Pulsa «Reenviar a la compradora».</li>
            </ol>
            <div className="flex flex-wrap justify-end gap-2">
              {/* Amarillo y grande: es lo primero que tiene que hacer quien recibe el reclamo devuelto. */}
              <Button variant="aviso" tamano="grande" onClick={() => setEditar(true)}>
                <Pencil size={18} /> Corregir datos
              </Button>
              <Button onClick={() => setReenviar(true)}>
                <Send size={15} /> Reenviar a la compradora
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm opacity-70">
            Esperando que <strong className="font-semibold">{creador}</strong> lo corrija y lo reenvíe. Mientras tanto no se pueden decidir los productos.
          </p>
        ))}

      {comentarios.length > (devuelto ? 1 : 0) && <Historial comentarios={comentarios} />}

      {editar && <EditarDatosModal reclamo={reclamo} onClose={() => setEditar(false)} onGuardado={(r) => (onActualizado(r), setEditar(false))} />}
      {reenviar && <ReenviarModal reclamo={reclamo} onClose={() => setReenviar(false)} onReenviado={(r) => (onActualizado(r), setReenviar(false))} />}
    </GlassCard>
  );
}

function Historial({ comentarios }: { comentarios: ComentarioReclamo[] }) {
  return (
    <details className="group" open={comentarios.length <= 4}>
      <summary className="etiqueta cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        Historial ({comentarios.length}) <span className="opacity-60 group-open:hidden">· ver</span>
      </summary>
      <ol className="mt-3 flex flex-col gap-3 border-l-2 border-black/10 pl-4 dark:border-white/15">
        {comentarios.map((c) => (
          <li key={c.ComentarioId} className="relative text-sm">
            <span
              aria-hidden
              className={cn('absolute -left-[1.3rem] top-1 size-2.5 rounded-full', c.Tipo === 'devuelto' ? 'bg-brand-500' : 'bg-success')}
            />
            <p className="text-xs opacity-60">
              <strong className="font-semibold">{c.Tipo === 'devuelto' ? 'Devuelto por' : 'Corregido y reenviado por'} {c.UsuarioNombre}</strong> ·{' '}
              {formatFecha(c.Fecha)}
            </p>
            {c.Texto ? <p className="mt-0.5 whitespace-pre-line">{c.Texto}</p> : <p className="mt-0.5 opacity-50">Sin comentario.</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Compradora: devolver el reclamo a quien lo creó, con lo que hay que corregir (obligatorio). */
export function DevolverModal({ reclamo, onClose, onDevuelto }: { reclamo: Reclamo; onClose: () => void; onDevuelto: (r: Reclamo) => void }) {
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();
  const creador = reclamo.CreatedByNombre || reclamo.CreatedBy;
  const corto = comentario.trim().length < MIN_COMENTARIO;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (corto) return setError('Escribe qué hay que corregir para que sepa qué arreglar.');
    setBusy(true);
    setError(null);
    try {
      onDevuelto(await apiReclamos.devolverReclamo(reclamo.Token, comentario.trim()));
      avisos.ok(`Reclamo ${reclamo.Numero} devuelto a ${creador}.`);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo devolver el reclamo.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Devolver ${reclamo.Numero}`} onClose={onClose} dismissible={!comentario.trim()}>
      <form onSubmit={enviar} className="flex flex-col gap-4 text-sm">
        <p>
          El reclamo vuelve a <strong className="font-semibold">{creador}</strong> para que lo corrija. Le llega un correo con tu comentario. Las
          decisiones de productos que ya tomaste se conservan.
        </p>
        <Field label="¿Qué hay que corregir?">
          <Textarea
            required
            autoFocus
            rows={4}
            minLength={MIN_COMENTARIO}
            maxLength={1000}
            placeholder="Por ejemplo: el documento SAP 4904151684 no es el de esta factura; revisa la marca."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </Field>
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={corto} estado={busy ? 'cargando' : null}>
            <Undo2 size={15} /> {busy ? 'Devolviendo…' : `Devolver a ${creador}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReenviarModal({ reclamo, onClose, onReenviado }: { reclamo: Reclamo; onClose: () => void; onReenviado: (r: Reclamo) => void }) {
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onReenviado(await apiReclamos.reenviarReclamo(reclamo.Token, comentario.trim()));
      avisos.ok(`Reclamo ${reclamo.Numero} reenviado a la compradora.`);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo reenviar el reclamo.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Reenviar ${reclamo.Numero}`} onClose={onClose} dismissible={!comentario.trim()}>
      <form onSubmit={enviar} className="flex flex-col gap-4 text-sm">
        <p>Vuelve a la compradora como pendiente, y le llega un correo avisando que ya está corregido.</p>
        <Field label="Respuesta para la compradora" opcional>
          <Textarea
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder="Por ejemplo: cambié el documento SAP y subí su PDF."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </Field>
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" estado={busy ? 'cargando' : null}>
            <Send size={15} /> {busy ? 'Reenviando…' : 'Reenviar a la compradora'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Quien lo creó corrige los datos del formulario y los documentos SAP. El origen y los productos no cambian. */
function EditarDatosModal({ reclamo, onClose, onGuardado }: { reclamo: Reclamo; onClose: () => void; onGuardado: (r: Reclamo) => void }) {
  const tiendas = useTiendas();
  const [cat, setCat] = useState<CatalogosReclamo | null>(null);
  const [errorCat, setErrorCat] = useState(false);
  const [campos, setCampos] = useState({
    sucursal: reclamo.Sucursal || '',
    numeroEmbarqueFactura: reclamo.NumeroEmbarqueFactura || '',
    fechaRegistro: reclamo.FechaRegistro?.slice(0, 10) || '',
    fechaLlegadaMercancia: reclamo.FechaLlegadaMercancia?.slice(0, 10) || '',
    mundo: reclamo.Mundo || '',
    departamento: reclamo.Departamento || '',
    marca: reclamo.Marca || '',
    proveedor: reclamo.Proveedor || '',
    compradora: reclamo.Compradora || '',
    division: reclamo.Division || '',
  });
  const [docs, setDocs] = useState<string[]>(reclamo.SapDocs.length ? reclamo.SapDocs : ['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();
  const set = (k: keyof typeof campos, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const cedi = reclamo.Origen === 'cedi';

  const cargarCatalogos = () => {
    setErrorCat(false);
    apiReclamos
      .listarCatalogos()
      .then(setCat)
      .catch(() => setErrorCat(true));
  };
  useEffect(cargarCatalogos, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onGuardado(await apiReclamos.corregirDatosReclamo(reclamo.Token, { ...campos, sapDocs: docs.map((d) => d.trim()).filter(Boolean) }));
      avisos.ok(`Datos de ${reclamo.Numero} corregidos.`);
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron guardar los cambios.'));
      setBusy(false);
    }
  };

  const opciones = (lista: keyof CatalogosReclamo) => (cat && Array.isArray(cat[lista]) ? (cat[lista] as string[]) : []);

  return (
    <Modal title={`Corregir ${reclamo.Numero}`} onClose={onClose} wide dismissible={false}>
      <form onSubmit={guardar} className="flex flex-col gap-5 text-sm">
        <p className="opacity-75">
          Corrige lo que la compradora indicó. El origen ({cedi ? 'CEDI' : 'Tienda'}), el tipo y los productos del Excel no cambian.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cedi ? (
            <Field label="División" grupo idEtiqueta="corregir-division">
              <SelectorOpciones
                required
                etiquetaId="corregir-division"
                value={campos.division}
                onChange={(v) => set('division', v)}
                opciones={opciones('divisiones')}
                error={errorCat ? "No se pudieron cargar las divisiones." : null}
                onReintentar={cargarCatalogos}
              />
            </Field>
          ) : (
            <Field label="Sucursal">
              <Input list="corregir-tiendas" required value={campos.sucursal} onChange={(e) => set('sucursal', e.target.value)} maxLength={150} />
              <datalist id="corregir-tiendas">
                {tiendas.map((t) => (
                  <option key={t.TiendaId} value={t.Nombre} />
                ))}
              </datalist>
            </Field>
          )}
          <Field label={cedi ? 'Factura / Embarque' : 'N° embarque / factura'} opcional>
            <Input value={campos.numeroEmbarqueFactura} onChange={(e) => set('numeroEmbarqueFactura', e.target.value)} maxLength={100} />
          </Field>
          <Field label="Proveedor">
            <Combobox required value={campos.proveedor} onChange={(v) => set('proveedor', v)} opciones={opciones('proveedores')} maxLength={200} />
          </Field>
          <Field label="Marca">
            <Combobox required value={campos.marca} onChange={(v) => set('marca', v)} opciones={opciones('marcas')} maxLength={100} />
          </Field>
          <Field label="Mundo">
            <Combobox required value={campos.mundo} onChange={(v) => set('mundo', v)} opciones={opciones('mundos')} maxLength={100} />
          </Field>
          <Field label="Departamento">
            <Combobox required value={campos.departamento} onChange={(v) => set('departamento', v)} opciones={opciones('departamentos')} maxLength={100} />
          </Field>
          <Field label="Compradora">
            <Combobox required value={campos.compradora} onChange={(v) => set('compradora', v)} opciones={opciones('compradoras')} maxLength={150} />
          </Field>
          <Field label="Fecha de registro">
            <CampoFecha required value={campos.fechaRegistro} onChange={(v) => set('fechaRegistro', v)} />
          </Field>
          <Field label="Llegada de la mercancía">
            <CampoFecha required max={hoyIso()} value={campos.fechaLlegadaMercancia} onChange={(v) => set('fechaLlegadaMercancia', v)} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">Documentos SAP</legend>
          {docs.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Documento SAP ${i + 1}`}
                inputMode="numeric"
                required={i === 0}
                value={d}
                maxLength={50}
                onChange={(e) => setDocs((ds) => ds.map((x, j) => (j === i ? e.target.value : x)))}
                className="font-mono"
              />
              {docs.length > 1 && (
                <Button type="button" variant="ghost" aria-label={`Quitar el documento ${i + 1}`} onClick={() => setDocs((ds) => ds.filter((_, j) => j !== i))}>
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
          ))}
          {docs.length < 50 && (
            <Button type="button" variant="ghost" className="self-start text-brand-600 dark:text-brand-400" onClick={() => setDocs((ds) => [...ds, ''])}>
              <Plus size={15} /> Agregar documento
            </Button>
          )}
          <p className="flex items-start gap-1.5 text-xs opacity-65">
            <MessageSquareText size={14} className="mt-px shrink-0" aria-hidden />
            Si cambias un documento, después sube su PDF en Adjuntos y quita el del documento anterior: al reenviar se revisa que cada documento tenga su PDF.
          </p>
        </fieldset>

        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" estado={busy ? 'cargando' : null}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
