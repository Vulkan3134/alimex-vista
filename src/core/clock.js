// Reloj inyectable: permite fijar la fecha "actual" en las pruebas automáticas.

let override = null;

/** @returns {Date} */
export function now() {
  return override ? new Date(override.getTime()) : new Date();
}

/** Fija un instante (solo pruebas). Pasar null para volver al reloj real. */
export function setClock(date) {
  override = date ? new Date(date) : null;
}
