// Catálogo de permisos del portal. Es la lista de casillas que ve el
// administrador en Configuración → Roles y permisos. Cada ruta protegida del
// backend exige uno de estos códigos (middleware requirePermiso).
//
// Agregar un permiso nuevo = agregarlo aquí y usarlo en la ruta; no requiere
// migración (RolPermisos guarda el código como texto).
//
// Configuración NO es asignable: solo la tiene el rol de super administrador
// (Administrador). No aparece como casilla y, aunque quedara guardado para
// otro rol, permisosDeRoles() no se lo da.

export const PERMISOS = [
  { codigo: 'productos_danados.ver', modulo: 'Productos dañados', nombre: 'Ver reportes', descripcion: 'Ver la lista y el detalle de los reportes.' },
  { codigo: 'productos_danados.crear', modulo: 'Productos dañados', nombre: 'Crear reportes', descripcion: 'Registrar un producto dañado con su evidencia.' },
  { codigo: 'productos_danados.enviar', modulo: 'Productos dañados', nombre: 'Enviar al proveedor', descripcion: 'Enviar el reporte por correo al proveedor (con la foto y los adjuntos).' },
  { codigo: 'productos_danados.aprobar', modulo: 'Productos dañados', nombre: 'Devolución aprobada o NF', descripcion: 'Registrar la respuesta del proveedor: Devolución aprobada o NF.' },
  { codigo: 'productos_danados.ver_nf', modulo: 'Productos dañados', nombre: 'Ver solo NF y devoluciones', descripcion: 'Ver solo los reportes NF y, si el rol también sube el documento para contabilidad, las devoluciones aprobadas; no los pendientes. Con «Ver reportes» ve todos (Gof).' },
  { codigo: 'productos_danados.nf_documento', modulo: 'Productos dañados', nombre: 'Documento 1700 de los NF', descripcion: 'En los reportes NF, marcar el check «Documento 1700» y pasarlo al supervisor GOF (Gof).' },
  { codigo: 'productos_danados.nf', modulo: 'Productos dañados', nombre: 'Validar NF', descripcion: 'Recibir los NF con el documento 1700 marcado, escribir el «Documento salida de NF», validarlos y cerrarlos (supervisor GOF).' },
  { codigo: 'productos_danados.documentar', modulo: 'Productos dañados', nombre: 'Documento para contabilidad', descripcion: 'En las devoluciones aprobadas, subir el PDF o Excel y enviarlo a contabilidad (GOF).' },
  { codigo: 'productos_danados.pago', modulo: 'Productos dañados', nombre: 'Confirmar pago del proveedor', descripcion: 'Registrar que se recibió el pago del proveedor y cerrar el reporte (contabilidad).' },
  { codigo: 'productos_danados.eliminar', modulo: 'Productos dañados', nombre: 'Eliminar', descripcion: 'Eliminar reportes con su foto y adjuntos (no los que están en contabilidad, cerrados o dados de baja en SAP).' },
  { codigo: 'productos_danados.procesar', modulo: 'Productos dañados', nombre: 'Procesar en SAP', descripcion: 'Dar de baja en SAP los reportes aprobados.' },

  { codigo: 'reclamos.ver', modulo: 'Reclamos', nombre: 'Ver reclamos', descripcion: 'Ver la lista, el detalle, los productos y los adjuntos.' },
  { codigo: 'reclamos.crear', modulo: 'Reclamos', nombre: 'Crear reclamos', descripcion: 'Subir el Excel, crear el reclamo y adjuntar archivos a los propios.' },
  { codigo: 'reclamos.adjuntar', modulo: 'Reclamos', nombre: 'Adjuntar en cualquier reclamo', descripcion: 'Subir PDF o Excel en el detalle de cualquier reclamo, no solo en los propios (Torre de Control).' },
  { codigo: 'reclamos.decidir', modulo: 'Reclamos', nombre: 'Aprobar o rechazar', descripcion: 'Decidir reclamos y productos, adjuntar archivos a cualquier reclamo y enviar los reclamos cerrados a contabilidad.' },
  { codigo: 'reclamos.enviar_contabilidad', modulo: 'Reclamos', nombre: 'Enviar reclamos a contabilidad', descripcion: 'Enviar a contabilidad los reclamos ya cerrados por la compradora (Gof, Torre de Control), después de subir el documento con lo aprobado.' },
  { codigo: 'reclamos.contabilidad', modulo: 'Reclamos', nombre: 'Recibir reclamos en contabilidad', descripcion: 'Recibir por correo los reclamos que la compradora envía a contabilidad, con sus productos y adjuntos.' },
  { codigo: 'reclamos.solo_tienda', modulo: 'Reclamos', nombre: 'Solo reclamos de Tienda', descripcion: 'Al crear un reclamo solo puede elegir Tienda, no CEDI (Gof).' },
  { codigo: 'reclamos.eliminar', modulo: 'Reclamos', nombre: 'Eliminar', descripcion: 'Eliminar reclamos y sus adjuntos.' },
];

export const PERMISO_CONFIGURACION = 'configuracion.administrar';

/** true si el usuario de la petición (req.user) tiene el permiso. */
export const tienePermiso = (user, permiso) => Boolean(user?.permisos?.has(permiso));

/** Los que se pueden dar a un rol desde Configuración. */
export const ASIGNABLES = new Set(PERMISOS.map((p) => p.codigo));
/** Los que quitan opciones en vez de darlas: el super administrador no los lleva. */
export const RESTRICCIONES = new Set(['reclamos.solo_tienda']);
/** Todos (los del super administrador). */
export const CODIGOS = new Set([...[...ASIGNABLES].filter((p) => !RESTRICCIONES.has(p)), PERMISO_CONFIGURACION]);
