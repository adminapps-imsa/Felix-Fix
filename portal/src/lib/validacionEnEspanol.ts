/**
 * Los avisos nativos de los formularios («Please fill out this field») salen
 * en el idioma del navegador, no en el de la página: `lang="es"` no basta.
 * Esto los reemplaza en todo el portal por textos en español, sin tocar cada
 * campo: al dispararse `invalid` se pone el mensaje con setCustomValidity, y
 * al escribir se quita para que el navegador vuelva a validar.
 * Un mensaje propio que ya haya puesto un componente no se pisa.
 */

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const nuestros = new WeakSet<Campo>();

const fecha = (v: string) => {
  const [y, m, d] = v.split('-');
  return d && m && y ? `${d}/${m}/${y}` : v;
};

function mensaje(el: Campo): string {
  const v = el.validity;
  const tipo = el instanceof HTMLInputElement ? el.type : el instanceof HTMLSelectElement ? 'select' : 'textarea';
  const esFecha = tipo === 'date' || tipo === 'datetime-local' || tipo === 'month';

  if (v.valueMissing) {
    if (tipo === 'checkbox') return 'Marca esta casilla para continuar.';
    if (tipo === 'radio') return 'Elige una de las opciones.';
    if (tipo === 'file') return 'Selecciona un archivo.';
    if (tipo === 'select') return 'Elige una opción de la lista.';
    if (esFecha) return 'Elige una fecha.';
    return 'Completa este campo.';
  }
  if (v.badInput) return esFecha ? 'Escribe una fecha válida.' : tipo === 'number' ? 'Escribe un número.' : 'El valor no es válido.';
  if (v.typeMismatch) {
    if (tipo === 'email') return 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
    if (tipo === 'url') return 'Escribe una dirección web válida.';
    return 'El valor no es válido.';
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (v.tooShort) return `Escribe al menos ${el.minLength} caracteres (llevas ${el.value.length}).`;
    if (v.tooLong) return `Escribe como máximo ${el.maxLength} caracteres (llevas ${el.value.length}).`;
  }
  if (el instanceof HTMLInputElement) {
    if (v.rangeUnderflow) return esFecha ? `La fecha debe ser el ${fecha(el.min)} o posterior.` : `El valor debe ser ${el.min} o mayor.`;
    if (v.rangeOverflow) return esFecha ? `La fecha no puede ser posterior al ${fecha(el.max)}.` : `El valor debe ser ${el.max} o menor.`;
    if (v.stepMismatch) return 'Escribe un valor válido.';
    if (v.patternMismatch) return el.title || 'El formato no es válido.';
  }
  return 'Revisa este campo.';
}

const esCampo = (t: EventTarget | null): t is Campo =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

function alInvalido(e: Event) {
  const el = e.target;
  if (!esCampo(el)) return;
  // Un mensaje propio de un componente (customError que no pusimos nosotros) se respeta.
  if (el.validity.customError && !nuestros.has(el)) return;
  el.setCustomValidity('');
  if (el.validity.valid) return;
  el.setCustomValidity(mensaje(el));
  nuestros.add(el);
}

function alCambiar(e: Event) {
  const el = e.target;
  if (!esCampo(el)) return;
  // Se quita el mensaje: si el valor sigue mal, el próximo envío lo vuelve a poner.
  if (nuestros.has(el)) {
    el.setCustomValidity('');
    nuestros.delete(el);
  }
  // En un grupo de radios el aviso pudo quedar en otra opción (la primera): se limpia todo el grupo.
  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    (el.form ?? document).querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(el.name)}"]`).forEach((r) => {
      if (nuestros.has(r)) {
        r.setCustomValidity('');
        nuestros.delete(r);
      }
    });
  }
}

let instalado = false;

export function validacionEnEspanol() {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;
  // `invalid` no burbujea: se escucha en la fase de captura.
  document.addEventListener('invalid', alInvalido, true);
  document.addEventListener('input', alCambiar, true);
  document.addEventListener('change', alCambiar, true);
}
