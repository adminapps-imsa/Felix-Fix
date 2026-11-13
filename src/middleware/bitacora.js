// Bitácora: al terminar cada petición a la API se decide si se anota
// (src/domain/bitacora.js) y se manda al registro en segundo plano. No
// cambia la respuesta ni la demora.
import { describirPeticion, clasificarPeticion, rolesVisibles } from '../domain/bitacora.js';
import { registrar } from '../services/bitacora/registro.js';

export function bitacora(req, res, next) {
  const inicio = process.hrtime.bigint();
  // El mensaje de error que se le muestra al usuario sale del JSON de la respuesta.
  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    if (res.statusCode >= 400 && cuerpo && typeof cuerpo === 'object') {
      res.locals.bitacoraMensaje = cuerpo.message;
      res.locals.bitacoraCodigo = cuerpo.code || cuerpo.error;
    }
    return json(cuerpo);
  };

  res.on('finish', () => {
    try {
      const ruta = req.originalUrl.replace(/^\/api/, '').split('?')[0];
      const clase = clasificarPeticion(req.method, ruta, res.statusCode);
      if (!clase) return;
      const d = describirPeticion(req.method, ruta);
      const u = req.user ?? res.locals.bitacoraUsuario ?? null;
      registrar({
        ...clase,
        modulo: d.modulo,
        accion: d.accion,
        recursoTipo: d.recursoTipo,
        recursoId: d.recursoId,
        // 5xx no controlado: el error real (al usuario solo se le dijo «Error interno»).
        mensaje: res.locals.bitacoraError ?? res.locals.bitacoraMensaje ?? null,
        codigo: res.locals.bitacoraCodigo ?? null,
        usuario: u?.username ?? null,
        usuarioNombre: u?.name ?? null,
        roles: rolesVisibles(u?.roles),
        metodo: req.method,
        ruta,
        estado: res.statusCode,
        duracionMs: Number(process.hrtime.bigint() - inicio) / 1e6,
      });
    } catch {
      // la bitácora nunca rompe una petición
    }
  });
  next();
}
