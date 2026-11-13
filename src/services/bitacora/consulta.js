// Visor de la bitácora (Configuración → Bitácora).
import * as repo from '../../repositories/bitacoraRepository.js';
import { MODULOS, numeroCaso } from '../../domain/bitacora.js';

const OFFSET_PANAMA_H = 5; // Panamá: UTC-5 todo el año

/** 'AAAA-MM-DD' (día de Panamá) → inicio de ese día en UTC (+`dias`). */
function inicioDia(fecha, dias = 0) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias, OFFSET_PANAMA_H));
}

const aRoles = (s) => (s ? s.split(',').filter(Boolean) : []);

export async function consultar(query) {
  const clase = query.clase === 'error' ? 'error' : 'actividad';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 50));
  const f = {
    desde: query.desde ? inicioDia(query.desde) : undefined,
    hasta: query.hasta ? inicioDia(query.hasta, 1) : undefined,
    usuario: query.usuario || undefined,
    rol: query.rol || undefined,
    modulo: query.modulo || undefined,
    nivel: clase === 'error' ? query.nivel || undefined : undefined,
    q: query.q?.trim() || undefined,
  };
  const [{ total, items }, conteos, opciones] = await Promise.all([
    repo.listar(clase, f, { offset: (page - 1) * pageSize, pageSize }),
    repo.resumen(f),
    repo.opciones(),
  ]);

  const suma = (pred) => conteos.filter(pred).reduce((n, c) => n + c.n, 0);
  return {
    clase,
    data: items.map((b) => ({
      id: b.BitacoraId,
      fecha: b.Fecha,
      nivel: b.Nivel,
      modulo: b.Modulo,
      moduloNombre: MODULOS[b.Modulo] ?? b.Modulo,
      accion: b.Accion,
      mensaje: b.Mensaje,
      codigo: b.Codigo,
      usuario: b.Usuario,
      usuarioNombre: b.UsuarioNombre,
      roles: aRoles(b.Roles),
      metodo: b.Metodo,
      ruta: b.Ruta,
      estado: b.Estado,
      duracionMs: b.DuracionMs,
      caso: numeroCaso(b.RecursoTipo, b.ReclamoId, b.RecursoId),
      // Enlace al caso: el reclamo por su token, el reporte por su id.
      casoRuta: b.RecursoTipo === 'reclamo' && b.ReclamoId ? `/reclamos/${b.RecursoId}` : b.RecursoTipo === 'reporte' ? `/productos-danados?reporte=${b.RecursoId}` : null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    resumen: {
      actividad: suma((c) => c.Clase === 'actividad'),
      errores: suma((c) => c.Clase === 'error'),
      avisos: suma((c) => c.Clase === 'error' && c.Nivel === 'aviso'),
      fallas: suma((c) => c.Clase === 'error' && c.Nivel === 'falla'),
      porModulo: Object.fromEntries(
        Object.keys(MODULOS).map((m) => [m, suma((c) => c.Clase === clase && c.Modulo === m && (!f.nivel || c.Nivel === f.nivel))])
      ),
    },
    filtros: {
      modulos: Object.entries(MODULOS).map(([id, nombre]) => ({ id, nombre })),
      usuarios: opciones.usuarios.map((u) => ({ usuario: u.Usuario, nombre: u.UsuarioNombre || u.Usuario })),
      roles: opciones.roles,
    },
  };
}
