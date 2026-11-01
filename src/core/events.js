// Emisor de eventos mínimo. Se usa para avisar a las vistas que los datos cambiaron.

/**
 * @returns {{ on: (event: string, fn: Function) => () => void, emit: (event: string, payload?: any) => void }}
 */
export function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (error) {
          console.error(`Error en un suscriptor del evento "${event}"`, error);
        }
      }
    },
  };
}
