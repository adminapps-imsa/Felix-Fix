import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ClipboardList, FileText, Landmark, Send, Trash2, XCircle } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { BandaPagina } from '../../../components/ui/TituloPagina';
import { Dato, SeccionDatos } from '../../../components/ui/DatosDetalle';
import { RutaCaso, type PasoRuta } from '../../../components/ui/RutaCaso';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { formatFecha } from '../../../lib/formatters';
import type { Reclamo, ReclamoLinea } from '../../../types/reclamo';
import { StatusReclamoBadge } from '../components/Badges';
import { ProductosSection } from '../components/ProductosSection';
import { AdjuntosSection } from '../components/AdjuntosSection';
import { ConfirmModal } from '../components/ConfirmModal';
import { usePermisosReclamos } from '../lib/usePermisosReclamos';
import { TIPO_LABEL, formatFechaCorta } from '../lib/tipos';

export function ReclamoDetallePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const aviso = (location.state as { aviso?: string } | null)?.aviso;
  const permisos = usePermisosReclamos();
  const puedeDecidir = Boolean(permisos?.puedeDecidir);
  const puedeEnviarContabilidad = Boolean(permisos?.puedeEnviarContabilidad);
  const puedeEliminar = Boolean(permisos?.puedeEliminar);

  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [lineas, setLineas] = useState<ReclamoLinea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const cargar = useCallback(() => {
    setError(null);
    Promise.all([apiReclamos.obtenerReclamo(token), apiReclamos.obtenerLineas(token)])
      .then(([r, ls]) => {
        setReclamo(r);
        setLineas(ls);
      })
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? 'El reclamo no existe o fue eliminado.' : 'No se pudo cargar el reclamo.'));
  }, [token]);

  useEffect(cargar, [cargar]);

  const actualizarLinea = (l: ReclamoLinea) => {
    setLineas((ls) => ls.map((x) => (x.Posicion === l.Posicion ? l : x)));
    // El encabezado lleva el conteo de pendientes.
    apiReclamos.obtenerReclamo(token).then(setReclamo).catch(() => {});
  };
  const actualizarLineas = (ls: ReclamoLinea[]) => {
    setLineas(ls);
    apiReclamos.obtenerReclamo(token).then(setReclamo).catch(() => {});
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BandaPagina>
          <BackLink />
        </BandaPagina>
        <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      </div>
    );
  }
  if (!reclamo) return <p className="text-sm opacity-60">Cargando…</p>;

  const cerrado = reclamo.Status === 'resuelto' || reclamo.Status === 'rechazado';
  // Igual que el backend (409): ya enviado a contabilidad o cerrado, no se elimina ni se tocan los adjuntos.
  const bloqueado = cerrado || Boolean(reclamo.EnviadoContabilidadAt);
  // Quien decide o tiene "Adjuntar en cualquier reclamo" (Torre de Control) adjunta en cualquiera; quien crea, en los suyos.
  const puedeAdjuntar = Boolean(permisos?.puedeAdjuntar) || (Boolean(permisos?.puedeCrear) && permisos?.username === reclamo.CreatedBy);

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina detalle>
        <BackLink />
      </BandaPagina>

      <GlassCard className="relative flex flex-col items-center gap-2 py-8 text-center">
        {puedeEliminar && !bloqueado && (
          <Button variant="ghost" className="absolute right-4 top-4 px-3 py-1.5 text-sm text-danger" onClick={() => setConfirmarEliminar(true)}>
            <Trash2 size={15} /> Eliminar
          </Button>
        )}
        <span className="etiqueta">Reclamo</span>
        <h1 className="numero-caso text-5xl">{reclamo.Numero}</h1>
        <StatusReclamoBadge status={reclamo.Status} className="mt-1" />
        <RutaCaso pasos={rutaReclamo(reclamo)} className="mt-5 w-full max-w-3xl text-left" />
      </GlassCard>
      {/* Debajo de la tarjeta principal: sobre la franja de color no se leería. */}
      {aviso && <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">{aviso}</div>}

      <GlassCard className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-black/5 dark:lg:divide-white/5">
          <SeccionDatos icono={<ClipboardList size={15} />} titulo="Datos del reclamo" className="lg:pr-6">
            <Dato label="Tipo" value={TIPO_LABEL[reclamo.Tipo]} />
            <Dato label="Origen" value={reclamo.Origen === 'cedi' ? 'CEDI' : 'Tienda'} />
            {reclamo.Origen === 'tienda' && <Dato label="Sucursal" value={reclamo.Sucursal} />}
            {reclamo.Origen === 'cedi' && <Dato label="División" value={reclamo.Division} />}
            <Dato label="Fecha de registro" value={formatFechaCorta(reclamo.FechaRegistro)} />
          </SeccionDatos>
          <SeccionDatos icono={<Building2 size={15} />} titulo="Proveedor y mercancía" className="lg:px-6">
            <Dato label="Proveedor" value={reclamo.Proveedor} />
            <Dato label="Marca" value={reclamo.Marca} />
            <Dato label="Mundo" value={reclamo.Mundo} />
            <Dato label="Departamento" value={reclamo.Departamento} />
            <Dato label="Compradora" value={reclamo.Compradora} />
          </SeccionDatos>
          <SeccionDatos icono={<FileText size={15} />} titulo="Documentos" className="md:col-span-2 lg:col-span-1 lg:pl-6">
            <Dato label="N° embarque / factura" value={reclamo.NumeroEmbarqueFactura} mono />
            {reclamo.SapDocs.length ? (
              reclamo.SapDocs.map((d, i) => <Dato key={`${d}-${i}`} label={reclamo.SapDocs.length > 1 ? `Documento SAP ${i + 1}` : 'Documento SAP'} value={d} mono />)
            ) : (
              <Dato label="Documento SAP" value={null} />
            )}
          </SeccionDatos>
        </div>
        {reclamo.Comentario && (
          <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-sm dark:bg-white/[0.05]">
            <span className="etiqueta">Comentario</span>
            <p className="mt-0.5 whitespace-pre-line">{reclamo.Comentario}</p>
          </div>
        )}
      </GlassCard>

      {puedeDecidir && reclamo.Status === 'pendiente' && (
        <DecisionReclamo
          reclamo={reclamo}
          pendientes={lineas.filter((l) => l.DecStatus === 'pendiente').length}
          onDecidido={setReclamo}
        />
      )}

      {(cerrado || reclamo.EnviadoContabilidadAt) && (puedeEnviarContabilidad || reclamo.EnviadoContabilidadAt) && (
        <EnvioContabilidad reclamo={reclamo} puedeEnviar={puedeEnviarContabilidad && cerrado} onEnviado={setReclamo} />
      )}

      <ProductosSection token={reclamo.Token} lineas={lineas} esAdmin={puedeDecidir} cerrado={cerrado} onLineaActualizada={actualizarLinea} onLineasActualizadas={actualizarLineas} />

      <AdjuntosSection
        reclamo={reclamo}
        esAdmin={puedeEliminar && !reclamo.EnviadoContabilidadAt}
        puedeAdjuntar={puedeAdjuntar && (!bloqueado || Boolean(permisos?.puedeAdjuntarCerrado))}
        onActualizado={setReclamo}
      />

      {confirmarEliminar && (
        <ConfirmModal
          titulo="Eliminar reclamo"
          textoConfirmar="Eliminar definitivamente"
          onClose={() => setConfirmarEliminar(false)}
          onConfirm={async () => {
            await apiReclamos.eliminarReclamo(reclamo.Token);
            navigate('/reclamos', { replace: true });
          }}
        >
          Se eliminará <strong>{reclamo.Numero}</strong> con todos sus productos, el Excel, las fotos y los adjuntos. Esta acción no se puede
          deshacer.
        </ConfirmModal>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/reclamos" className="volver-pagina flex w-fit items-center gap-1 text-sm font-semibold opacity-70 hover:opacity-100">
      <ArrowLeft size={16} /> Reclamos
    </Link>
  );
}



/**
 * Envío a contabilidad: cuando la compradora ya cerró el reclamo, lo manda
 * por correo con los datos, los productos y todos los archivos del reclamo.
 */
function EnvioContabilidad({
  reclamo,
  puedeEnviar,
  onEnviado,
}: {
  reclamo: Reclamo;
  puedeEnviar: boolean;
  onEnviado: (r: Reclamo) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const nArchivos = (reclamo.TieneExcel ? 1 : 0) + reclamo.AdjuntosExtra.length;
  const nPdf = reclamo.AdjuntosExtra.filter((a) => a.tipo === 'pdf').length;
  // Con productos aprobados, primero se sube la nota de débito validada (sección Adjuntos).
  const faltaNota = reclamo.RequiereNotaAprobada && !reclamo.TieneNotaAprobada;

  const enviar = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    setAviso(null);
    try {
      const { envio, ...r } = await apiReclamos.enviarAContabilidad(reclamo.Token);
      onEnviado(r);
      if (envio.rechazados?.length) {
        // El servidor de correo no aceptó alguna dirección: no es un éxito limpio.
        setAviso(`Se envió, pero el servidor de correo rechazó: ${envio.rechazados.join(', ')}. Esas direcciones no lo recibieron.`);
      } else {
        setOk(`Enviado a ${envio.para.join(', ')}${envio.cc.length ? ` (copia a ${envio.cc.join(', ')})` : ''}.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar a contabilidad.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Landmark size={17} /> Contabilidad
      </h2>
      {reclamo.EnviadoContabilidadAt ? (
        <p className="text-sm">
          <CheckCircle2 size={15} className="mr-1 inline text-success" />
          Enviado a contabilidad {formatFecha(reclamo.EnviadoContabilidadAt)} por{' '}
          <strong className="font-semibold">{reclamo.EnviadoContabilidadByNombre || reclamo.EnviadoContabilidadBy}</strong>
          {reclamo.EnviadoContabilidadA && <span className="opacity-60"> · a {reclamo.EnviadoContabilidadA}</span>}
        </p>
      ) : (
        <p className="text-sm opacity-70">Todavía no se ha enviado a contabilidad.</p>
      )}
      {puedeEnviar && faltaNota && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            Para enviarlo a contabilidad, primero sube en <strong>Adjuntos</strong> el documento PDF de SAP con los productos aprobados por la
            compradora.
          </span>
        </p>
      )}
      {puedeEnviar && !faltaNota && (
        <>
          <p className="text-xs opacity-60">
            Se envía por correo con los datos del reclamo, la decisión, los {reclamo.LineasTotal} producto(s) y {nArchivos} archivo(s) adjunto(s)
            {nPdf > 0 && ` (incluye ${nPdf} PDF)`}, todos con el nombre «Reclamo {reclamo.Numero} - …».
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          {ok && <p className="text-sm text-success">{ok}</p>}
          {aviso && <p className="text-sm text-warning">{aviso}</p>}
          <div className="flex justify-end">
            <Button disabled={busy} onClick={enviar}>
              <Send size={15} /> {busy ? 'Enviando…' : reclamo.EnviadoContabilidadAt ? 'Reenviar a contabilidad' : 'Enviar a contabilidad'}
            </Button>
          </div>
        </>
      )}
    </GlassCard>
  );
}

function DecisionReclamo({
  reclamo,
  pendientes,
  onDecidido,
}: {
  reclamo: Reclamo;
  pendientes: number;
  onDecidido: (r: Reclamo) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decidir = async (status: 'resuelto' | 'rechazado') => {
    setBusy(true);
    setError(null);
    try {
      onDecidido(await apiReclamos.decidirReclamo(reclamo.Token, status, comentario));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-3">
      <h2 className="text-base font-bold">Decisión del reclamo</h2>
      {pendientes > 0 && (
        <p className="text-sm text-warning">
          Todavía hay {pendientes} producto(s) sin decidir. Para confirmar o rechazar el reclamo, primero decide todos los productos.
        </p>
      )}
      <Textarea rows={2} placeholder="Comentario (opcional)" value={comentario} maxLength={1000} onChange={(e) => setComentario(e.target.value)} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="danger" disabled={busy || pendientes > 0} title={pendientes > 0 ? 'Primero decide todos los productos' : undefined} onClick={() => decidir('rechazado')}>
          <XCircle size={15} /> Rechazar reclamo
        </Button>
        <Button disabled={busy || pendientes > 0} title={pendientes > 0 ? 'Primero decide todos los productos' : undefined} onClick={() => decidir('resuelto')}>
          <CheckCircle2 size={15} /> Confirmar reclamo
        </Button>
      </div>
    </GlassCard>
  );
}

/** Ruta del reclamo: creado → decisión de la compradora → enviado a contabilidad. */
function rutaReclamo(r: Reclamo): PasoRuta[] {
  const creado: PasoRuta = { titulo: 'Creado', estado: 'hecho', fecha: r.CreatedAt, quien: r.CreatedByNombre || r.CreatedBy };
  // Notificado: solo informa; no lleva decisión ni va a contabilidad.
  if (r.Status === 'notificado') return [creado, { titulo: 'Notificado', estado: 'hecho', nota: 'Solo informativo' }];
  const cerrado = r.Status === 'resuelto' || r.Status === 'rechazado';
  const enviado = Boolean(r.EnviadoContabilidadAt);
  return [
    creado,
    cerrado
      ? {
          titulo: r.Status === 'resuelto' ? 'Confirmado por compradora' : 'Rechazado',
          estado: 'hecho',
          tono: r.Status === 'resuelto' ? 'ok' : 'mal',
          fecha: r.DecisionAt,
          quien: r.DecisionByNombre || r.DecisionBy,
        }
      : {
          titulo: 'Decisión de la compradora',
          estado: 'actual',
          nota: r.LineasPendientes ? `Faltan ${r.LineasPendientes} producto${r.LineasPendientes === 1 ? '' : 's'}` : 'Lista para cerrar',
        },
    enviado
      ? { titulo: 'Enviado a contabilidad', estado: 'hecho', fecha: r.EnviadoContabilidadAt, quien: r.EnviadoContabilidadByNombre || r.EnviadoContabilidadBy }
      : { titulo: 'Enviado a contabilidad', estado: cerrado ? 'actual' : 'pendiente', nota: cerrado ? 'Falta enviarlo' : null },
  ];
}
