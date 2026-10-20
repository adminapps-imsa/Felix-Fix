import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageSearch, Plus, SearchX } from 'lucide-react';
import { EstadoVacio } from '../../../components/ui/EstadoVacio';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { Button } from '../../../components/ui/Button';
import { RequirePermiso } from '../../../auth/RequirePermiso';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';
import { KpiCards } from '../components/KpiCards';
import { FiltersBar } from '../components/FiltersBar';
import { ReportesTable } from '../components/ReportesTable';
import { NuevoReporteForm } from '../components/NuevoReporteForm';
import { ReporteDetalleModal } from '../components/ReporteDetalleModal';
import { Pagination } from '../../../components/ui/Pagination';
import { useProductosDanados } from '../hooks/useProductosDanados';
import { useKpis } from '../hooks/useKpis';
import { useTiendas } from '../hooks/useTiendas';
import { ESTADO_LABEL } from '../../../types/productoDanado';
import type { Estado, Filtros, ReporteProductoDanado } from '../../../types/productoDanado';

const FILTROS_INICIALES: Filtros = { page: 1, pageSize: 20 };

export function ProductosDanadosPage() {
  const { puede } = useAuth();
  // Desde Inicio se llega con la etapa en el enlace (?estado=Pendiente) o a crear uno (?nuevo=1).
  const [params] = useSearchParams();
  const estadoEnlace = params.get('estado');
  // Quien solo trabaja una etapa (supervisor GOF, Gof, contabilidad) abre con
  // la lista filtrada en lo que le toca; puede quitar el filtro.
  const [filtros, setFiltros] = useState<Filtros>(() => {
    if (estadoEnlace && Object.hasOwn(ESTADO_LABEL, estadoEnlace)) return { ...FILTROS_INICIALES, estado: estadoEnlace as Estado };
    if (puede(P.pdVer, P.pdAprobar)) return FILTROS_INICIALES;
    // Gof trabaja dos etapas (NF y Devolución aprobada): abre sin filtro, ya ve solo lo suyo.
    if (puede(P.pdNfDocumento) && puede(P.pdDocumentar)) return FILTROS_INICIALES;
    const estado = puede(P.pdNfDocumento) ? 'Rechazado' : puede(P.pdNf) ? 'NFValidacion' : puede(P.pdDocumentar) ? 'Aprobado' : puede(P.pdPago) ? 'EnContabilidad' : '';
    return { ...FILTROS_INICIALES, estado };
  });
  // Igual que el backend (alcanceVista): «Ver solo NF y devoluciones» sin «Ver reportes» (Gof)
  // ve los NF y, si sube el documento para contabilidad, las devoluciones aprobadas.
  const parcial = !puede(P.pdVer) && puede(P.pdVerNf);
  const estadosVisibles: Estado[] | undefined = parcial
    ? ['Rechazado', 'NFValidacion', ...(puede(P.pdDocumentar) ? (['Aprobado', 'EnContabilidad'] as Estado[]) : []), 'Cerrado']
    : undefined;
  const [showNuevo, setShowNuevo] = useState(() => params.get('nuevo') === '1' && puede(P.pdCrear));
  // Desde el Tablero se llega a un reporte puntual (?reporte=52): se abre su detalle.
  const [seleccionado, setSeleccionado] = useState<Pick<ReporteProductoDanado, 'ReporteId'> | null>(() => {
    const id = Number(params.get('reporte'));
    return Number.isInteger(id) && id > 0 ? { ReporteId: id } : null;
  });

  const tiendas = useTiendas();
  const { data, pagination, loading, error, reload, reloadToken } = useProductosDanados(filtros);
  const kpis = useKpis(filtros, reloadToken);
  // La página no cuenta como filtro: con ella cambia la «tanda» de filas pero no el texto del vacío.
  const { page: _p, pageSize: _ps, ...soloFiltros } = filtros;
  const hayFiltros = Object.values(soloFiltros).some(Boolean);
  const vacio = hayFiltros ? (
    <EstadoVacio
      icono={SearchX}
      titulo="No hay reportes con estos filtros"
      accion={
        <Button variant="ghost" onClick={() => setFiltros(FILTROS_INICIALES)}>
          Quitar filtros
        </Button>
      }
    />
  ) : (
    <EstadoVacio
      icono={PackageSearch}
      titulo="Todavía no hay reportes"
      texto={puede(P.pdCrear) ? 'Cuando reportes un producto dañado aparecerá aquí.' : 'Cuando se reporte un producto dañado aparecerá aquí.'}
      accion={
        puede(P.pdCrear) && (
          <Button onClick={() => setShowNuevo(true)}>
            <Plus size={16} /> Nuevo reporte
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina solape className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TituloPagina icono={PackageSearch} titulo="Productos Dañados">
          <p className="bajada-pagina">Bajas por deterioro, daño, vencimiento o cambio/devolución.</p>
        </TituloPagina>
        <RequirePermiso permiso={P.pdCrear}>
          <Button onClick={() => setShowNuevo(true)}>
            <Plus size={16} /> Nuevo reporte
          </Button>
        </RequirePermiso>
      </BandaPagina>

      <KpiCards kpis={kpis} estadosVisibles={estadosVisibles} estado={filtros.estado} onEstado={(estado) => setFiltros((f) => ({ ...f, estado, page: 1 }))} />

      <FiltersBar filtros={filtros} onChange={setFiltros} tiendas={tiendas} />

      <ReportesTable data={data} loading={loading} error={error} onReintentar={reload} vacio={vacio} clave={JSON.stringify(filtros)} onSelect={setSeleccionado} />

      {pagination && <Pagination meta={pagination} onPageChange={(page) => setFiltros((f) => ({ ...f, page }))} />}

      {showNuevo && (
        <NuevoReporteForm tiendas={tiendas} onClose={() => setShowNuevo(false)} onCreated={reload} />
      )}

      {seleccionado && (
        <ReporteDetalleModal
          reporteId={seleccionado.ReporteId}
          onClose={() => setSeleccionado(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
