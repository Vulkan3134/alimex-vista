// Construye el estado inicial de demostración (TODO ficticio). Es determinista: no usa Math.random().
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../schema.js';
import { addDays, dayKey } from '../../core/dates.js';
import {
  COMMITMENTS, DEPARTMENTS, LAYOUT, LEVEL_CAPACITY, PENDING, PRODUCT_SPECS, SUPPLIERS, USERS,
} from './catalog.js';
import { generateHistory, nominalDaily, reorderPointOf } from './history.js';

export const SEED_VERSION = 'demo-2026.1';

const pad3 = (n) => String(n).padStart(3, '0');

/**
 * @param {Date} now Fecha de referencia: el historial se genera hacia atrás desde este instante.
 * @returns {import('../schema.js').AppState}
 */
export function createDemoState(now) {
  const history = generateHistory(now);

  const products = PRODUCT_SPECS.map((spec) => ({
    sku: spec.sku,
    name: spec.name,
    category: spec.category,
    departmentId: spec.departmentId,
    unit: spec.unit,
    unitCost: spec.unitCost,
    active: true,
    params: {
      minStock: spec.minStock,
      reorderPoint: reorderPointOf(spec),
      safetyStock: spec.safetyStock,
      leadTimeDays: spec.leadTimeDays,
      consumptionMode: 'auto',
      manualDailyConsumption: Math.ceil(nominalDaily(spec) - 1e-10),
      purchaseMultiple: spec.purchaseMultiple,
      minOrderQty: spec.minOrderQty,
      supplierId: spec.supplierId,
    },
    handling: { weightKg: spec.weightKg, volumeL: spec.volumeL, restriction: spec.restriction },
  }));

  const locations = [];
  for (let aisle = 1; aisle <= LAYOUT.aisles; aisle++) {
    for (let rack = 1; rack <= LAYOUT.racks; rack++) {
      for (let level = 1; level <= LAYOUT.levels; level++) {
        const p2 = (n) => String(n).padStart(2, '0');
        locations.push({
          code: `P${p2(aisle)}-E${p2(rack)}-N${p2(level)}`,
          aisle,
          rack,
          level,
          capacityUnits: LEVEL_CAPACITY[level],
          active: true,
        });
      }
    }
  }

  const supplierOf = new Map(PRODUCT_SPECS.map((s) => [s.sku, s.supplierId]));
  const pendingReceipts = PENDING.map(([sku, qtyOrdered, qtyReceived, days], i) => ({
    id: `OC-DEMO-${pad3(i + 1)}`,
    sku,
    supplierId: supplierOf.get(sku),
    qtyOrdered,
    qtyReceived,
    expectedDate: dayKey(addDays(now, days)),
  }));

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      seedVersion: SEED_VERSION,
      demo: true,
      createdAt: now.toISOString(),
      movementSeq: history.movementSeq,
      operationSeq: history.operationSeq,
    },
    rev: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    users: USERS.map((u) => ({ ...u })),
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    suppliers: SUPPLIERS.map((s) => ({ ...s })),
    products,
    locations,
    stock: history.stock,
    commitments: COMMITMENTS.map((c) => ({ ...c })),
    pendingReceipts,
    movements: history.movements,
    offlineQueue: [],
    audit: [{
      id: 'AUD-000001',
      at: now.toISOString(),
      user: 'Sistema',
      action: 'Carga inicial',
      target: 'Datos de demostración',
      detail: 'Se cargaron datos completamente ficticios. No existe conexión con Microsoft Dynamics.',
    }],
  };
}
