// Sistema de alertas de inventario (prevención de quiebres de stock).
// Las alertas se calculan siempre desde el estado: no existen "alertas guardadas" que puedan quedar desactualizadas.
import { buildIndex, getTotal, getCommitted, getPending, avgDailyConsumption, coverageDays } from './stock.js';
import { suggestReplenishment } from './replenishment.js';
import { fmtInt, fmtDays } from '../core/format.js';

/** Niveles de prioridad. Cada nivel lleva siempre un texto (no depende solo del color). */
export const ALERT_LEVELS = Object.freeze({
  critico: { id: 'critico', order: 0, label: 'Crítico', color: 'rojo', meaning: 'Sin existencias' },
  atencion: { id: 'atencion', order: 1, label: 'Atención', color: 'naranjo', meaning: 'Bajo el stock mínimo' },
  precaucion: { id: 'precaucion', order: 2, label: 'Precaución', color: 'amarillo', meaning: 'Cerca del punto de reposición o con poca cobertura' },
  normal: { id: 'normal', order: 3, label: 'Normal', color: 'verde', meaning: 'Dentro de los parámetros normales' },
});

export const ALERT_ORDER = ['critico', 'atencion', 'precaucion', 'normal'];

/**
 * @typedef {Object} Alert
 * @property {string} sku
 * @property {string} name
 * @property {string} category
 * @property {string|null} departmentId
 * @property {string} unit
 * @property {'critico'|'atencion'|'precaucion'|'normal'} level
 * @property {string} levelLabel
 * @property {number} total
 * @property {number} committed
 * @property {number} available
 * @property {number} pending
 * @property {number} minStock
 * @property {number} reorderPoint
 * @property {number} safetyStock
 * @property {number} leadTimeDays
 * @property {number} avgDaily
 * @property {number} coverageDays
 * @property {boolean} atRisk Hay existencias, pero la cobertura es menor al plazo del proveedor
 * @property {string[]} reasons
 * @property {number} suggestedQty
 * @property {ReturnType<typeof suggestReplenishment>} replenishment
 */

/**
 * Evalúa un producto.
 * @returns {Alert}
 */
export function evaluateProduct(state, idx, product, now) {
  const params = product.params;
  const windowDays = state.settings.alerts.consumptionWindowDays;
  const marginPct = state.settings.alerts.nearReorderMarginPct;

  const total = getTotal(idx, product.sku);
  const committed = getCommitted(idx, product.sku);
  const available = Math.max(0, total - committed);
  const pending = getPending(idx, product.sku);
  const avgDaily = avgDailyConsumption(idx, product, now, windowDays);
  const coverage = coverageDays(available, avgDaily);
  const unit = product.unit || 'un';

  const empty = total <= 0;
  const belowMin = !empty && available < params.minStock;
  const coverageShort = available > 0 && Number.isFinite(coverage) && coverage < params.leadTimeDays;
  const nearReorder = params.reorderPoint > 0 && available <= params.reorderPoint * (1 + marginPct / 100);

  /** @type {Alert['level']} */
  let level = 'normal';
  if (empty) level = 'critico';
  else if (belowMin) level = 'atencion';
  else if (nearReorder || coverageShort) level = 'precaucion';

  const reasons = [];
  if (empty) {
    reasons.push('No quedó ninguna unidad en bodega.');
  } else {
    if (available <= 0) reasons.push(`Hay ${fmtInt(total)} ${unit} en bodega, pero todo está comprometido.`);
    if (belowMin) reasons.push(`El stock disponible (${fmtInt(available)} ${unit}) está por debajo del mínimo (${fmtInt(params.minStock)} ${unit}).`);
    if (coverageShort) reasons.push(`Alcanza para ${fmtDays(coverage)} y el proveedor tarda ${fmtInt(params.leadTimeDays)} días en entregar.`);
    if (nearReorder && !belowMin) {
      reasons.push(available <= params.reorderPoint
        ? `El stock ya llegó al punto de reposición (${fmtInt(params.reorderPoint)} ${unit}).`
        : `El stock está cerca del punto de reposición (${fmtInt(params.reorderPoint)} ${unit}).`);
    }
  }
  if (pending > 0 && level !== 'normal') reasons.push(`Hay ${fmtInt(pending)} ${unit} pendientes de recibir.`);
  if (level === 'normal') reasons.push('El inventario está dentro de los parámetros normales.');

  const replenishment = suggestReplenishment({ product, avgDaily, total, committed, pending });

  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    departmentId: product.departmentId,
    unit,
    level,
    levelLabel: ALERT_LEVELS[level].label,
    total,
    committed,
    available,
    pending,
    minStock: params.minStock,
    reorderPoint: params.reorderPoint,
    safetyStock: params.safetyStock,
    leadTimeDays: params.leadTimeDays,
    avgDaily,
    coverageDays: coverage,
    atRisk: coverageShort,
    reasons,
    suggestedQty: replenishment.suggestedQty,
    replenishment,
  };
}

function compareAlerts(a, b) {
  const byLevel = ALERT_LEVELS[a.level].order - ALERT_LEVELS[b.level].order;
  if (byLevel !== 0) return byLevel;
  if (a.coverageDays !== b.coverageDays) {
    if (!Number.isFinite(a.coverageDays)) return 1;
    if (!Number.isFinite(b.coverageDays)) return -1;
    return a.coverageDays - b.coverageDays;
  }
  if (a.avgDaily !== b.avgDaily) return b.avgDaily - a.avgDaily;
  return a.sku < b.sku ? -1 : 1;
}

/**
 * Alertas de todos los productos activos, ordenadas por prioridad
 * (crítico, atención, precaución, normal) y, dentro de cada nivel, por menor cobertura.
 * @param {import('../data/schema.js').AppState} state
 * @param {Date} now
 * @returns {Alert[]}
 */
export function evaluateAll(state, now) {
  const idx = buildIndex(state);
  return state.products
    .filter((p) => p.active)
    .map((p) => evaluateProduct(state, idx, p, now))
    .sort(compareAlerts);
}

/** Cuenta alertas por nivel. */
export function countByLevel(alerts) {
  const counts = { critico: 0, atencion: 0, precaucion: 0, normal: 0 };
  for (const a of alerts) counts[a.level] += 1;
  return counts;
}
