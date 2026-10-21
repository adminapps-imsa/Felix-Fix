import { formatFecha } from '../../../lib/formatters';
import type { HistorialItem } from '../../../types/productoDanado';

const ACCION_LABEL: Record<string, string> = {
  Creado: 'Reporte creado',
  Aprobado: 'Devolución aprobada · pasa a Gof',
  Rechazado: 'NF · pasa a Gof (documento 1700)',
  Documento1700: 'Documento 1700 marcado · pasa al supervisor GOF',
  NFCerrado: 'NF validado y cerrado por el supervisor GOF',
  EnviadoContabilidad: 'Enviado a contabilidad',
  PagoRecibido: 'Pago del proveedor recibido · cerrado',
  EnProceso: 'Envío a SAP iniciado',
  ProcesadoOk: 'Baja registrada en SAP',
  ProcesadoError: 'Falló el envío a SAP',
  CorreosActualizados: 'Correos del proveedor actualizados',
  AdjuntoAgregado: 'Adjunto agregado',
  AdjuntoEliminado: 'Adjunto eliminado',
  EnviadoProveedor: 'Enviado al proveedor por correo',
  DevueltoTienda: 'Devuelto a la tienda para corregir',
  Corregido: 'Corregido por la tienda · vuelve a la compradora',
};

export function HistorialTimeline({ historial }: { historial: HistorialItem[] }) {
  if (!historial.length) return <p className="text-sm opacity-60">Sin eventos todavía.</p>;
  return (
    <ol className="flex flex-col gap-3 border-l border-black/10 pl-4 dark:border-white/10">
      {historial.map((h) => (
        <li key={h.HistorialId} className="relative text-sm">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
          <div className="font-semibold">{ACCION_LABEL[h.Accion] || h.Accion}</div>
          <div className="opacity-60">
            {formatFecha(h.FechaEvento)} · {h.UsuarioNombre || h.UsuarioId}
          </div>
          {h.Detalle && <div className="mt-1 rounded-lg bg-black/[0.03] px-2 py-1 opacity-80 dark:bg-white/[0.05]">{h.Detalle}</div>}
        </li>
      ))}
    </ol>
  );
}
