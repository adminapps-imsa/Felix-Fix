import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarHistorial } from '../../src/domain/historialReclamo.js';

const h = (iso) => new Date(`2026-11-13T${iso}:00Z`);
const reclamo = { CreatedAt: h('10:00'), CreatedBy: 'gof1', Status: 'resuelto', DecisionAt: h('15:00'), DecisionBy: 'abatista' };

test('ordena, quita lo repetido y mide cuánto tardó cada paso', () => {
  const r = armarHistorial({
    reclamo,
    comentarios: [
      { Tipo: 'devuelto', Texto: 'El PDF no es del documento', Usuario: 'supgof', Fecha: h('11:00') },
      { Tipo: 'reenviado', Texto: 'Listo', Usuario: 'gof1', Fecha: h('13:30') },
    ],
    bitacora: [
      // La misma devolución que el comentario (1 min después): no se repite.
      { Fecha: h('11:01'), Clase: 'actividad', Accion: 'Devolvió el reclamo (supervisor GOF)', Usuario: 'supgof' },
      { Fecha: h('13:00'), Clase: 'actividad', Accion: 'Reemplazó el Excel del reclamo', Usuario: 'gof1' },
      { Fecha: h('12:50'), Clase: 'error', Nivel: 'aviso', Accion: 'Reemplazó el Excel del reclamo', Mensaje: 'Al Excel le falta la columna MOTIVO', Usuario: 'gof1' },
      { Fecha: h('15:00'), Clase: 'actividad', Accion: 'Cerró el reclamo (decisión)', Usuario: 'abatista' },
    ],
  });
  assert.deepEqual(
    r.eventos.map((e) => [e.tipo, e.usuario]),
    [
      ['creado', 'gof1'],
      ['devuelto', 'supgof'],
      ['error', 'gof1'],
      ['excel', 'gof1'],
      ['reenviado', 'gof1'],
      ['decision', 'abatista'],
    ]
  );
  // La decisión ya estaba en la bitácora: no se agrega otra desde el reclamo.
  assert.equal(r.eventos.filter((e) => e.tipo === 'decision').length, 1);
  // Cuánto tardó: el error no corta la cuenta (del devuelto 11:00 al Excel 13:00 = 2 h).
  assert.equal(r.eventos.find((e) => e.tipo === 'excel').desdeAnterior, 2 * 3600e3);
  assert.equal(r.resumen.vecesDevuelto, 1);
  assert.equal(r.resumen.esperaArregloMs, 2.5 * 3600e3);
  assert.equal(r.resumen.errores, 1);
  assert.equal(r.resumen.duracionMs, 5 * 3600e3);
});

test('reclamos de antes de la bitácora: sale de los datos del reclamo y las decisiones', () => {
  const r = armarHistorial({
    reclamo: { ...reclamo, EnviadoContabilidadAt: h('16:00'), EnviadoContabilidadBy: 'gsanjur' },
    lineas: [
      { DecStatus: 'aprobado', DecAt: h('14:10'), DecBy: 'abatista' },
      { DecStatus: 'rechazado', DecAt: h('14:10'), DecBy: 'abatista' },
      { DecStatus: 'aprobado', DecAt: h('10:00'), DecBy: 'sistema' },
    ],
  });
  assert.deepEqual(
    r.eventos.map((e) => e.titulo),
    ['Reclamo creado', 'Decidió productos: 1 aprobado(s), 1 rechazado(s)', 'Confirmado por la compradora', 'Enviado a contabilidad']
  );
});

test('sigue en espera de arreglo: se cuenta desde cuándo', () => {
  const r = armarHistorial({
    reclamo: { ...reclamo, Status: 'devuelto', DecisionAt: null },
    comentarios: [{ Tipo: 'devuelto', Texto: 'x', Usuario: 'abatista', Fecha: h('12:00') }],
  });
  assert.deepEqual(r.resumen.enArregloDesde, h('12:00'));
});
