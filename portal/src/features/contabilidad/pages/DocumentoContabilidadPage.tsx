import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Building2, Check, ClipboardList, Download, Eye, FileText, Landmark, ListChecks, PackageSearch } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { BandaPagina } from '../../../components/ui/TituloPagina';
import { Dato, SeccionDatos } from '../../../components/ui/DatosDetalle';
import { Button } from '../../../components/ui/Button';
import { ApiError, guardarBlob } from '../../../api/client';
import * as apiContabilidad from '../../../api/contabilidad';
import * as apiReclamos from '../../../api/reclamos';
import { useAuth } from '../../../auth/useAuth';
import { ACCESO_RECLAMOS } from '../../../auth/permisos';
import { cn } from '../../../lib/cn';
import { formatCantidad, formatFecha } from '../../../lib/formatters';
import type { StatusReclamo, TipoReclamo } from '../../../types/reclamo';
import type { DocumentoContabilidadDetalle, LineaDocumento } from '../../../types/contabilidad';
import { StatusReclamoBadge } from '../../reclamos/components/Badges';
import { PdfPreviewModal } from '../../reclamos/components/VisoresLazy';
import { STATUS_LABEL, TIPO_LABEL_CORTO, formatFechaCorta, formatPrecio } from '../../reclamos/lib/tipos';
import { DecisionBadge, MezclaBadge, ValidacionBadges } from '../components/BadgesContabilidad';

const tipoLabel = (t: string | null) => (t ? TIPO_LABEL_CORTO[t as TipoReclamo] ?? t : '—');

export function DocumentoContabilidadPage() {
  const { id = '' } = useParams();
  const { puede } = useAuth();
  const puedeVerReclamo = puede(...ACCESO_RECLAMOS);
  const [doc, setDoc] = useState<DocumentoContabilidadDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verPdf, setVerPdf] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setError(null);
    setDoc(null);
    apiContabilidad
      .obtenerDocumento(id)
      .then((d) => !cancelado && setDoc(d))
      .catch(
        (err) =>
          !cancelado &&
          setError(err instanceof ApiError && err.status === 404 ? 'El documento no existe o ya no está en la bandeja.' : 'No se pudo cargar el documento.')
      );
    return () => {
      cancelado = true;
    };
  }, [id]);

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
  if (!doc) return <p className="text-sm opacity-60">Cargando…</p>;

  const idx = doc.AdjuntoIdx;
  const cargarPdf = () => apiReclamos.descargarAdjunto(doc.ReclamoToken, idx as number);
  const descargar = async () => guardarBlob(await cargarPdf(), doc.AdjuntoNombre);
  const descargarConAviso = () => {
    setErrorDescarga(null);
    descargar().catch((err) => setErrorDescarga(err instanceof Error ? err.message : 'No se pudo descargar el archivo.'));
  };
  const v = doc.Validacion;
  const statusConocido = doc.ReclamoStatus in STATUS_LABEL;

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina detalle>
        <BackLink />
      </BandaPagina>

      <GlassCard className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="etiqueta">{doc.TipoDocumento || 'Documento'}</span>
        <h1 className="numero-caso max-w-full break-words text-4xl sm:text-5xl">
          {doc.NumeroDocumento || <span className="font-sans text-xl">{doc.AdjuntoNombre}</span>}
        </h1>
        <ValidacionBadges validacion={v} className="mt-1 justify-center" />
        <p className="mt-1 text-xs opacity-60">
          Enviado a contabilidad {formatFecha(doc.EnviadoAt)}
          {(doc.EnviadoPorNombre || doc.EnviadoPor) && (
            <>
              {' '}
              por <strong className="font-semibold">{doc.EnviadoPorNombre || doc.EnviadoPor}</strong>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {idx === null ? (
            <p className="text-sm text-warning">El PDF ya no está disponible.</p>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setVerPdf(true)}>
                <Eye size={15} /> Ver PDF
              </Button>
              <Button variant="secondary" onClick={descargarConAviso}>
                <Download size={15} /> Descargar
              </Button>
            </>
          )}
        </div>
        {errorDescarga && <p className="text-sm text-danger">{errorDescarga}</p>}
      </GlassCard>

      <GlassCard className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-black/5 dark:lg:divide-white/5">
          <SeccionDatos icono={<FileText size={15} />} titulo="Documento" className="lg:pr-6">
            <Dato label="Número" value={doc.NumeroDocumento} mono />
            <Dato label="Tipo" value={doc.TipoDocumento} />
            <Dato label="Movimiento" value={doc.Movimiento} />
            <Dato label="Fecha" value={doc.FechaDocumento ? formatFechaCorta(doc.FechaDocumento) : null} />
            <Dato label="Total" value={doc.Total !== null ? formatPrecio(doc.Total) : null} />
            <Dato label="Archivo" value={doc.AdjuntoNombre} />
          </SeccionDatos>
          <SeccionDatos icono={<Building2 size={15} />} titulo="Proveedor" className="lg:px-6">
            <Dato label="Proveedor" value={doc.Proveedor} />
            <Dato label="N° embarque / factura" value={doc.NumeroEmbarqueFactura} mono />
            <Dato label="Compradora" value={doc.Compradora} />
          </SeccionDatos>
          <SeccionDatos icono={<ClipboardList size={15} />} titulo="Reclamo" className="md:col-span-2 lg:col-span-1 lg:pl-6">
            <Dato
              label="Número"
              mono
              title={doc.ReclamoNumero}
              value={
                puedeVerReclamo ? (
                  <Link to={`/reclamos/${doc.ReclamoToken}`} className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">
                    {doc.ReclamoNumero}
                  </Link>
                ) : (
                  doc.ReclamoNumero
                )
              }
            />
            <Dato
              label="Estado"
              title={STATUS_LABEL[doc.ReclamoStatus as StatusReclamo] ?? doc.ReclamoStatus}
              value={statusConocido ? <StatusReclamoBadge status={doc.ReclamoStatus as StatusReclamo} /> : doc.ReclamoStatus}
            />
          </SeccionDatos>
        </div>
        {doc.DecisionComentario && (
          <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-sm dark:bg-white/[0.05]">
            <span className="etiqueta">Comentario de la decisión</span>
            <p className="mt-0.5 whitespace-pre-line">{doc.DecisionComentario}</p>
          </div>
        )}
      </GlassCard>

      <GlassCard className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <ListChecks size={17} /> Validación contra el reclamo
        </h2>
        {v.estado === 'sin_leer' ? (
          <p className="text-sm opacity-70">No se pudo leer el PDF, así que no se pudo comparar con los productos del reclamo. Revísalo manualmente.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Contador valor={v.coinciden} label="Coinciden" clase="text-success" />
            <Contador valor={v.noEnReclamo} label="No están en el reclamo" clase={v.noEnReclamo ? 'text-danger' : ''} />
            <Contador valor={v.cantidadDistinta} label="Cantidad distinta" clase={v.cantidadDistinta ? 'text-danger' : ''} />
            <Contador valor={v.aprobados} label="Aprobados" clase="text-success" />
            <Contador valor={v.rechazados} label="Rechazados" clase={v.rechazados ? 'text-danger' : ''} />
          </div>
        )}
        {v.sinDecision > 0 && <p className="text-xs opacity-60">{v.sinDecision} producto(s) del documento sin decisión de la compradora.</p>}
        {v.mezclaDecisiones && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <MezclaBadge />
            <span>Este documento incluye productos aprobados y rechazados por la compradora: revisa qué líneas aplican.</span>
          </div>
        )}
      </GlassCard>

      <ProductosDocumento lineas={doc.Lineas} />

      {doc.ReclamoSinDocumento.length > 0 && (
        <GlassCard className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <PackageSearch size={17} /> Productos del reclamo sin documento{' '}
            <span className="font-normal opacity-60">· {doc.ReclamoSinDocumento.length}</span>
          </h2>
          <p className="text-xs opacity-60">Están en el reclamo pero no aparecen en este PDF.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs opacity-70 dark:border-white/10">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Código de barra</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Decisión</th>
                </tr>
              </thead>
              <tbody>
                {doc.ReclamoSinDocumento.map((l) => (
                  <tr key={l.lineaId} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 tabular-nums opacity-60">{l.posicion}</td>
                    <td className="px-3 py-2">{l.descripcion || <span className="opacity-40">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.codigoBarra}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCantidad(l.cantidad)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tipoLabel(l.tipo)}</td>
                    <td className="px-3 py-2">
                      <DecisionBadge decision={l.decision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Landmark size={17} /> Acciones de contabilidad
        </h2>
        <p className="text-sm opacity-70">Próximamente: las acciones de contabilidad se habilitarán cuando se definan.</p>
      </GlassCard>

      {verPdf && idx !== null && (
        <PdfPreviewModal titulo={doc.AdjuntoNombre} cargar={cargarPdf} onDescargar={descargar} onClose={() => setVerPdf(false)} />
      )}
    </div>
  );
}

function ProductosDocumento({ lineas }: { lineas: LineaDocumento[] }) {
  const conProblema = lineas.filter((l) => l.resultado !== 'ok').length;
  return (
    <GlassCard className="flex flex-col gap-3">
      <h2 className="text-base font-bold">
        Productos del PDF <span className="font-normal opacity-60">· {lineas.length}</span>
        {conProblema > 0 && <span className="ml-2 text-sm font-semibold text-danger">({conProblema} con diferencias)</span>}
      </h2>
      {lineas.length === 0 ? (
        <p className="text-sm opacity-60">No se encontraron productos en el PDF.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs opacity-70 dark:border-white/10">
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2 text-right">Cant. PDF</th>
                <th className="px-3 py-2 text-right">Cant. reclamo</th>
                <th className="px-3 py-2">Decisión</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const problema = l.resultado !== 'ok';
                return (
                  <tr
                    key={`${l.material}-${l.lineaId ?? 'x'}-${i}`}
                    className={cn(
                      'border-b border-b-black/5 last:border-b-0 dark:border-b-white/5',
                      // La fila con problema se marca con fondo; el resultado ya lo dice en texto.
                      problema && 'bg-danger/[0.08] dark:bg-danger/[0.12]'
                    )}
                  >
                    <td className="min-w-[14rem] px-3 py-2">
                      {l.descripcion || <span className="opacity-40">—</span>}
                      {l.codigoBarra && <span className="block font-mono text-xs opacity-50">{l.codigoBarra}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.material}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCantidad(l.cantidadPdf)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.cantidadReclamo !== null ? formatCantidad(l.cantidadReclamo) : <span className="opacity-40">—</span>}</td>
                    <td className="px-3 py-2">{l.lineaId !== null ? <DecisionBadge decision={l.decision} /> : <span className="opacity-40">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tipoLabel(l.tipo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatPrecio(l.valor)}</td>
                    <td className="px-3 py-2">
                      <Resultado linea={l} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

function Resultado({ linea }: { linea: LineaDocumento }) {
  if (linea.resultado === 'ok') {
    return (
      <span className="flex items-center gap-1 text-success" title="Coincide con el reclamo">
        <Check size={16} aria-hidden />
        <span className="sr-only">Coincide con el reclamo</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-danger">
      <AlertTriangle size={14} className="shrink-0" aria-hidden />
      {linea.resultado === 'no_en_reclamo'
        ? 'No está en el reclamo'
        : `Cantidad distinta: PDF ${formatCantidad(linea.cantidadPdf)} vs reclamo ${linea.cantidadReclamo !== null ? formatCantidad(linea.cantidadReclamo) : '—'}`}
    </span>
  );
}

function Contador({ valor, label, clase }: { valor: number; label: string; clase?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-black/10 px-4 py-3 dark:border-white/10">
      <span className={cn('cifra-kpi', clase)}>{valor}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/contabilidad" className="volver-pagina flex w-fit items-center gap-1 text-sm font-semibold opacity-70 hover:opacity-100">
      <ArrowLeft size={16} /> Contabilidad
    </Link>
  );
}
