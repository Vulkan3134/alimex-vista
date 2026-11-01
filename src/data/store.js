// Almacén de datos ÚNICO y compartido por todos los módulos.
// - getState(): estado actual (solo lectura para las vistas).
// - commit(mutator): única vía de escritura; persiste y avisa a los suscriptores.
// - subscribe(fn): las vistas se redibujan solas cuando cambian los datos.
import { createEmitter } from '../core/events.js';
import { now as clockNow } from '../core/clock.js';
import { SCHEMA_VERSION } from './schema.js';
import { USERS } from './seed/catalog.js';
import { createDemoState } from './seed/index.js';

function syncCatalogUsers(state) {
  if (!Array.isArray(state.users)) return false;
  const byId = new Map(USERS.map((u) => [u.id, u]));
  let changed = false;
  const renamed = new Map();
  state.users = state.users.map((u) => {
    const next = byId.get(u.id);
    if (!next) return u;
    if (u.name !== next.name || u.role !== next.role) {
      if (u.name !== next.name) renamed.set(u.name, next.name);
      changed = true;
      return { ...u, name: next.name, role: next.role };
    }
    return u;
  });
  if (renamed.size) {
    for (const m of state.movements || []) {
      const next = renamed.get(m.responsible);
      if (next) m.responsible = next;
    }
    for (const a of state.audit || []) {
      const next = renamed.get(a.user);
      if (next) a.user = next;
    }
    for (const q of state.offlineQueue || []) {
      const next = renamed.get(q.responsible);
      if (next) q.responsible = next;
    }
  }
  return changed;
}

function isValidState(state) {
  return Boolean(
    state && state.meta && state.meta.schemaVersion === SCHEMA_VERSION
    && Array.isArray(state.products) && Array.isArray(state.locations) && Array.isArray(state.stock)
    && Array.isArray(state.movements) && Array.isArray(state.departments) && state.settings,
  );
}

/**
 * @param {ReturnType<typeof import('./storage.js').createLocalStorageAdapter>} adapter
 * @param {{now?: () => Date}} [options]
 */
export function createStore(adapter, options = {}) {
  const now = options.now || clockNow;
  const emitter = createEmitter();
  /** @type {import('./schema.js').AppState} */
  let state;
  let storageError = null;

  function persist() {
    try {
      adapter.save(state);
      storageError = null;
    } catch (error) {
      storageError = error;
      emitter.emit('storage-error', error);
    }
  }

  function init() {
    const loaded = adapter.load();
    if (isValidState(loaded)) {
      state = loaded;
      if (syncCatalogUsers(state)) persist();
    } else {
      state = createDemoState(now());
      persist();
    }
    adapter.subscribe(() => {
      const external = adapter.load();
      if (isValidState(external)) {
        state = external;
        emitter.emit('change', { reason: 'externo', source: 'external' });
      }
    });
    return state;
  }

  return {
    init,
    getState: () => state,

    /**
     * Única vía de escritura. Si el mutador falla, se restaura el último estado guardado.
     * @param {(draft: import('./schema.js').AppState) => void} mutator
     * @param {string} [reason]
     */
    commit(mutator, reason = 'cambio') {
      try {
        mutator(state);
        state.rev += 1;
      } catch (error) {
        const saved = adapter.load();
        if (isValidState(saved)) state = saved;
        emitter.emit('change', { reason: 'restaurado', source: 'local' });
        throw error;
      }
      persist();
      emitter.emit('change', { reason, source: 'local' });
    },

    /** Vuelve a cargar los datos de demostración originales (descarta lo registrado). */
    resetDemo() {
      state = createDemoState(now());
      persist();
      emitter.emit('change', { reason: 'reinicio', source: 'local' });
    },

    /** Reemplaza todo el estado (restauración de respaldo). Devuelve false si el archivo no es válido. */
    replaceState(next) {
      if (!isValidState(next)) return false;
      state = next;
      state.rev = (state.rev || 0) + 1;
      persist();
      emitter.emit('change', { reason: 'restauración', source: 'local' });
      return true;
    },

    subscribe: (fn) => emitter.on('change', fn),
    onStorageError: (fn) => emitter.on('storage-error', fn),
    getStorageError: () => storageError,

    /** Tamaño aproximado de los datos guardados (caracteres). */
    approximateSize: () => JSON.stringify(state).length,
  };
}
