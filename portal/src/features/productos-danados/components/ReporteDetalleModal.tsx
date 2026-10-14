import { useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, Package, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Dato, SeccionDatos } from '../../../components/ui/DatosDetalle';
import { RutaCaso, type PasoRuta } from '../../../components/ui/RutaCaso';
import { EstadoBadge, MotivoBadge } from '../../../components/ui/Badge';
import { RequirePermiso } from '../../../auth/RequirePermiso';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';
import { HistorialTimeline } from './HistorialTimeline';
import { RechazarModal } from './RechazarModal';
import { CierreModal } from './CierreModal';
import { EvidenciaImage } from './EvidenciaImage';
import { CorreosProveedor } from './CorreosProveedor';
import { AdjuntosReporte } from './AdjuntosReporte';
import { ConfirmModal } from '../../reclamos/components/ConfirmModal';
import { formatFecha, formatCantidad } from '../../../lib/formatters';
import * as apiProductosDanados from '../../../api/productosDanados';
import { ApiError } from '../../../api/client';
import type { Estado, ReporteDetalle } from '../../../types/productoDanado';

// No se borra lo que ya está en contabilidad, cerrado o en SAP (igual que el backend).
const NO_ELIMINABLES: Estado[] = ['EnProceso', 'Procesado', 'EnContabilidad', 'Cerrado'];
// Correos del proveedor y adjuntos: solo mientras el reporte está en estas etapas (el backend responde 409 si no).
const ESTADOS_EDITABLES: Estado[] = ['Pendiente', 'Aprobado'];

/** Qué falta y quién lo tiene, para que cada rol sepa si le toca. */
function siguientePaso(r: ReporteDetalle): string | null {
  switch (r.Estado) {
    case 'Pendiente':
      return 'Compradora: enviar al proveedor y registrar su respuesta (Devolución aprobada o NF).';
    case 'Rechazado':
      return 'NF · lo revisa el supervisor GOF.';
    case 'Aprobado':
      return 'Devolución aprobada · Gof sube el documento (PDF o Excel) y lo envía a contabilidad.';
    case 'EnContabilidad':
      return 'Contabilidad: confirmar cuando se reciba el pago del proveedor.';
    case 'Cerrado':
      return r.Resolucion === 'NF' ? 'Cerrado como NF.' : 'Cerrado · pago del proveedor recibido.';
    default:
      return null;
  }
}

/** Cuándo y quién llevó el reporte a un estado (el último cambio a ese estado en el historial). */
function cambioA(r: ReporteDetalle, estado: Estado) {
  const h = [...r.historial].reverse().find((x) => x.EstadoNuevo === estado);
  return h ? { fecha: h.FechaEvento, quien: h.UsuarioNombre } : {};
}

/**
 * Ruta del reporte. Después de la respuesta del proveedor se bifurca:
 * NF → cierre del supervisor GOF; Devolución aprobada → contabilidad → pago.
 */
function rutaReporte(r: ReporteDetalle): PasoRuta[] {
  const e = r.Estado;
  const esNf = e === 'Rechazado' || (e === 'Cerrado' && r.Resolucion === 'NF');
  const respondido = e !== 'Pendiente';
  const reportado: PasoRuta = { titulo: 'Reportado', estado: 'hecho', fecha: r.FechaCreacion, quien: r.EmpleadoReportaNombre };
  const envio: PasoRuta = r.EnviadoProveedorAt
    ? { titulo: 'Enviado al proveedor', estado: 'hecho', fecha: r.EnviadoProveedorAt, quien: r.EnviadoProveedorPorNombre || r.EnviadoProveedorPor }
    : respondido
      ? { titulo: 'Enviado al proveedor', estado: 'hecho', nota: 'No se envió desde el portal' }
      : { titulo: 'Enviado al proveedor', estado: 'actual', nota: 'Le toca a la compradora' };
  const respuesta: PasoRuta = !respondido
    ? { titulo: 'Respuesta del proveedor', estado: r.EnviadoProveedorAt ? 'actual' : 'pendiente', nota: r.EnviadoProveedorAt ? 'Esperando respuesta' : null }
    : esNf
      ? { titulo: 'NF', estado: 'hecho', tono: 'mal', ...cambioA(r, 'Rechazado') }
      : { titulo: 'Devolución aprobada', estado: 'hecho', tono: 'ok', ...cambioA(r, 'Aprobado') };
  if (esNf) {
    return [
      reportado,
      envio,
      respuesta,
      e === 'Cerrado'
        ? { titulo: 'Cerrado', estado: 'hecho', ...cambioA(r, 'Cerrado') }
        : { titulo: 'Cierre del NF', estado: 'actual', nota: 'Le toca al supervisor GOF' },
    ];
  }
  const enConta = e === 'EnContabilidad' || e === 'Cerrado';
  return [
    reportado,
    envio,
    respuesta,
    enConta
      ? { titulo: 'En contabilidad', estado: 'hecho', ...cambioA(r, 'EnContabilidad') }
      : { titulo: 'Documento a contabilidad', estado: respondido ? 'actual' : 'pendiente', nota: respondido ? 'Le toca a Gof' : null },
    e === 'Cerrado'
      ? { titulo: 'Pago recibido', estado: 'hecho', tono: 'ok', ...cambioA(r, 'Cerrado') }
      : { titulo: 'Pago recibido', estado: e === 'EnContabilidad' ? 'actual' : 'pendiente', nota: e === 'EnContabilidad' ? 'Le toca a contabilidad' : null },
  ];
}

export function ReporteDetalleModal({
  reporteId,
  onClose,
  onChanged,
}: {
  reporteId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reporte, setReporte] = useState<ReporteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRechazar, setShowRechazar] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [cierre, setCierre] = useState<'nf' | 'pago' | null>(null);
  const { puede, user } = useAuth();
  // Igual que el backend: quien trabaja con el proveedor edita cualquier reporte; quien solo crea, los suyos.
  const puedeEditar =
    puede(P.pdAprobar, P.pdEnviar, P.pdProcesar) || (puede(P.pdCrear) && Boolean(reporte) && reporte?.EmpleadoReportaUsuario === user?.username);

  const cargar = () => {
    setLoading(true);
    setLoadError(null);
    apiProductosDanados
      .obtenerDetalle(reporteId)
      .then(setReporte)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.'))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, [reporteId]);

  const runAction = async (fn: () => Promise<ReporteDetalle>) => {
    setBusy(true);
    setActionError(null);
    try {
      const actualizado = await fn();
      setReporte(actualizado);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        // La baja en SAP falló: el backend revierte a Aprobado y permite reintentar.
        setActionError(err.message);
        cargar();
        onChanged();
      } else {
        setActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={reporte ? `Reporte #${reporte.ReporteId}` : 'Cargando…'} onClose={onClose} wide>
      {loadError && !reporte ? (
        <div className="flex flex-col items-start gap-3">
          <div className="w-full rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{loadError}</div>
          <Button variant="secondary" disabled={loading} onClick={cargar}>
            {loading ? 'Cargando…' : 'Reintentar'}
          </Button>
        </div>
      ) : loading || !reporte ? (
        <p className="text-sm opacity-60">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={reporte.Estado} />
            <MotivoBadge motivo={reporte.Motivo} />
          </div>

          <RutaCaso pasos={rutaReporte(reporte)} className="rounded-xl bg-black/[0.025] p-4 dark:bg-white/[0.04]" />

          {actionError && (
            <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</div>
          )}

          {siguientePaso(reporte) && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-sm">
              <ArrowRight size={16} className="mt-0.5 shrink-0 text-brand-500" />
              <span>{siguientePaso(reporte)}</span>
            </div>
          )}

          {reporte.MotivoRechazo && (
            <div className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm">
              <strong>Motivo del NF:</strong> {reporte.MotivoRechazo}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* El nombre va completo arriba; en las filas se cortaría. */}
            <div className="min-w-0">
              <div className="text-base font-semibold leading-snug">{reporte.NombreProducto}</div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-0 md:divide-x md:divide-black/5 dark:md:divide-white/5">
              <SeccionDatos icono={<Package size={15} />} titulo="Producto" className="md:pr-5">
                <Dato label="Código de barras" value={reporte.CodigoBarras} mono />
                <Dato label="Marca" value={reporte.Marca} />
                <Dato label="División" value={reporte.Division} />
                <Dato label="Cantidad" value={formatCantidad(reporte.Cantidad)} />
                {/* Datos de reportes creados antes de quitar SKU y Categoría del formulario. */}
                {reporte.Sku && <Dato label="SKU" value={reporte.Sku} mono />}
                {reporte.Categoria && <Dato label="Categoría" value={reporte.Categoria} />}
              </SeccionDatos>
              <SeccionDatos icono={<ClipboardList size={15} />} titulo="Reporte" className="md:pl-5">
                <Dato label="Tienda" value={reporte.TiendaNombre} />
                <Dato label="Reportado por" value={reporte.EmpleadoReportaNombre} />
                <Dato label="Fecha" value={formatFecha(reporte.FechaCreacion)} />
                {reporte.SapDocumentoId && <Dato label="Documento SAP" value={reporte.SapDocumentoId} mono />}
                {reporte.PagoReferencia && <Dato label="Referencia del pago" value={reporte.PagoReferencia} mono />}
              </SeccionDatos>
            </div>
          </div>

          {reporte.Descripcion && (
            <div className="text-sm">
              <div className="mb-1 font-medium opacity-70">Descripción</div>
              <p className="opacity-90">{reporte.Descripcion}</p>
            </div>
          )}

          {reporte.EvidenciaKey && (
            <div>
              <div className="mb-1 text-sm font-medium opacity-70">Evidencia</div>
              <EvidenciaImage reporteId={reporte.ReporteId} />
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            {/* Igual que el backend: correos y adjuntos solo se cambian en Pendiente o Devolución aprobada. */}
            <CorreosProveedor reporte={reporte} editable={puedeEditar && ESTADOS_EDITABLES.includes(reporte.Estado)} onActualizado={setReporte} />
            <div className="border-t border-black/5 dark:border-white/5" />
            <AdjuntosReporte reporte={reporte} editable={puedeEditar && ESTADOS_EDITABLES.includes(reporte.Estado)} onActualizado={setReporte} />
          </div>

          {/* Documentos de Gof para contabilidad: solo en devoluciones aprobadas. */}
          {(reporte.Estado === 'Aprobado' || reporte.Adjuntos.some((a) => a.etapa === 'gof')) && (
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <AdjuntosReporte
                reporte={reporte}
                etapa="gof"
                editable={reporte.Estado === 'Aprobado' && puede(P.pdDocumentar)}
                onActualizado={setReporte}
              />
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium opacity-70">Historial</div>
            <HistorialTimeline historial={reporte.historial} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 pt-4 dark:border-white/10">
            {puede(P.pdEliminar) && !NO_ELIMINABLES.includes(reporte.Estado) && (
              <Button variant="ghost" className="mr-auto px-3 text-danger" disabled={busy} onClick={() => setConfirmarEliminar(true)}>
                <Trash2 size={15} /> Eliminar
              </Button>
            )}
            {reporte.Estado === 'Pendiente' && (
              <RequirePermiso permiso={P.pdAprobar}>
                {/* NF (Rechazado) pasa al supervisor GOF; Devolución aprobada (Aprobado) pasa a Gof. */}
                <Button variant="danger" disabled={busy} onClick={() => setShowRechazar(true)}>
                  NF
                </Button>
                <Button disabled={busy} onClick={() => runAction(() => apiProductosDanados.aprobarReporte(reporte.ReporteId))}>
                  Devolución aprobada
                </Button>
              </RequirePermiso>
            )}
            {reporte.Estado === 'Rechazado' && (
              <RequirePermiso permiso={P.pdNf}>
                <Button disabled={busy} onClick={() => setCierre('nf')}>
                  Cerrar NF
                </Button>
              </RequirePermiso>
            )}
            {reporte.Estado === 'Aprobado' && (
              <RequirePermiso permiso={P.pdDocumentar}>
                <Button
                  disabled={busy || !reporte.Adjuntos.some((a) => a.etapa === 'gof')}
                  title={reporte.Adjuntos.some((a) => a.etapa === 'gof') ? undefined : 'Primero sube el documento (PDF o Excel)'}
                  onClick={() => runAction(() => apiProductosDanados.enviarAContabilidad(reporte.ReporteId))}
                >
                  Enviar a contabilidad
                </Button>
              </RequirePermiso>
            )}
            {reporte.Estado === 'EnContabilidad' && (
              <RequirePermiso permiso={P.pdPago}>
                <Button disabled={busy} onClick={() => setCierre('pago')}>
                  Pago recibido
                </Button>
              </RequirePermiso>
            )}
          </div>
        </div>
      )}

      {confirmarEliminar && reporte && (
        <ConfirmModal
          titulo="Eliminar reporte"
          textoConfirmar="Eliminar definitivamente"
          onClose={() => setConfirmarEliminar(false)}
          onConfirm={async () => {
            await apiProductosDanados.eliminarReporte(reporte.ReporteId);
            onChanged();
            onClose();
          }}
        >
          Se eliminará el <strong>reporte #{reporte.ReporteId}</strong> ({reporte.NombreProducto}) con su foto, los adjuntos y el historial. Esta
          acción no se puede deshacer.
        </ConfirmModal>
      )}

      {cierre && reporte && (
        <CierreModal
          titulo={cierre === 'nf' ? 'Cerrar NF' : 'Pago del proveedor recibido'}
          conReferencia={cierre === 'pago'}
          textoConfirmar={cierre === 'nf' ? 'Cerrar NF' : 'Confirmar pago y cerrar'}
          texto={
            cierre === 'nf' ? (
              <>El <strong>reporte #{reporte.ReporteId}</strong> quedará cerrado como NF.</>
            ) : (
              <>Confirma que se recibió el pago del proveedor por el <strong>reporte #{reporte.ReporteId}</strong>. El reporte quedará cerrado.</>
            )
          }
          onClose={() => setCierre(null)}
          onConfirm={async ({ referencia, comentario }) => {
            const actualizado =
              cierre === 'nf'
                ? await apiProductosDanados.cerrarNf(reporte.ReporteId, comentario)
                : await apiProductosDanados.registrarPago(reporte.ReporteId, referencia, comentario);
            setReporte(actualizado);
            onChanged();
          }}
        />
      )}

      {showRechazar && (
        <RechazarModal
          onClose={() => setShowRechazar(false)}
          onConfirm={async (motivo) => {
            // Sin runAction: si falla, el error se muestra en el modal y se conserva el motivo escrito.
            setReporte(await apiProductosDanados.rechazarReporte(reporteId, motivo));
            setActionError(null);
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}
