// Entorno de pruebas: almacén en memoria, reloj fijo y servicios reales (sin datos simulados aparte de la semilla).
import { setClock } from '../src/core/clock.js';
import { createMemoryAdapter } from '../src/data/storage.js';
import { createStore } from '../src/data/store.js';
import { createDemoState } from '../src/data/seed/index.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import { createMovementService } from '../src/services/movementService.js';
import { createProductService } from '../src/services/productService.js';

/** 31-oct-2026 20:30 (hora local del equipo). */
export const NOW = new Date(2026, 9, 31, 20, 30, 0);

let seedJson = null;

export function seedState(now = NOW) {
  return createDemoState(now);
}

export function makeEnv(now = NOW) {
  setClock(now);
  if (!seedJson) seedJson = JSON.stringify(createDemoState(now));
  const adapter = createMemoryAdapter(JSON.parse(seedJson));
  const clock = () => new Date(now);
  const store = createStore(adapter, { now: clock });
  store.init();
  const deps = { now: clock };
  return {
    store,
    adapter,
    now: clock,
    inventory: createInventoryService(store, deps),
    movements: createMovementService(store, deps),
    products: createProductService(store, deps),
  };
}

/** Atajo para armar una operación de salida válida. */
export function exitOp(overrides = {}) {
  return {
    type: 'SALIDA',
    at: new Date(NOW.getTime() - 60000),
    responsible: 'Iván Vega',
    document: 'REQ-TEST-1',
    notes: '',
    departmentId: 'DEP-OPE',
    lines: [],
    ...overrides,
  };
}
