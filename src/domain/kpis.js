// Indicadores principales del Dashboard. Se calculan desde el estado compartido en cada consulta.
import { buildIndex } from './stock.js';
import { evaluateAll, countByLevel } from './alerts.js';
import { occupancy } from './locations.js';
import { periodTotals } from './analytics.js';
import { resolvePeriod } from '../core/dates.js';

/**
 * @param {import('../data/schema.js').AppState} state
 * @param {Date} now
 * @param {ReturnType<typeof evaluateAll>} [alerts] alertas ya calculadas (opcional)
 */
export function computeKpis(state, now, alerts) {
  const idx = buildIndex(state);
  const list = alerts || evaluateAll(state, now);
  const counts = countByLevel(list);
  const active = state.products.filter((p) => p.active);

  let totalUnits = 0;
  let availableUnits = 0;
  let committedUnits = 0;
  let inventoryValue = 0;
  for (const p of active) {
    const total = idx.totalBySku.get(p.sku) || 0;
    const committed = idx.committedBySku.get(p.sku) || 0;
    totalUnits += total;
    committedUnits += Math.min(total, committed);
    availableUnits += Math.max(0, total - committed);
    inventoryValue += total * p.unitCost;
  }

  const month = periodTotals(state, resolvePeriod('mes_actual', now));
  const prev = periodTotals(state, resolvePeriod('mes_anterior', now));
  const occ = occupancy(state);

  return {
    totalSkus: active.length,
    totalUnits,
    availableUnits,
    committedUnits,
    inventoryValue,
    belowMin: counts.atencion, // tiene unidades, pero disponible < mínimo
    atRisk: list.filter((a) => a.atRisk).length, // cobertura menor al plazo del proveedor
    outOfStock: counts.critico, // stock físico = 0: no quedó ninguno
    precaution: counts.precaucion,
    normal: counts.normal,
    monthExitUnits: month.salidas.units,
    monthExitMoves: month.salidas.moves,
    monthEntryUnits: month.entradas.units,
    monthEntryMoves: month.entradas.moves,
    monthReturnUnits: month.devoluciones.units,
    prevMonthExitUnits: prev.salidas.units,
    prevMonthEntryUnits: prev.entradas.units,
    occupancyPct: occ.pct,
    occupiedLocations: occ.occupied,
    totalLocations: occ.total,
    levelCounts: counts,
  };
}
