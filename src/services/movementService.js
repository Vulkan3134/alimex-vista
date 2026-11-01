// Servicio de movimientos: ÚNICA vía para modificar existencias.
// Valida la operación completa y, si es correcta, la aplica de forma atómica y la registra en el historial.
import { applyPlan, planOperation } from '../domain/movements.js';

/**
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @param {{now: () => Date}} deps
 */
export function createMovementService(store, { now }) {
  return {
    /**
     * Valida sin registrar (para mostrar errores y advertencias mientras se completa el formulario).
     * @param {import('../domain/movements.js').OperationInput} operation
     */
    validate(operation) {
      return planOperation(store.getState(), operation, now());
    },

    /**
     * Registra una operación con una o varias líneas. Si alguna línea es inválida no se registra ninguna.
     * @param {import('../domain/movements.js').OperationInput} operation
     */
    register(operation) {
      const result = planOperation(store.getState(), operation, now());
      if (!result.ok) return result;
      store.commit((draft) => applyPlan(draft, result.plan), `movimiento ${result.plan.operationId}`);
      return {
        ok: true,
        operationId: result.plan.operationId,
        movements: result.plan.movements,
        warnings: result.warnings,
      };
    },
  };
}
