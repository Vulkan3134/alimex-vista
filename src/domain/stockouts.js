// Quiebres de stock reconstruidos desde el historial.
// Un quiebre es cuando una SALIDA deja el stock físico en 0, después de haber tenido unidades.
// El vacío inicial (antes de la primera entrada) no cuenta.
import { buildIndex, getAvailable, getTotal } from './stock.js';

const DAY_MS = 86400000;

/**
 * @param {import('../data/schema.js').AppState} state
 * @param {Date} now
 * @param {number} [windowDays]
 * @returns {{sku:string, name:string, events:number, days:number, currentlyOut:boolean, available:number, lastAt:number|null}[]}
 */
export function stockoutHistory(state, now, windowDays = 180) {
  const idx = buildIndex(state);
  const end = now.getTime();
  const start = end - windowDays * DAY_MS;
  const rows = [];

  for (const p of state.products) {
    if (!p.active) continue;
    const list = idx.entriesBySku.get(p.sku) || [];
    let stock = 0;
    let everHadStock = false;
    let zeroFrom = null;
    let days = 0;
    let events = 0;
    let lastAt = null;

    const addDays = (from, to) => {
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      if (b > a) days += (b - a) / DAY_MS;
    };

    for (const { m, ts } of list) {
      const before = stock;
      if (m.type === 'ENTRADA' || m.type === 'DEVOLUCION') stock += m.qty;
      else if (m.type === 'SALIDA') stock = Math.max(0, stock - m.qty);

      if (stock > 0) everHadStock = true;

      if (before > 0 && stock === 0) {
        if (ts >= start && ts <= end) {
          events += 1;
          lastAt = ts;
        }
        zeroFrom = ts;
      } else if (before === 0 && stock > 0 && zeroFrom != null) {
        addDays(zeroFrom, ts);
        zeroFrom = null;
      }
    }
    if (zeroFrom != null) addDays(zeroFrom, end);

    const available = getAvailable(idx, p.sku);
    const total = getTotal(idx, p.sku);
    const currentlyOut = total <= 0;
    if (!currentlyOut && days <= 0 && events === 0) continue;

    rows.push({
      sku: p.sku,
      name: p.name,
      events,
      days: Math.round(days * 10) / 10,
      currentlyOut,
      available,
      total,
      lastAt,
    });
  }

  rows.sort((a, b) => {
    if (a.currentlyOut !== b.currentlyOut) return a.currentlyOut ? -1 : 1;
    if (b.days !== a.days) return b.days - a.days;
    if (b.events !== a.events) return b.events - a.events;
    return a.sku < b.sku ? -1 : 1;
  });
  return rows;
}
