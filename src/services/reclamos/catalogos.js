// Catálogos de los dropdowns del formulario de reclamos.
//
// - Proveedor / mundo / departamento / marca / compradora: del catálogo de
//   FelixApproval (compradoras_proveedores). Se carga entero en memoria (~2k
//   filas) y se refresca cada pocos minutos, así el formulario no consulta otra
//   base por cada tecla ni por cada reclamo.
// - División / motivo: tabla local ReclamoCatalogos, que crece cuando alguien
//   escribe un valor nuevo al crear un reclamo.
import * as repo from '../../repositories/reclamosRepository.js';
import { logger } from '../../utils/logger.js';

const TTL_MS = 10 * 60 * 1000;
// Valores de relleno del catálogo origen que no deben ofrecerse como opción.
const VACIO = new Set(['', '-']);

let cache = null; // { at, porProveedor: Map<UPPER, entrada>, listas }
let cargando = null;

const limpiar = (v) => {
  const s = String(v ?? '').trim();
  return VACIO.has(s) ? null : s;
};
// Ordena y quita duplicados que solo difieren en mayúsculas ('Belleza' / 'BELLEZA').
const ordenar = (set) => {
  const unicos = new Map();
  for (const v of set) if (!unicos.has(v.toUpperCase())) unicos.set(v.toUpperCase(), v);
  return [...unicos.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

function construir(filas) {
  const porProveedor = new Map();
  const todos = { mundos: new Set(), departamentos: new Set(), marcas: new Set(), compradoras: new Set() };
  for (const f of filas) {
    const proveedor = limpiar(f.proveedor);
    const mundo = limpiar(f.mundo);
    const departamento = limpiar(f.division);
    const marca = limpiar(f.marca);
    const compradora = limpiar(f.compradora);
    if (mundo) todos.mundos.add(mundo);
    if (departamento) todos.departamentos.add(departamento);
    if (marca) todos.marcas.add(marca);
    if (compradora) todos.compradoras.add(compradora);
    if (!proveedor) continue;

    const key = proveedor.toUpperCase();
    let e = porProveedor.get(key);
    if (!e) {
      e = { proveedor, mundos: new Set(), departamentos: new Set(), marcas: new Set(), compradoras: new Set() };
      porProveedor.set(key, e);
    }
    if (mundo) e.mundos.add(mundo);
    if (departamento) e.departamentos.add(departamento);
    if (marca) e.marcas.add(marca);
    if (compradora) e.compradoras.add(compradora);
  }
  return {
    at: Date.now(),
    porProveedor,
    listas: {
      proveedores: ordenar(new Set([...porProveedor.values()].map((e) => e.proveedor))),
      mundos: ordenar(todos.mundos),
      departamentos: ordenar(todos.departamentos),
      marcas: ordenar(todos.marcas),
      compradoras: ordenar(todos.compradoras),
    },
  };
}

/**
 * Catálogo de FelixApproval, cacheado. Si la recarga falla se sigue usando el
 * último que cargó bien; solo lanza si nunca se pudo cargar.
 */
async function catalogoProveedores() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (!cargando) {
    cargando = repo
      .listarCatalogoProveedores()
      .then((filas) => (cache = construir(filas)))
      .catch((err) => {
        logger.warn({ err: err.message }, 'No se pudo cargar el catálogo de proveedores de FelixApproval');
        if (cache) return cache;
        throw err;
      })
      .finally(() => {
        cargando = null;
      });
  }
  return cargando;
}

const aEntradaPublica = (e) => ({
  proveedor: e.proveedor,
  mundos: ordenar(e.mundos),
  departamentos: ordenar(e.departamentos),
  marcas: ordenar(e.marcas),
  compradoras: ordenar(e.compradoras),
});

/**
 * Datos del proveedor en el catálogo: coincidencia exacta (sin importar
 * mayúsculas) o, si no hay, el nombre más largo que contenga o esté contenido
 * en el buscado (los Excel a veces traen el nombre recortado o con sufijos).
 */
export async function relacionProveedor(nombre) {
  const buscado = String(nombre || '').trim().toUpperCase();
  if (!buscado) return null;
  let cat;
  try {
    cat = await catalogoProveedores();
  } catch {
    return null;
  }
  const exacta = cat.porProveedor.get(buscado);
  if (exacta) return aEntradaPublica(exacta);
  let mejor = null;
  for (const [key, e] of cat.porProveedor) {
    if (key.length < 3) continue; // nombres de 1-2 letras coincidirían con casi todo
    if ((buscado.includes(key) || key.includes(buscado)) && (!mejor || key.length > mejor.key.length)) mejor = { key, e };
  }
  return mejor ? aEntradaPublica(mejor.e) : null;
}

/** El único valor de un array, o null si hay 0 o varios (no se adivina). */
export const unico = (arr) => (arr?.length === 1 ? arr[0] : null);

/** Todo lo que necesita el formulario en una sola respuesta. */
export async function catalogosFormulario() {
  const [prov, divisiones, motivos] = await Promise.all([
    catalogoProveedores().then(
      (c) => ({ ...c.listas, disponible: true }),
      () => ({ proveedores: [], mundos: [], departamentos: [], marcas: [], compradoras: [], disponible: false })
    ),
    repo.listarCatalogo('division'),
    repo.listarCatalogo('motivo'),
  ]);
  return { ...prov, divisiones, motivos };
}

/** Compradoras válidas, o null si el catálogo no está disponible (no se bloquea la creación). */
export async function compradorasValidas() {
  try {
    return (await catalogoProveedores()).listas.compradoras;
  } catch {
    return null;
  }
}
