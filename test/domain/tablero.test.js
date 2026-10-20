import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodoValido,
  granularidad,
  diaPanama,
  inicioPeriodo,
  serie,
  resumirCola,
  promedioTramo,
  topConOtros,
} from '../../src/domain/tablero.js';

// 19-oct-2026, 10:00 en Panamá (15:00 UTC). Es lunes.
const ahora = new Date('2026-10-19T15:00:00Z');

test('periodo: solo los ofrecidos; cualquier otro valor es 30 días', () => {
  assert.equal(periodoValido('7'), 7);
  assert.equal(periodoValido(365), 365);
  assert.equal(periodoValido('15'), 30);
  assert.equal(periodoValido(undefined), 30);
});

test('granularidad: día hasta un mes, semana hasta un trimestre, mes el año', () => {
  assert.equal(granularidad(7), 'dia');
  assert.equal(granularidad(30), 'dia');
  assert.equal(granularidad(90), 'semana');
  assert.equal(granularidad(365), 'mes');
});

test('día de Panamá: antes de las 05:00 UTC todavía es el día anterior', () => {
  assert.equal(diaPanama('2026-10-19T04:59:00Z'), '2026-10-18');
  assert.equal(diaPanama('2026-10-19T05:00:00Z'), '2026-10-19');
});

test('inicio del periodo: 7 días = hoy y los 6 anteriores, desde la medianoche de Panamá', () => {
  assert.equal(inicioPeriodo(7, ahora).toISOString(), '2026-10-13T05:00:00.000Z');
  assert.equal(inicioPeriodo(1, ahora).toISOString(), '2026-10-19T05:00:00.000Z');
});

test('serie por día: sin huecos, cuenta en el día de Panamá e ignora lo anterior al periodo', () => {
  const desde = inicioPeriodo(7, ahora);
  const s = serie({
    entradas: ['2026-10-13T06:00:00Z', '2026-10-19T04:00:00Z', '2026-10-01T12:00:00Z', null],
    salidas: ['2026-10-19T14:00:00Z'],
    desde,
    ahora,
    gran: 'dia',
  });
  assert.equal(s.length, 7);
  assert.deepEqual(s[0], { desde: '2026-10-13', entradas: 1, salidas: 0 });
  // 04:00 UTC del 19 es el 18 en Panamá.
  assert.equal(s.find((g) => g.desde === '2026-10-18').entradas, 1);
  assert.deepEqual(s.at(-1), { desde: '2026-10-19', entradas: 0, salidas: 1 });
});

test('serie por semana: grupos desde el lunes; por mes: desde el día 1', () => {
  const semanas = serie({ entradas: ['2026-10-14T15:00:00Z'], salidas: [], desde: inicioPeriodo(90, ahora), ahora, gran: 'semana' });
  assert.ok(semanas.every((g) => new Date(`${g.desde}T00:00:00Z`).getUTCDay() === 1 || g === semanas[0]));
  assert.equal(semanas.find((g) => g.desde === '2026-10-12').entradas, 1);
  assert.equal(semanas.at(-1).desde, '2026-10-19');
  const meses = serie({ entradas: [], salidas: ['2026-03-02T15:00:00Z'], desde: inicioPeriodo(365, ahora), ahora, gran: 'mes' });
  assert.equal(meses.length, 13);
  assert.equal(meses.find((g) => g.desde === '2026-03-01').salidas, 1);
});

test('cola: rangos de antigüedad, promedio y los más antiguos primero', () => {
  const dias = (n) => new Date(ahora.getTime() - n * 86_400_000).toISOString();
  const c = resumirCola(
    [
      { id: 1, entrada: dias(1) },
      { id: 2, entrada: dias(5) },
      { id: 3, entrada: dias(10) },
      { id: 4, entrada: dias(20) },
      { id: 5, entrada: dias(2.9) },
      { id: 6, entrada: null },
    ],
    { ahora, top: 2 }
  );
  assert.equal(c.total, 5);
  assert.deepEqual(c.rangos.map((r) => r.n), [2, 1, 1, 1]);
  assert.equal(c.maxDias, 20);
  assert.equal(c.promedioDias, 7.8);
  assert.deepEqual(c.masAntiguos.map((i) => [i.id, i.dias]), [[4, 20], [3, 10]]);
});

test('cola vacía: sin promedio', () => {
  const c = resumirCola([], { ahora });
  assert.equal(c.total, 0);
  assert.equal(c.promedioDias, null);
  assert.deepEqual(c.masAntiguos, []);
});

test('tramo: promedio solo de los que terminaron en el periodo', () => {
  const desde = new Date('2026-10-10T05:00:00Z');
  const r = promedioTramo(
    [
      { inicio: '2026-10-10T00:00:00Z', fin: '2026-10-12T00:00:00Z' }, // 2 días
      { inicio: '2026-10-11T00:00:00Z', fin: '2026-10-15T00:00:00Z' }, // 4 días
      { inicio: '2026-09-01T00:00:00Z', fin: '2026-09-20T00:00:00Z' }, // terminó antes del periodo
      { inicio: '2026-10-11T00:00:00Z', fin: null }, // sigue abierto
    ],
    desde
  );
  assert.deepEqual(r, { n: 2, promedioDias: 3 });
  assert.deepEqual(promedioTramo([], desde), { n: 0, promedioDias: null });
});

test('top con «Otros»: no corta el total y no deja un «Otros» de uno solo', () => {
  const filas = Array.from({ length: 9 }, (_, i) => ({ etiqueta: `P${i}`, n: 9 - i, unidades: 1 }));
  const t = topConOtros(filas, 6);
  assert.equal(t.length, 7);
  assert.equal(t.at(-1).etiqueta, 'Otros (3)');
  assert.equal(t.reduce((s, f) => s + f.n, 0), filas.reduce((s, f) => s + f.n, 0));
  assert.equal(t.at(-1).unidades, 3);
  assert.equal(topConOtros(filas.slice(0, 7), 6).length, 7);
  assert.deepEqual(topConOtros([{ etiqueta: 'A', n: 0 }]), []);
});
