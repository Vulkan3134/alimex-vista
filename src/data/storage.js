// Persistencia local. Define el "adaptador" de almacenamiento: el resto de la aplicación solo conoce
// esta interfaz, de modo que puede reemplazarse por IndexedDB o por una API sin tocar la lógica.
//
// interface StorageAdapter {
//   load(): object | null
//   save(state: object): void   (puede lanzar si no hay espacio)
//   clear(): void
//   subscribe(onExternalChange: () => void): () => void   (cambios hechos desde otra pestaña)
// }

export const STORAGE_KEY = 'alimex.logistica.estado.v1';

/** Adaptador sobre localStorage (persistente entre sesiones, funciona sin internet). */
export function createLocalStorageAdapter(key = STORAGE_KEY, storage = globalThis.localStorage) {
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        console.error('No se pudo leer el almacenamiento local', error);
        return null;
      }
    },
    save(state) {
      storage.setItem(key, JSON.stringify(state));
    },
    clear() {
      storage.removeItem(key);
    },
    subscribe(onExternalChange) {
      const handler = (event) => {
        if (event.key === key || event.key === null) onExternalChange();
      };
      globalThis.addEventListener?.('storage', handler);
      return () => globalThis.removeEventListener?.('storage', handler);
    },
  };
}

/** Adaptador en memoria (pruebas automáticas). */
export function createMemoryAdapter(initial = null) {
  let data = initial ? JSON.stringify(initial) : null;
  const listeners = new Set();
  return {
    load: () => (data ? JSON.parse(data) : null),
    save(state) {
      data = JSON.stringify(state);
    },
    clear() {
      data = null;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Simula un cambio hecho por otra pestaña (solo pruebas). */
    _externalChange(state) {
      data = JSON.stringify(state);
      for (const fn of listeners) fn();
    },
  };
}
