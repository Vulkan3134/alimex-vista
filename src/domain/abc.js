// Clasificación ABC configurable. Los criterios se calculan por separado:
// el valor económico del consumo NO es lo mismo que la frecuencia de retiro.
import { ceilUnits } from '../core/format.js';
import { buildIndex, getTotal, consumptionWindow } from './stock.js';

export const ABC_CRITERIA = Object.freeze([
  {
    id: 'valor',
    label: 'Valor anual de consumo',
    metricLabel: 'Valor anual',
    explain: 'Unidades consumidas en un año multiplicadas por el costo unitario. Identifica dónde está el dinero.',
  },
  {
    id: 'frecuencia',
    label: 'Frecuencia de picking',
    metricLabel: 'Retiros',
    explain: 'Cantidad de retiros (líneas de salida) en el período analizado. Identifica qué se toma más seguido.',
  },
  {
    id: 'rotacion',
    label: 'Rotación',
    metricLabel: 'Rotación anual',
    explain: 'Consumo anual dividido por el stock promedio: cuántas veces al año se renueva el inventario.',
  },
  {
    id: 'volumen',
    label: 'Volumen y peso',
    metricLabel: 'Litros por año',
    explain: 'Volumen físico que se mueve al año (el peso se informa en el detalle). Identifica el esfuerzo de manipulación.',
  },
]);

export const ABC_CLASSES = ['A', 'B', 'C'];

/**
 * Métricas base por SKU para todos los criterios.
 * @returns {Map<string, {annualUnits:number, annualValue:number, picks:number, rotation:number, annualVolumeL:number, annualWeightKg:number}>}
 */
export function computeMetrics(state, now) {
  const idx = buildIndex(state);
  const windowDays = state.settings.abc.windowDays;
  const result = new Map();
  for (const p of state.products) {
    if (!p.active) continue;
    const w = consumptionWindow(idx, p.sku, now, windowDays);
    const annualUnits = ceilUnits((w.net * 365) / w.activeDays);
    const total = getTotal(idx, p.sku);
    const netInflow = w.entries + w.returns - w.exits;
    const startStock = total - netInflow;
    const avgStock = Math.max(1, (Math.max(0, startStock) + total) / 2);
    result.set(p.sku, {
      annualUnits,
      annualValue: annualUnits * p.unitCost,
      picks: w.exitMoves,
      rotation: annualUnits / avgStock,
      annualVolumeL: annualUnits * p.handling.volumeL,
      annualWeightKg: annualUnits * p.handling.weightKg,
    });
  }
  return result;
}

const FIELD_BY_CRITERION = {
  valor: 'annualValue',
  frecuencia: 'picks',
  rotacion: 'rotation',
  volumen: 'annualVolumeL',
};

/**
 * Clasifica los productos activos en A, B o C según un criterio.
 * A: hasta acumular `thresholdA` % del total; B: hasta `thresholdB` %; C: el resto.
 * @param {import('../data/schema.js').AppState} state
 * @param {Date} now
 * @param {'valor'|'frecuencia'|'rotacion'|'volumen'} [criterion] por defecto el configurado
 * @param {ReturnType<typeof computeMetrics>} [metrics]
 */
export function computeAbc(state, now, criterion, metrics) {
  const crit = criterion || state.settings.abc.criterion;
  const field = FIELD_BY_CRITERION[crit] || 'annualValue';
  const base = metrics || computeMetrics(state, now);
  const { thresholdA, thresholdB } = state.settings.abc;

  const list = [...base.entries()]
    .map(([sku, m]) => ({ sku, metric: m[field] }))
    .sort((a, b) => b.metric - a.metric || (a.sku < b.sku ? -1 : 1));
  const total = list.reduce((sum, e) => sum + Math.max(0, e.metric), 0);

  const items = new Map();
  const ordered = [];
  let running = 0;
  list.forEach((e, i) => {
    let cls = 'C';
    let share = 0;
    let cumulative = 100;
    const noMovement = !(e.metric > 0) || total <= 0;
    if (!noMovement) {
      const before = (running / total) * 100;
      cls = before < thresholdA ? 'A' : before < thresholdB ? 'B' : 'C';
      running += e.metric;
      share = (e.metric / total) * 100;
      cumulative = (running / total) * 100;
    }
    const entry = { sku: e.sku, metric: e.metric, cls, share, cumulative, rank: i + 1, noMovement };
    items.set(e.sku, entry);
    ordered.push(entry);
  });

  const summary = { A: { count: 0, share: 0 }, B: { count: 0, share: 0 }, C: { count: 0, share: 0 } };
  for (const e of ordered) {
    summary[e.cls].count += 1;
    summary[e.cls].share += e.share;
  }
  return { criterion: crit, items, ordered, summary, total };
}

/** Calcula los cuatro criterios a la vez (comparten las métricas base). */
export function computeAllAbc(state, now) {
  const metrics = computeMetrics(state, now);
  const out = { metrics };
  for (const c of ABC_CRITERIA) out[c.id] = computeAbc(state, now, c.id, metrics);
  return out;
}

/** Valor del criterio con su unidad, para mostrar en tablas. */
export function metricValue(criterion, entry) {
  return entry ? entry.metric : 0;
}
