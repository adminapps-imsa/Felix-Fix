import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ClipboardList, FileText, Landmark, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { BandaPagina } from '../../../components/ui/TituloPagina';
import { Dato, SeccionDatos } from '../../../components/ui/DatosDetalle';
import { RutaCaso, type PasoRuta } from '../../../components/ui/RutaCaso';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { EsqueletoDetalle } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { formatFecha } from '../../../lib/formatters';
import type { Reclamo, ReclamoLinea } from '../../../types/reclamo';
import { RetiroBadge, StatusReclamoBadge } from '../components/Badges';
import { ProductosSection } from '../components/ProductosSection';
import { AdjuntosSection } from '../components/AdjuntosSection';
import { ConfirmModal } from '../components/ConfirmModal';
import { DevolucionReclamo, DevolverModal } from '../components/DevolucionReclamo';
import { RetiroProveedor } from '../components/RetiroProveedor';
import { usePermisosReclamos } from '../lib/usePermisosReclamos';
import { TIPO_LABEL, formatFechaCorta, esDevolucion } from '../lib/tipos';

export function ReclamoDetallePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const aviso = (location.state as { aviso?: string } | null)?.aviso;
  const permisos = usePermisosReclamos();
  const puedeDecidir = Boolean(permisos?.puedeDecidir);
  const puedeEnviarContabilidad = Boolean(permisos?.puedeEnviarContabilidad);
  const puedeEliminar = Boolean(permisos?.puedeEliminar);
  const esSuperAdmin = Boolean(permisos?.puedeEliminarCualquiera);

  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [lineas, setLineas] = useState<ReclamoLinea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const avisos = useAvisos();

  // Token vigente: al pasar de un reclamo a otro, una respuesta tardía del
  // anterior no debe pisar al nuevo (ni la carga inicial ni las recargas sueltas).
  const tokenActual = useRef(token);
  tokenActual.current = token;

  const cargar = useCallback(() => {
    let cancelado = false;
    setError(null);
    setReclamo(null);
    setLineas([]);
    Promise.all([apiReclamos.obtenerReclamo(token), apiReclamos.obtenerLineas(token)])
      .then(([r, ls]) => {
        if (cancelado) return;
        setReclamo(r);
        setLineas(ls);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof ApiError && err.status === 404 ? 'El reclamo no existe o fue eliminado.' : 'No se pudo cargar el reclamo.');
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  useEffect(cargar, [cargar]);

  /** Vuelve a pedir el encabezado; se descarta si mientras tanto se cambió de reclamo. */
  const recargarReclamo = () => {
    const pedido = token;
    apiReclamos
      .obtenerReclamo(pedido)
      .then((r) => tokenActual.current === pedido && setReclamo(r))
      .catch(() => {});
  };

  const actualizarLinea = (l: ReclamoLinea) => {
    setLineas((ls) => ls.map((x) => (x.Posicion === l.Posicion ? l : x)));
    // El encabezado lleva el conteo de pendientes.
    recargarReclamo();
  };
  const actualizarLineas = (ls: ReclamoLinea[]) => {
    setLineas(ls);
    recargarReclamo();
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BandaPagina>
          <BackLink />
        </BandaPagina>
        <GlassCard className="!p-0">
          <EstadoVacio
            icono={ClipboardList}
            tono="error"
            titulo={error}
            // Si no existe, reintentar no sirve: solo queda volver a la lista.
            accion={error.startsWith('No se pudo') ? <BotonReintentar onClick={cargar} /> : undefined}
          />
        </GlassCard>
      </div>
    );
  }
  if (!reclamo)
    return (
      <div className="flex flex-col gap-6">
        <BandaPagina detalle>
          <BackLink />
        </BandaPagina>
        <EsqueletoDetalle />
      </div>
    );

  const cerrado = reclamo.Status === 'resuelto' || reclamo.Status === 'rechazado';
  // Igual que el backend (409): ya enviado a contabilidad o cerrado, no se elimina ni se tocan los adjuntos.
  const bloqueado = cerrado || Boolean(reclamo.EnviadoContabilidadAt);
  // Quien decide o tiene "Adjuntar en cualquier reclamo" (Torre de Control) adjunta en cualquiera; quien crea, en los suyos.
  const puedeAdjuntar = Boolean(permisos?.puedeAdjuntar) || (Boolean(permisos?.puedeCrear) && permisos?.username === reclamo.CreatedBy);
  // Devuelto por la compradora: lo corrige quien lo creó (o el super administrador), que también puede quitar adjuntos.
  const devuelto = reclamo.Status === 'devuelto';
  const puedeCorregir =
    devuelto && Boolean(permisos?.puedeCrear) && (permisos?.username === reclamo.CreatedBy || Boolean(permisos?.puedeCorregirCualquiera));

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina detalle>
        <BackLink />
      </BandaPagina>

      <GlassCard className="relative flex flex-col items-center gap-2 py-8 text-center">
        {/* Super administrador: a la izquierda y en cualquier estado. */}
        {esSuperAdmin ? (
          <Button variant="ghost" className="absolute left-4 top-4 px-3 py-1.5 text-sm text-danger" onClick={() => setConfirmarEliminar(true)}>
            <Trash2 size={15} /> Eliminar
          </Button>
        ) : (
          puedeEliminar &&
          !bloqueado && (
            <Button variant="ghost" className="absolute right-4 top-4 px-3 py-1.5 text-sm text-danger" onClick={() => setConfirmarEliminar(true)}>
              <Trash2 size={15} /> Eliminar
            </Button>
          )
        )}
        <span className="etiqueta">Reclamo</span>
        <h1 className="numero-caso text-5xl">{reclamo.Numero}</h1>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <StatusReclamoBadge status={reclamo.Status} />
          <RetiroBadge reclamo={reclamo} />
        </div>
        <RutaCaso pasos={rutaReclamo(reclamo)} className="mt-5 w-full max-w-3xl text-left" />
      </GlassCard>
      {/* Debajo de la tarjeta principal: sobre la franja de color no se leería. */}
      {aviso && <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">{aviso}</div>}

      <DevolucionReclamo reclamo={reclamo} puedeCorregir={puedeCorregir} onActualizado={setReclamo} />

      {/* Devolución al proveedor: Gof marca cuándo retiró el producto (no cambia el flujo). */}
      {esDevolucion(reclamo) && <RetiroProveedor reclamo={reclamo} puedeRegistrar={Boolean(permisos?.puedeRegistrarRetiro)} onActualizado={setReclamo} />}

      <GlassCard className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-black/5 dark:lg:divide-white/5">
          <SeccionDatos icono={<ClipboardList size={15} />} titulo="Datos del reclamo" className="lg:pr-6">
            <Dato label="Tipo" value={TIPO_LABEL[reclamo.Tipo]} />
            <Dato label="Origen" value={reclamo.Origen === 'cedi' ? 'CEDI' : 'Tienda'} />
            {reclamo.Origen === 'tienda' && <Dato label="Sucursal" value={reclamo.Sucursal} />}
            {reclamo.Origen === 'cedi' && <Dato label="División" value={reclamo.Division} />}
            <Dato label="Fecha de registro" value={formatFechaCorta(reclamo.FechaRegistro)} />
            <Dato label="Llegada de la mercancía" value={formatFechaCorta(reclamo.FechaLlegadaMercancia)} />
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
          puedeDevolver={Boolean(permisos?.puedeDevolver) && Boolean(reclamo.CreatedBy)}
          onDecidido={setReclamo}
        />
      )}

      {(cerrado || reclamo.EnviadoContabilidadAt) && (puedeEnviarContabilidad || reclamo.EnviadoContabilidadAt) && (
        <EnvioContabilidad reclamo={reclamo} puedeEnviar={puedeEnviarContabilidad && cerrado} onEnviado={setReclamo} />
      )}

      <ProductosSection token={reclamo.Token} lineas={lineas} esAdmin={puedeDecidir} cerrado={cerrado || devuelto} onLineaActualizada={actualizarLinea} onLineasActualizadas={actualizarLineas} />

      <AdjuntosSection
        reclamo={reclamo}
        esAdmin={(puedeEliminar || puedeCorregir) && !reclamo.EnviadoContabilidadAt}
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
            avisos.ok(`Reclamo ${reclamo.Numero} eliminado.`);
            navigate('/reclamos', { replace: true });
          }}
        >
          Se eliminará <strong>{reclamo.Numero}</strong> con todos sus productos, el Excel, las fotos y los adjuntos. Esta acción no se puede
          deshacer.
          {bloqueado && (
            <span className="mt-2 block font-semibold text-danger">
              {reclamo.EnviadoContabilidadAt ? 'Este reclamo ya se envió a contabilidad: también se borra lo que recibió contabilidad.' : 'Este reclamo ya está cerrado.'}
            </span>
          )}
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
  const avisos = useAvisos();
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
        avisos.ok(`Reclamo ${reclamo.Numero} enviado a contabilidad.`);
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
            <Button estado={busy ? 'cargando' : null} onClick={enviar}>
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
  puedeDevolver,
  onDecidido,
}: {
  reclamo: Reclamo;
  pendientes: number;
  puedeDevolver: boolean;
  onDecidido: (r: Reclamo) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [devolver, setDevolver] = useState(false);
  // Cuál de los dos botones está trabajando (para su ruedita); los demás solo se apagan.
  const [busy, setBusy] = useState<'resuelto' | 'rechazado' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();

  const decidir = async (status: 'resuelto' | 'rechazado') => {
    setBusy(status);
    setError(null);
    try {
      onDecidido(await apiReclamos.decidirReclamo(reclamo.Token, status, comentario));
      avisos.ok(`Reclamo ${reclamo.Numero} ${status === 'resuelto' ? 'confirmado' : 'rechazado'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setBusy(null);
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
      <div className="flex flex-wrap justify-end gap-2">
        {puedeDevolver && (
          // Amarillo y grande, para que se vea: si algo está mal, se devuelve con un comentario.
          <Button variant="aviso" tamano="grande" className="sm:mr-auto" disabled={Boolean(busy)} onClick={() => setDevolver(true)} title="Algo está mal: devuélvelo con un comentario para que lo corrijan">
            <Undo2 size={18} /> Devolver a {reclamo.CreatedByNombre || reclamo.CreatedBy}
          </Button>
        )}
        <Button variant="danger" disabled={Boolean(busy) || pendientes > 0} estado={busy === 'rechazado' ? 'cargando' : null} title={pendientes > 0 ? 'Primero decide todos los productos' : undefined} onClick={() => decidir('rechazado')}>
          <XCircle size={15} /> Rechazar reclamo
        </Button>
        <Button disabled={Boolean(busy) || pendientes > 0} estado={busy === 'resuelto' ? 'cargando' : null} title={pendientes > 0 ? 'Primero decide todos los productos' : undefined} onClick={() => decidir('resuelto')}>
          <CheckCircle2 size={15} /> Confirmar reclamo
        </Button>
      </div>
      {devolver && <DevolverModal reclamo={reclamo} onClose={() => setDevolver(false)} onDevuelto={(r) => (onDecidido(r), setDevolver(false))} />}
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
      : r.Status === 'devuelto'
        ? { titulo: 'Con comentario de compradora', estado: 'actual', nota: `Esperando la corrección de ${r.CreatedByNombre || r.CreatedBy}` }
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
