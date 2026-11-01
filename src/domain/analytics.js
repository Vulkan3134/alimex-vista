// Agregaciones para gráficos y reportes. Funciones puras sobre el estado compartido.
import { buildIndex } from './stock.js';
import { addDays, addMonths, endOfMonth, inPeriod, monthKey, monthShortLabel, startOfDay, startOfMonth } from '../core/dates.js';

/**
 * Serie mensual de entradas, salidas y devoluciones (en unidades) de los últimos `months` meses.
 * @returns {{key:string, label:string, from:Date, to:Date, entradas:number, salidas:number, devoluciones:number, traslados:number, movimientos:number}[]}
 */
export function monthlySeries(state, now, months = 6) {
  const idx = buildIndex(state);
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const ref = addMonths(startOfMonth(now), -i);
    buckets.push({ key: monthKey(ref), label: monthShortLabel(ref), from: startOfMonth(ref), to: endOfMonth(ref), entradas: 0, salidas: 0, devoluciones: 0, traslados: 0, movimientos: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const { m, ts } of idx.entries) {
    const b = byKey.get(monthKey(new Date(ts)));
    if (!b) continue;
    b.movimientos += 1;
    if (m.type === 'ENTRADA') b.entradas += m.qty;
    else if (m.type === 'SALIDA') b.salidas += m.qty;
    else if (m.type === 'DEVOLUCION') b.devoluciones += m.qty;
    else if (m.type === 'TRASLADO') b.traslados += m.qty;
  }
  return buckets;
}

/**
 * Totales de un período por tipo de movimiento.
 * @returns {{entradas:{units:number,moves:number}, salidas:{units:number,moves:number}, devoluciones:{units:number,moves:number}, traslados:{units:number,moves:number}, movimientos:number}}
 */
export function periodTotals(state, period) {
  const idx = buildIndex(state);
  const t = {
    entradas: { units: 0, moves: 0 },
    salidas: { units: 0, moves: 0 },
    devoluciones: { units: 0, moves: 0 },
    traslados: { units: 0, moves: 0 },
    movimientos: 0,
  };
  const key = { ENTRADA: 'entradas', SALIDA: 'salidas', DEVOLUCION: 'devoluciones', TRASLADO: 'traslados' };
  for (const { m, ts } of idx.entries) {
    if (!inPeriod(ts, period)) continue;
    const k = key[m.type];
    t[k].units += m.qty;
    t[k].moves += 1;
    t.movimientos += 1;
  }
  return t;
}

/**
 * Consumo (salidas) por departamento en un período.
 * @returns {{departmentId:string, name:string, units:number, movements:number, pct:number, returns:number}[]}
 */
export function departmentTotals(state, period) {
  const idx = buildIndex(state);
  const map = new Map();
  let total = 0;
  for (const { m, ts } of idx.entries) {
    if (!inPeriod(ts, period)) continue;
    if (m.type !== 'SALIDA' && m.type !== 'DEVOLUCION') continue;
    const key = m.departmentId || '—';
    const d = map.get(key) || { units: 0, movements: 0, returns: 0 };
    if (m.type === 'SALIDA') {
      d.units += m.qty;
      d.movements += 1;
      total += m.qty;
    } else d.returns += m.qty;
    map.set(key, d);
  }
  return [...map.entries()]
    .map(([id, d]) => ({ departmentId: id, name: idx.departmentById.get(id)?.name || 'Sin departamento', units: d.units, movements: d.movements, returns: d.returns, pct: total ? (d.units / total) * 100 : 0 }))
    .sort((a, b) => b.units - a.units || (a.name < b.name ? -1 : 1));
}

/**
 * Consumo mensual por departamento (para comparar el consumo entre departamentos).
 * @returns {{months: {key:string,label:string}[], departments: {departmentId:string, name:string, values:number[], total:number}[]}}
 */
export function departmentMonthly(state, now, months = 6) {
  const idx = buildIndex(state);
  const labels = [];
  for (let i = months - 1; i >= 0; i--) {
    const ref = addMonths(startOfMonth(now), -i);
    labels.push({ key: monthKey(ref), label: monthShortLabel(ref) });
  }
  const pos = new Map(labels.map((l, i) => [l.key, i]));
  const rows = new Map();
  for (const { m, ts } of idx.entries) {
    if (m.type !== 'SALIDA') continue;
    const i = pos.get(monthKey(new Date(ts)));
    if (i === undefined) continue;
    const key = m.departmentId || '—';
    if (!rows.has(key)) rows.set(key, new Array(months).fill(0));
    rows.get(key)[i] += m.qty;
  }
  const departments = [...rows.entries()]
    .map(([id, values]) => ({ departmentId: id, name: idx.departmentById.get(id)?.name || 'Sin departamento', values, total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  return { months: labels, departments };
}

/**
 * Evolución del consumo (salidas) dentro de un período, agrupada por día, semana o mes.
 * @param {'dia'|'semana'|'mes'} granularity
 * @returns {{label:string, from:Date, units:number, returns:number, movements:number}[]}
 */
export function consumptionSeries(state, period, granularity = 'semana', filter = {}) {
  const idx = buildIndex(state);
  const buckets = [];
  const dayLabel = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let cursor = startOfDay(period.from);
  if (granularity === 'semana') {
    const dow = (cursor.getDay() + 6) % 7; // lunes = 0
    cursor = addDays(cursor, -dow);
  } else if (granularity === 'mes') cursor = startOfMonth(cursor);
  while (cursor.getTime() <= period.to.getTime()) {
    let next;
    let label;
    if (granularity === 'dia') {
      next = addDays(cursor, 1);
      label = dayLabel(cursor);
    } else if (granularity === 'semana') {
      next = addDays(cursor, 7);
      label = `Sem. ${dayLabel(cursor)}`;
    } else {
      next = addMonths(cursor, 1);
      label = monthShortLabel(cursor);
    }
    buckets.push({ label, from: cursor, to: next, units: 0, returns: 0, movements: 0 });
    cursor = next;
    if (buckets.length > 400) break;
  }
  for (const { m, ts } of idx.entries) {
    if (!inPeriod(ts, period)) continue;
    if (m.type !== 'SALIDA' && m.type !== 'DEVOLUCION') continue;
    if (filter.sku && m.sku !== filter.sku) continue;
    if (filter.departmentId && m.departmentId !== filter.departmentId) continue;
    const b = buckets.find((x) => ts >= x.from.getTime() && ts < x.to.getTime());
    if (!b) continue;
    if (m.type === 'SALIDA') {
      b.units += m.qty;
      b.movements += 1;
    } else b.returns += m.qty;
  }
  return buckets;
}

/** Valor ficticio del inventario (existencias × costo unitario) por categoría. */
export function inventoryValueByCategory(state) {
  const idx = buildIndex(state);
  const map = new Map();
  for (const p of state.products) {
    if (!p.active) continue;
    const units = idx.totalBySku.get(p.sku) || 0;
    const c = map.get(p.category) || { category: p.category, skus: 0, units: 0, value: 0 };
    c.skus += 1;
    c.units += units;
    c.value += units * p.unitCost;
    map.set(p.category, c);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}
