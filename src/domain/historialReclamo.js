// Historial de un reclamo (pedido del 2026-11-13): qué pasó, quién, cuándo y
// cuánto tardó cada paso. Lo ven el administrador y el supervisor GOF al final
// del detalle. Regla pura: junta
//   - el reclamo (creado, decisión, envío a contabilidad, entrega al proveedor);
//   - los comentarios de devolución y reenvío (ReclamoComentarios);
//   - las decisiones de productos (antes de que existiera la bitácora);
//   - la Bitácora (desde el 2026-11-13: todo lo que se hizo y los errores).
// Lo que aparece en dos fuentes (p. ej. la devolución en el comentario y en la
// bitácora) sale una sola vez: se queda la que trae más detalle.

const DOS_MIN = 2 * 60 * 1000;
const ms = (d) => (d ? new Date(d).getTime() : null);

/** Tipos de evento (para el icono y el color en el portal). */
export const TIPOS_EVENTO = ['creado', 'devuelto', 'reenviado', 'decision', 'productos', 'excel', 'contabilidad', 'retiro', 'adjunto', 'otro', 'error'];

/** Qué tipo de evento es una acción de la bitácora (src/domain/bitacora.js). */
function tipoDeAccion(accion) {
  if (/^Devolvió el reclamo/.test(accion)) return 'devuelto';
  if (/^Reenvió/.test(accion)) return 'reenviado';
  if (/^Cerró el reclamo/.test(accion)) return 'decision';
  if (/^(Decidió|Deshizo la decisión)/.test(accion)) return 'productos';
  if (/Excel/.test(accion)) return 'excel';
  if (/contabilidad/.test(accion)) return 'contabilidad';
  if (/(proveedor retira|Entregado al proveedor)/.test(accion)) return 'retiro';
  if (/adjunt/i.test(accion)) return 'adjunto';
  return 'otro';
}

/**
 * @param reclamo     fila de Reclamos (CreatedAt, CreatedBy, Status, DecisionAt, DecisionBy,
 *                    EnviadoContabilidadAt, EnviadoContabilidadBy, RetiroProveedorRegistradoAt, RetiroProveedorPor)
 * @param comentarios [{ Tipo: 'devuelto'|'reenviado', Texto, Usuario, Fecha }]
 * @param lineas      [{ DecStatus, DecAt, DecBy }]
 * @param bitacora    [{ Fecha, Clase, Nivel, Accion, Mensaje, Usuario }] de este reclamo
 * @returns {{ eventos: Array<{ fecha, tipo, titulo, usuario, detalle, error, desdeAnterior }>, resumen }}
 *          eventos del más viejo al más nuevo; desdeAnterior en ms.
 */
export function armarHistorial({ reclamo, comentarios = [], lineas = [], bitacora = [] }) {
  const eventos = [];
  const agregar = (e) => e.fecha && eventos.push({ detalle: null, error: false, ...e, fecha: new Date(e.fecha) });

  agregar({ fecha: reclamo.CreatedAt, tipo: 'creado', titulo: 'Reclamo creado', usuario: reclamo.CreatedBy });

  for (const c of comentarios) {
    agregar({
      fecha: c.Fecha,
      tipo: c.Tipo === 'devuelto' ? 'devuelto' : 'reenviado',
      titulo: c.Tipo === 'devuelto' ? 'Devuelto para arreglo' : 'Arreglado y reenviado',
      usuario: c.Usuario,
      detalle: c.Texto || null,
    });
  }

  // Bitácora: lo que ya está en los comentarios no se repite.
  const yaEsta = (tipo, fecha) => eventos.some((e) => e.tipo === tipo && Math.abs(ms(e.fecha) - ms(fecha)) <= DOS_MIN);
  for (const b of bitacora) {
    if (b.Clase === 'error') {
      agregar({ fecha: b.Fecha, tipo: 'error', titulo: b.Accion, usuario: b.Usuario, detalle: b.Mensaje || null, error: b.Nivel === 'falla' ? 'falla' : 'aviso' });
      continue;
    }
    const tipo = tipoDeAccion(b.Accion);
    if ((tipo === 'devuelto' || tipo === 'reenviado') && yaEsta(tipo, b.Fecha)) continue;
    agregar({ fecha: b.Fecha, tipo, titulo: b.Accion, usuario: b.Usuario, detalle: b.Mensaje || null });
  }

  // Lo que la bitácora no tiene (pasó antes del 2026-11-13) sale de los datos del reclamo.
  const enBitacora = (tipo, fecha) => eventos.some((e) => e.tipo === tipo && Math.abs(ms(e.fecha) - ms(fecha)) <= DOS_MIN);
  if (reclamo.DecisionAt && !enBitacora('decision', reclamo.DecisionAt)) {
    const sistema = reclamo.DecisionBy === 'sistema';
    agregar({
      fecha: reclamo.DecisionAt,
      tipo: 'decision',
      titulo: sistema ? 'Cerrado automáticamente' : reclamo.Status === 'rechazado' ? 'Rechazado por la compradora' : 'Confirmado por la compradora',
      usuario: sistema ? null : reclamo.DecisionBy,
    });
  }
  if (reclamo.EnviadoContabilidadAt && !enBitacora('contabilidad', reclamo.EnviadoContabilidadAt)) {
    agregar({ fecha: reclamo.EnviadoContabilidadAt, tipo: 'contabilidad', titulo: 'Enviado a contabilidad', usuario: reclamo.EnviadoContabilidadBy });
  }
  if (reclamo.RetiroProveedorRegistradoAt && !enBitacora('retiro', reclamo.RetiroProveedorRegistradoAt)) {
    agregar({ fecha: reclamo.RetiroProveedorRegistradoAt, tipo: 'retiro', titulo: 'Entregado al proveedor', usuario: reclamo.RetiroProveedorPor });
  }
  // Decisiones de productos de una persona (no las automáticas), agrupadas por quién y minuto.
  if (!eventos.some((e) => e.tipo === 'productos')) {
    const grupos = new Map();
    for (const l of lineas) {
      if (!l.DecAt || !l.DecBy || l.DecBy === 'sistema' || l.DecStatus === 'pendiente') continue;
      const k = `${l.DecBy}|${Math.floor(ms(l.DecAt) / 60000)}`;
      const g = grupos.get(k) ?? { fecha: l.DecAt, usuario: l.DecBy, aprobados: 0, rechazados: 0 };
      if (l.DecStatus === 'aprobado') g.aprobados += 1;
      else g.rechazados += 1;
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      const partes = [g.aprobados && `${g.aprobados} aprobado(s)`, g.rechazados && `${g.rechazados} rechazado(s)`].filter(Boolean).join(', ');
      agregar({ fecha: g.fecha, tipo: 'productos', titulo: `Decidió productos: ${partes}`, usuario: g.usuario });
    }
  }

  eventos.sort((a, b) => a.fecha - b.fecha);
  let anterior = null;
  for (const e of eventos) {
    e.desdeAnterior = anterior ? e.fecha - anterior : null;
    if (!e.error) anterior = e.fecha;
  }

  // Tiempo en espera de arreglo: de cada devolución a su reenvío (o hasta ahora si sigue devuelto).
  let esperaArreglo = 0;
  let devueltoDesde = null;
  let vecesDevuelto = 0;
  for (const e of eventos) {
    if (e.tipo === 'devuelto' && devueltoDesde === null) {
      devueltoDesde = e.fecha;
      vecesDevuelto += 1;
    } else if (e.tipo === 'reenviado' && devueltoDesde !== null) {
      esperaArreglo += e.fecha - devueltoDesde;
      devueltoDesde = null;
    }
  }
  const sigueEnArreglo = reclamo.Status === 'devuelto' && devueltoDesde !== null;
  return {
    eventos,
    resumen: {
      total: eventos.length,
      errores: eventos.filter((e) => e.error).length,
      vecesDevuelto,
      esperaArregloMs: esperaArreglo,
      enArregloDesde: sigueEnArreglo ? devueltoDesde : null,
      duracionMs: eventos.length ? eventos.at(-1).fecha - eventos[0].fecha : 0,
    },
  };
}
