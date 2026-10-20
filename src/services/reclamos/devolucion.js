// Devolución a quien creó el reclamo: la compradora lo devuelve con un
// comentario, quien lo creó corrige datos y documentos y lo reenvía. Las
// reglas están en src/domain/reclamo.js (motivoNoDevolver, motivoNoCorregir,
// motivoNoReenviar); aquí solo se leen los datos y se avisa por correo.
import * as repo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import * as dominio from '../../domain/reclamo.js';
import { diaPanama } from '../../domain/tablero.js';
import { corregirDatosSchema } from '../../validators/reclamos.schema.js';
import { exigirDivision } from '../divisiones.js';
import { tienePermiso, PERMISO_CONFIGURACION } from '../acceso/permisos.js';
import { leerNotaPdf } from '../contabilidad/leerNotaPdf.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { avisarReclamo } from '../correo/avisosReclamos.js';
import { datosDeUsuario } from '../acceso/keycloakAdmin.js';
import { env } from '../../config/env.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { obtenerOFallar, validarToken, exigir, nombreUsuario, detalle, conDocumentos } from './comun.js';

const SAP_DOC_OPCIONAL = env.reclamos.sapDocOpcional && env.nodeEnv !== 'production';

/** Quien corrige: su username y si es el super administrador (puede corregir cualquiera). */
const quien = (usuario) => ({ username: nombreUsuario(usuario), esAdmin: tienePermiso(usuario, PERMISO_CONFIGURACION) });

const docsDe = (r) => [r.SapDoc1, r.SapDoc2, r.SapDoc3, ...parseJsonArray(r.SapDocsExtra)].filter((d) => d && String(d).trim());

/** Traduce el resultado del repositorio (null, { bloqueado }, { ok }) a error HTTP. */
function exigirResultado(res) {
  if (!res) throw notFound('Reclamo no encontrado.');
  exigir(res.bloqueado);
}

/** Compradora: devuelve el reclamo pendiente a quien lo creó, con lo que hay que corregir. */
export async function devolver(token, { comentario }, usuario) {
  validarToken(token);
  const texto = String(comentario ?? '').trim();
  exigirResultado(
    await repo.devolver(token, { comentario: texto, usuario: nombreUsuario(usuario), verificar: (fila) => dominio.motivoNoDevolver(fila, texto) })
  );
  const dto = await detalle(token);
  logger.info({ reclamo: dto.Numero, usuario: nombreUsuario(usuario), para: dto.CreatedBy }, 'Reclamo devuelto a quien lo creó');
  avisarReclamo('devuelto', dto, { para: dto.CreatedBy, comentario: texto, de: usuario.name || nombreUsuario(usuario) });
  return dto;
}

/** Quien lo creó corrige los datos del formulario y los documentos SAP (el origen y los productos no cambian). */
export async function corregirDatos(token, body, usuario) {
  const r = await obtenerOFallar(token);
  exigir(dominio.motivoNoCorregir(r, quien(usuario)));

  const result = corregirDatosSchema.safeParse(body);
  if (!result.success) throw badRequest(result.error.issues[0]?.message || 'Datos inválidos.', { detalles: result.error.flatten() });
  const d = result.data;

  if (r.Origen === 'tienda' && !d.sucursal) throw badRequest('La sucursal es obligatoria para reclamos de tienda.');
  const division = r.Origen === 'cedi' ? await exigirDivision(d.division) : '';
  const fechaLlegada = dominio.motivoFechaLlegadaInvalida(d.fechaLlegadaMercancia, diaPanama(new Date()));
  if (fechaLlegada) throw badRequest(fechaLlegada.mensaje, { code: fechaLlegada.code });

  const docs = d.sapDocs.map((x) => x.trim()).filter(Boolean);
  if (!docs.length && !SAP_DOC_OPCIONAL) throw badRequest('Ingresa al menos un documento SAP.');
  exigir(dominio.motivoDocsRepetidos(docs));

  const datos = {
    ...d,
    sucursal: r.Origen === 'tienda' ? d.sucursal : '',
    division,
    sapDoc1: docs[0],
    sapDoc2: docs[1],
    sapDoc3: docs[2],
    sapDocsExtra: docs.slice(3),
  };
  exigirResultado(
    await repo.actualizarDatos(token, datos, {
      docsSap: docs.map(dominio.normalizarDocSap),
      verificar: (fila) => dominio.motivoNoCorregir(fila, quien(usuario)),
      // Los documentos no pueden estar en OTRO reclamo (en este, sí: son los suyos).
      motivoDocs: (filas) =>
        dominio.motivoDocsEnOtrosReclamos(docs, conDocumentos(filas).filter((o) => String(o.Token).toUpperCase() !== String(r.Token).toUpperCase())),
    })
  );
  logger.info({ reclamo: dominio.numeroReclamo(r.ReclamoId), usuario: nombreUsuario(usuario) }, 'Datos del reclamo devuelto corregidos');
  return detalle(token);
}

/**
 * Documento SAP de cada PDF adjunto: el que quedó guardado al subirlo o, si
 * no se guardó (PDF subido antes de esta regla), el que trae impreso.
 * Map<filename, documento|null>.
 */
async function documentosDeLosPdf(adjuntos) {
  const mapa = new Map();
  for (const a of adjuntos.filter((x) => x?.tipo === 'pdf')) {
    if (a.documentoSap) {
      mapa.set(a.filename, a.documentoSap);
      continue;
    }
    const nota = await leerNotaPdf(reclamoArchivoPath(a.filename)).catch(() => null);
    mapa.set(a.filename, nota?.numeroDocumento ? String(nota.numeroDocumento).trim() : null);
  }
  return mapa;
}

/** Quien lo creó lo reenvía a la compradora (vuelve a pendiente), con una respuesta opcional. */
export async function reenviar(token, { comentario }, usuario) {
  const r = await obtenerOFallar(token);
  exigir(dominio.motivoNoCorregir(r, quien(usuario)));
  // Se leen fuera de la transacción (puede tardar); dentro se usa la lista bloqueada.
  const docsPdf = await documentosDeLosPdf(parseJsonArray(r.AdjuntosExtra));
  const texto = String(comentario ?? '').trim();
  exigirResultado(
    await repo.reenviar(token, {
      comentario: texto,
      usuario: nombreUsuario(usuario),
      verificar: (fila) =>
        dominio.motivoNoReenviar(fila, quien(usuario), {
          docs: docsDe(fila),
          pdfs: parseJsonArray(fila.AdjuntosExtra)
            .filter((a) => a?.tipo === 'pdf')
            .map((a) => ({ nombre: a.originalname || a.filename, documento: a.documentoSap || docsPdf.get(a.filename) || null })),
          documentoOpcional: SAP_DOC_OPCIONAL,
        }),
    })
  );
  const dto = await detalle(token);
  // Se avisa a la compradora que lo devolvió (la última devolución).
  const devolucion = [...(dto.Comentarios || [])].reverse().find((c) => c.Tipo === 'devuelto');
  logger.info({ reclamo: dto.Numero, usuario: nombreUsuario(usuario), para: devolucion?.Usuario || null }, 'Reclamo corregido y reenviado a la compradora');
  if (devolucion) {
    const { nombre } = await datosDeUsuario(nombreUsuario(usuario));
    avisarReclamo('reenviado', dto, { para: devolucion.Usuario, comentario: texto, de: nombre || nombreUsuario(usuario) });
  }
  return dto;
}
