// Cola de movimientos registrados sin conexión.
// Se guardan en el estado compartido y se validan contra las existencias al sincronizar.
import { planOperation, applyPlan } from '../domain/movements.js';

function nextQueueId(state) {
  const max = state.offlineQueue.reduce((m, i) => Math.max(m, Number(String(i.id).replace(/\D/g, '')) || 0), 0);
  return `OFF-${String(max + 1).padStart(4, '0')}`;
}

/**
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @param {{now: () => Date}} deps
 */
export function createOfflineQueue(store, { now }) {
  return {
    list() {
      return store.getState().offlineQueue || [];
    },

    pendingCount() {
      return (store.getState().offlineQueue || []).filter((i) => i.status === 'pendiente' || i.status === 'rechazado').length;
    },

    /**
     * Guarda una operación para sincronizarla después.
     * @param {import('../domain/movements.js').OperationInput} operation
     */
    enqueue(operation) {
      const preview = planOperation(store.getState(), { ...operation, source: 'MOVIL_SIN_CONEXION' }, now());
      const item = {
        id: nextQueueId(store.getState()),
        at: now().toISOString(),
        status: 'pendiente',
        operation: { ...operation, source: 'MOVIL_SIN_CONEXION' },
        previewErrors: preview.ok ? [] : preview.errors,
        resultErrors: [],
      };
      store.commit((draft) => {
        draft.offlineQueue.push(item);
      }, 'cola sin conexión');
      return item;
    },

    remove(id) {
      store.commit((draft) => {
        draft.offlineQueue = draft.offlineQueue.filter((i) => i.id !== id);
      }, 'quitar de cola');
    },

    /**
     * Intenta registrar cada ítem pendiente. Las líneas inválidas quedan visibles con el motivo.
     * @returns {{synced:number, rejected:number, items:object[]}}
     */
    sync() {
      const items = store.getState().offlineQueue.filter((i) => i.status === 'pendiente' || i.status === 'rechazado');
      let synced = 0;
      let rejected = 0;
      for (const item of items) {
        const current = store.getState();
        const still = current.offlineQueue.find((i) => i.id === item.id);
        if (!still || still.status === 'sincronizado') continue;
        const result = planOperation(current, still.operation, now());
        if (!result.ok) {
          rejected += 1;
          store.commit((draft) => {
            const target = draft.offlineQueue.find((i) => i.id === item.id);
            if (target) {
              target.status = 'rechazado';
              target.resultErrors = result.errors;
              target.syncedAt = now().toISOString();
            }
          }, 'cola rechazada');
          continue;
        }
        store.commit((draft) => {
          applyPlan(draft, result.plan);
          const target = draft.offlineQueue.find((i) => i.id === item.id);
          if (target) {
            target.status = 'sincronizado';
            target.resultErrors = [];
            target.operationId = result.plan.operationId;
            target.syncedAt = now().toISOString();
          }
        }, `sincronización ${result.plan.operationId}`);
        synced += 1;
      }
      return { synced, rejected, items: store.getState().offlineQueue };
    },
  };
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
