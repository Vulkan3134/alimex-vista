// Cálculos de existencias. Funciones puras: leen el estado y devuelven valores derivados.
// Nada de lo que se calcula aquí se guarda: se obtiene siempre desde el estado compartido.
import { daysBetween } from '../core/dates.js';
import { ceilUnits } from '../core/format.js';

const DAY_MS = 86400000;
const cache = new WeakMap();

/**
 * @typedef {Object} Index
 * @property {Map<string, import('../data/schema.js').Product>} productBySku
 * @property {Map<string, import('../data/schema.js').Location>} locationByCode
 * @property {Map<string, {id:string,name:string}>} departmentById
 * @property {Map<string, {id:string,name:string,leadTimeDays:number}>} supplierById
 * @property {Map<string, Map<string, number>>} stockBySku sku -> (ubicación -> cantidad)
 * @property {Map<string, Map<string, number>>} stockByLocation ubicación -> (sku -> cantidad)
 * @property {Map<string, number>} totalBySku
 * @property {Map<string, number>} committedBySku
 * @property {Map<string, number>} pendingBySku
 * @property {{m: import('../data/schema.js').Movement, ts: number}[]} entries todos los movimientos ordenados por fecha
 * @property {Map<string, {m: import('../data/schema.js').Movement, ts: number}[]>} entriesBySku
 */

/**
 * Índice de consulta rápida. Se reconstruye solo cuando cambia state.rev.
 * @param {import('../data/schema.js').AppState} state
 * @returns {Index}
 */
export function buildIndex(state) {
  const hit = cache.get(state);
  if (hit && hit.rev === state.rev) return hit.index;

  const productBySku = new Map(state.products.map((p) => [p.sku, p]));
  const locationByCode = new Map(state.locations.map((l) => [l.code, l]));
  const departmentById = new Map(state.departments.map((d) => [d.id, d]));
  const supplierById = new Map(state.suppliers.map((s) => [s.id, s]));

  const stockBySku = new Map();
  const stockByLocation = new Map();
  const totalBySku = new Map();
  for (const rec of state.stock) {
    if (!(rec.qty > 0)) continue;
    if (!stockBySku.has(rec.sku)) stockBySku.set(rec.sku, new Map());
    stockBySku.get(rec.sku).set(rec.location, (stockBySku.get(rec.sku).get(rec.location) || 0) + rec.qty);
    if (!stockByLocation.has(rec.location)) stockByLocation.set(rec.location, new Map());
    stockByLocation.get(rec.location).set(rec.sku, (stockByLocation.get(rec.location).get(rec.sku) || 0) + rec.qty);
    totalBySku.set(rec.sku, (totalBySku.get(rec.sku) || 0) + rec.qty);
  }

  const committedBySku = new Map();
  for (const c of state.commitments) committedBySku.set(c.sku, (committedBySku.get(c.sku) || 0) + c.qty);

  const pendingBySku = new Map();
  for (const r of state.pendingReceipts) {
    const open = r.qtyOrdered - r.qtyReceived;
    if (open > 0) pendingBySku.set(r.sku, (pendingBySku.get(r.sku) || 0) + open);
  }

  const entries = state.movements
    .map((m) => ({ m, ts: Date.parse(m.at) }))
    .sort((a, b) => a.ts - b.ts || (a.m.id < b.m.id ? -1 : 1));
  const entriesBySku = new Map();
  for (const e of entries) {
    if (!entriesBySku.has(e.m.sku)) entriesBySku.set(e.m.sku, []);
    entriesBySku.get(e.m.sku).push(e);
  }

  const index = {
    productBySku, locationByCode, departmentById, supplierById,
    stockBySku, stockByLocation, totalBySku, committedBySku, pendingBySku,
    entries, entriesBySku,
  };
  cache.set(state, { rev: state.rev, index });
  return index;
}

/** Stock total físico del SKU (suma de todas sus ubicaciones). */
export function getTotal(idx, sku) {
  return idx.totalBySku.get(sku) || 0;
}

/** Unidades comprometidas (reservadas) del SKU. */
export function getCommitted(idx, sku) {
  return idx.committedBySku.get(sku) || 0;
}

/** Stock disponible = stock total - comprometido (nunca negativo). */
export function getAvailable(idx, sku) {
  return Math.max(0, getTotal(idx, sku) - getCommitted(idx, sku));
}

/** Unidades pendientes de recepción (órdenes abiertas ficticias). */
export function getPending(idx, sku) {
  return idx.pendingBySku.get(sku) || 0;
}

/** Cantidad del SKU en una ubicación. */
export function getQtyAt(idx, sku, location) {
  return idx.stockBySku.get(sku)?.get(location) || 0;
}

/** Ubicaciones que contienen el SKU, de mayor a menor cantidad. */
export function locationsOfSku(idx, sku) {
  const map = idx.stockBySku.get(sku);
  if (!map) return [];
  return [...map.entries()]
    .map(([location, qty]) => ({ location, qty }))
    .sort((a, b) => b.qty - a.qty || (a.location < b.location ? -1 : 1));
}

/** SKU almacenados en una ubicación, de mayor a menor cantidad. */
export function skusAtLocation(idx, location) {
  const map = idx.stockByLocation.get(location);
  if (!map) return [];
  return [...map.entries()]
    .map(([sku, qty]) => ({ sku, qty }))
    .sort((a, b) => b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
}

/**
 * Movimientos de un SKU dentro de una ventana de días hacia atrás desde `now`.
 * El consumo neto descuenta las devoluciones (una devolución nunca suma como salida).
 * @returns {{exits:number, returns:number, entries:number, exitMoves:number, net:number, activeDays:number, windowDays:number}}
 */
export function consumptionWindow(idx, sku, now, windowDays) {
  const end = now.getTime();
  const start = end - windowDays * DAY_MS;
  const list = idx.entriesBySku.get(sku) || [];
  let exits = 0;
  let returns = 0;
  let entries = 0;
  let exitMoves = 0;
  for (const { m, ts } of list) {
    if (ts < start || ts > end) continue;
    if (m.type === 'SALIDA') {
      exits += m.qty;
      exitMoves += 1;
    } else if (m.type === 'DEVOLUCION') returns += m.qty;
    else if (m.type === 'ENTRADA') entries += m.qty;
  }
  const first = list.length ? list[0].ts : null;
  const activeDays = first === null ? windowDays : Math.min(windowDays, Math.max(7, daysBetween(new Date(first), now) + 1));
  return { exits, returns, entries, exitMoves, net: Math.max(0, exits - returns), activeDays, windowDays };
}

/**
 * Consumo promedio diario en unidades enteras de SKU.
 * En modo "manual" usa el valor fijado en la configuración del producto;
 * en modo "auto" lo calcula desde el historial reciente.
 * Si el promedio da decimal, se sube al entero siguiente: no se consume media unidad.
 */
export function avgDailyConsumption(idx, product, now, windowDays) {
  if (product.params.consumptionMode === 'manual') {
    return ceilUnits(product.params.manualDailyConsumption || 0);
  }
  const w = consumptionWindow(idx, product.sku, now, windowDays);
  return ceilUnits(w.net / w.activeDays);
}

/** Días de cobertura = stock disponible / consumo diario. Sin consumo => Infinity. */
export function coverageDays(available, avgDaily) {
  if (available <= 0) return 0;
  if (!(avgDaily > 0)) return Infinity;
  return available / avgDaily;
}
