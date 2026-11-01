// Ranking de SKU con mayor salida.
// Reglas: suma todas las salidas del SKU en el período; distingue unidades de movimientos;
// desglosa por departamento sin asignar arbitrariamente; las devoluciones NUNCA cuentan como salidas.
import { buildIndex } from './stock.js';
import { inPeriod } from '../core/dates.js';

/**
 * @typedef {Object} RankingRow
 * @property {number} position
 * @property {string} sku
 * @property {string} name
 * @property {string} category
 * @property {string} unit
 * @property {number} units Unidades retiradas (solo salidas)
 * @property {number} movements Número de movimientos de salida
 * @property {number} share Participación (%) sobre el total de unidades retiradas
 * @property {{departmentId:string, name:string, units:number, movements:number, pct:number}[]} departments
 * @property {string} departmentLabel
 * @property {number} returnsUnits Unidades devueltas (informativo, no suman a las salidas)
 * @property {number} netUnits Retiradas menos devueltas
 */

/**
 * @param {import('../data/schema.js').AppState} state
 * @param {{period: {from: Date, to: Date}, departmentId?: string|null}} options
 */
export function buildRanking(state, { period, departmentId = null }) {
  const idx = buildIndex(state);
  const bySku = new Map();
  const byDept = new Map();
  let totalUnits = 0;
  let totalMovements = 0;
  let returnsUnits = 0;

  const rowFor = (sku) => {
    if (!bySku.has(sku)) bySku.set(sku, { units: 0, movements: 0, returns: 0, depts: new Map() });
    return bySku.get(sku);
  };

  for (const { m, ts } of idx.entries) {
    if (!inPeriod(ts, period)) continue;
    if (departmentId && m.departmentId !== departmentId) continue;
    if (m.type === 'DEVOLUCION') {
      rowFor(m.sku).returns += m.qty;
      returnsUnits += m.qty;
      continue;
    }
    if (m.type !== 'SALIDA') continue;

    const row = rowFor(m.sku);
    row.units += m.qty;
    row.movements += 1;
    totalUnits += m.qty;
    totalMovements += 1;

    const dKey = m.departmentId || '—';
    const d = row.depts.get(dKey) || { units: 0, movements: 0 };
    d.units += m.qty;
    d.movements += 1;
    row.depts.set(dKey, d);

    const g = byDept.get(dKey) || { units: 0, movements: 0 };
    g.units += m.qty;
    g.movements += 1;
    byDept.set(dKey, g);
  }

  const deptName = (id) => idx.departmentById.get(id)?.name || 'Sin departamento';

  /** @type {RankingRow[]} */
  const rows = [...bySku.entries()]
    .filter(([, r]) => r.units > 0)
    .map(([sku, r]) => {
      const p = idx.productBySku.get(sku);
      const departments = [...r.depts.entries()]
        .map(([id, d]) => ({ departmentId: id, name: deptName(id), units: d.units, movements: d.movements, pct: (d.units / r.units) * 100 }))
        .sort((a, b) => b.units - a.units || (a.name < b.name ? -1 : 1));
      return {
        position: 0,
        sku,
        name: p?.name || sku,
        category: p?.category || '',
        unit: p?.unit || 'un',
        units: r.units,
        movements: r.movements,
        share: totalUnits ? (r.units / totalUnits) * 100 : 0,
        departments,
        departmentLabel: departments.length === 1 ? departments[0].name : `Varios departamentos (${departments.length})`,
        returnsUnits: r.returns,
        netUnits: r.units - r.returns,
      };
    })
    .sort((a, b) => b.units - a.units || b.movements - a.movements || (a.sku < b.sku ? -1 : 1));
  rows.forEach((r, i) => { r.position = i + 1; });

  const departments = [...byDept.entries()]
    .map(([id, g]) => ({ departmentId: id, name: deptName(id), units: g.units, movements: g.movements, pct: totalUnits ? (g.units / totalUnits) * 100 : 0 }))
    .sort((a, b) => b.units - a.units || (a.name < b.name ? -1 : 1));

  return { rows, totalUnits, totalMovements, returnsUnits, departments };
}
