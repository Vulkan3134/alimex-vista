// Servicio de consulta de inventario: reúne los cálculos del dominio para las vistas.
// Todo se calcula en el momento desde el estado compartido, por eso los módulos nunca se desincronizan.
import {
  buildIndex, getAvailable, getCommitted, getPending, getTotal, locationsOfSku, skusAtLocation,
} from '../domain/stock.js';
import { evaluateAll } from '../domain/alerts.js';
import { stockoutHistory } from '../domain/stockouts.js';
import { computeKpis } from '../domain/kpis.js';
import { computeAbc, computeAllAbc } from '../domain/abc.js';
import { buildRanking } from '../domain/ranking.js';
import {
  consumptionSeries, departmentMonthly, departmentTotals, inventoryValueByCategory, monthlySeries, periodTotals,
} from '../domain/analytics.js';
import {
  accessScore, accessTier, bestClassByLocation, layoutDimensions, locationDetail, occupancy, pickActivity, slottingPlan,
} from '../domain/locations.js';
import { monthKey, resolvePeriod } from '../core/dates.js';
import { normalizeText } from '../core/format.js';

/**
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @param {{now: () => Date}} deps
 */
export function createInventoryService(store, { now }) {
  const state = () => store.getState();

  const service = {
    state,
    now,
    index: () => buildIndex(state()),

    alerts: () => evaluateAll(state(), now()),
    kpis: (alerts) => computeKpis(state(), now(), alerts),
    stockouts: (windowDays) => stockoutHistory(state(), now(), windowDays),
    occupancy: () => occupancy(state()),
    layoutDimensions: () => layoutDimensions(state().locations),

    /** Clasificación ABC según el criterio indicado (por defecto, el configurado). */
    abc: (criterion) => computeAbc(state(), now(), criterion),
    allAbc: () => computeAllAbc(state(), now()),

    ranking: (options) => buildRanking(state(), options),
    period: (presetId, custom) => resolvePeriod(presetId, now(), custom),
    periodTotals: (period) => periodTotals(state(), period),
    monthlySeries: (months = 6) => monthlySeries(state(), now(), months),
    departmentTotals: (period) => departmentTotals(state(), period),
    departmentMonthly: (months = 6) => departmentMonthly(state(), now(), months),
    consumptionSeries: (period, granularity, filter) => consumptionSeries(state(), period, granularity, filter),
    valueByCategory: () => inventoryValueByCategory(state()),

    locationDetail: (code) => locationDetail(state(), code),
    slotting: (criterion) => slottingPlan(state(), computeAbc(state(), now(), criterion).items),

    /**
     * Mapa de calor del layout.
     * @param {'actividad'|'abc'|'ocupacion'} mode
     * @param {string} [criterion] criterio Pareto/ABC (solo modo abc)
     * @returns {Map<string, {value: number, raw: number, text: string, cls?: string}>}
     */
    heatmap(mode, criterion) {
      const st = state();
      const result = new Map();
      if (mode === 'actividad') {
        const activity = pickActivity(st, now(), 30);
        const max = Math.max(1, ...[...activity.values()].map((a) => a.picks));
        for (const [code, a] of activity) {
          result.set(code, { value: a.picks / max, raw: a.picks, text: `${a.picks} retiros en 30 días (${a.units} unidades)` });
        }
      } else if (mode === 'abc') {
        const abc = computeAbc(st, now(), criterion);
        for (const [code, cls] of bestClassByLocation(st, abc.items)) {
          result.set(code, { value: cls === 'A' ? 1 : cls === 'B' ? 0.55 : 0.2, raw: 0, cls, text: `Pareto ${cls}` });
        }
      } else {
        const idx = buildIndex(st);
        for (const loc of st.locations) {
          const skus = idx.stockByLocation.get(loc.code);
          if (!skus || !skus.size) continue;
          const used = [...skus.values()].reduce((a, b) => a + b, 0);
          const pct = loc.capacityUnits ? used / loc.capacityUnits : 0;
          result.set(loc.code, { value: Math.min(1, pct), raw: pct * 100, text: `${Math.round(pct * 100)} % de la capacidad` });
        }
      }
      return result;
    },

    /**
     * Filas de la tabla de inventario con búsqueda y filtros.
     * @param {{search?: string, category?: string, location?: string, abcClass?: string, status?: string, departmentId?: string, criterion?: string}} filters
     */
    inventoryRows(filters = {}) {
      const st = state();
      const idx = buildIndex(st);
      const alerts = new Map(evaluateAll(st, now()).map((a) => [a.sku, a]));
      const abc = computeAbc(st, now(), filters.criterion);
      const needle = normalizeText(filters.search);
      const rows = [];
      for (const p of st.products) {
        if (!p.active) continue;
        const where = locationsOfSku(idx, p.sku);
        const alert = alerts.get(p.sku);
        const abcEntry = abc.items.get(p.sku);
        if (filters.category && p.category !== filters.category) continue;
        if (filters.departmentId && p.departmentId !== filters.departmentId) continue;
        if (filters.abcClass && abcEntry?.cls !== filters.abcClass) continue;
        if (filters.status && alert.level !== filters.status) continue;
        if (filters.location && !where.some((w) => w.location.startsWith(filters.location))) continue;
        if (needle) {
          const haystack = normalizeText(`${p.sku} ${p.name} ${where.map((w) => w.location).join(' ')}`);
          if (!haystack.includes(needle)) continue;
        }
        rows.push({
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          departmentId: p.departmentId,
          departmentName: idx.departmentById.get(p.departmentId)?.name || '—',
          total: alert.total,
          committed: alert.committed,
          available: alert.available,
          minStock: p.params.minStock,
          abcClass: abcEntry?.cls || 'C',
          abcMetric: abcEntry?.metric || 0,
          locations: where,
          level: alert.level,
          levelLabel: alert.levelLabel,
          coverageDays: alert.coverageDays,
          alert,
        });
      }
      return rows;
    },

    categories: () => [...new Set(state().products.filter((p) => p.active).map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')),

    /** Ficha completa de un producto. */
    productDetail(sku) {
      const st = state();
      const idx = buildIndex(st);
      const product = idx.productBySku.get(sku);
      if (!product) return null;
      const alert = evaluateAll(st, now()).find((a) => a.sku === sku) || null;
      const all = computeAllAbc(st, now());
      const entries = idx.entriesBySku.get(sku) || [];
      const monthly = service.monthlySeries(6).map((m) => ({ key: m.key, label: m.label, units: 0, entries: 0 }));
      const byKey = new Map(monthly.map((m) => [m.key, m]));
      for (const { m, ts } of entries) {
        const bucket = byKey.get(monthKey(new Date(ts)));
        if (!bucket) continue;
        if (m.type === 'SALIDA') bucket.units += m.qty;
        else if (m.type === 'ENTRADA') bucket.entries += m.qty;
      }
      return {
        product,
        alert,
        supplier: idx.supplierById.get(product.params.supplierId) || null,
        department: idx.departmentById.get(product.departmentId) || null,
        total: getTotal(idx, sku),
        committed: getCommitted(idx, sku),
        available: getAvailable(idx, sku),
        pending: getPending(idx, sku),
        locations: locationsOfSku(idx, sku).map((w) => {
          const loc = idx.locationByCode.get(w.location);
          const score = loc ? accessScore(loc) : 0;
          return { ...w, accessScore: score, tier: accessTier(score) };
        }),
        abc: {
          valor: all.valor.items.get(sku),
          frecuencia: all.frecuencia.items.get(sku),
          rotacion: all.rotacion.items.get(sku),
          volumen: all.volumen.items.get(sku),
          metrics: all.metrics.get(sku),
        },
        recent: entries.slice(-12).reverse().map((e) => e.m),
        monthly,
        openReceipts: st.pendingReceipts.filter((r) => r.sku === sku && r.qtyOrdered - r.qtyReceived > 0),
        commitments: st.commitments.filter((c) => c.sku === sku),
      };
    },

    skusAtLocation: (code) => skusAtLocation(buildIndex(state()), code),
  };
  return service;
}
