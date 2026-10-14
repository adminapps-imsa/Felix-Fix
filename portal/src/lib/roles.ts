/**
 * Nombre que se muestra en el portal para cada rol de Keycloak. El rol en
 * Keycloak (y en RolPermisos) sigue llamándose igual: solo cambia lo que se
 * ve. Para renombrarlo de verdad hay que hacerlo en Keycloak (la cuenta de
 * servicio del portal no puede) y migrar sus filas de RolPermisos.
 */
const NOMBRE_VISIBLE: Record<string, string> = {};

export const nombreRol = (rol: string) => NOMBRE_VISIBLE[rol] || rol;
