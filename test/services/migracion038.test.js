import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSucursales } from '../../sql/migrations/038_tiendas_nombres_oficiales.js';

const tiendas = [
  { Codigo: 'TD04', Nombre: 'Vía España' },
  { Codigo: 'TD15', Nombre: 'Multiplaza' },
  { Codigo: 'TD20', Nombre: 'Albrook' },
  { Codigo: 'TD26', Nombre: 'Alta Plaza' },
  { Codigo: 'TD28', Nombre: 'Costa del Este' },
  { Codigo: 'TD30', Nombre: 'Metromall' },
];

test('las sucursales de Prod quedan con el nombre del catálogo', () => {
  // Las que había en Prod el 2026-11-13.
  const reclamos = [
    { ReclamoId: 3, Sucursal: 'COSTA DEL ESTE' },
    { ReclamoId: 4, Sucursal: 'ALTAPLAZA' },
    { ReclamoId: 5, Sucursal: 'Via España' },
    { ReclamoId: 6, Sucursal: 'Multiplaza' },
    { ReclamoId: 7, Sucursal: 'Albrook' },
    { ReclamoId: 8, Sucursal: 'Town Center' },
    { ReclamoId: 9, Sucursal: 'Chitré' },
  ];
  const { cambios, sinTienda } = planSucursales(reclamos, tiendas);
  assert.deepEqual(cambios, [
    { reclamoId: 3, antes: 'COSTA DEL ESTE', ahora: 'Costa del Este' },
    { reclamoId: 4, antes: 'ALTAPLAZA', ahora: 'Alta Plaza' },
    { reclamoId: 5, antes: 'Via España', ahora: 'Vía España' },
    { reclamoId: 8, antes: 'Town Center', ahora: 'Costa del Este' },
  ]);
  assert.deepEqual(sinTienda.map((r) => r.ReclamoId), [9]);
  // Idempotente: con los nombres ya corregidos no cambia nada.
  const corregidos = reclamos.map((r) => ({ ...r, Sucursal: cambios.find((c) => c.reclamoId === r.ReclamoId)?.ahora ?? r.Sucursal }));
  assert.equal(planSucursales(corregidos, tiendas).cambios.length, 0);
});
