// Generador DETERMINISTA del historial de demostración (datos ficticios).
// Usa una semilla fija derivada del SKU: dos ejecuciones con la misma fecha producen exactamente los mismos datos.
// La simulación respeta las existencias: nunca hay inventario negativo y cada retiro sale de una ubicación con stock.
import { addDays, startOfDay } from '../../core/dates.js';
import { COMMITMENTS, PRODUCT_SPECS, USERS } from './catalog.js';

const SLOT_MINUTES = [8 * 60 + 40, 10 * 60 + 15, 11 * 60 + 50, 14 * 60 + 10, 16 * 60 + 20];
const MONTH_FACTORS = [1.05, 1.12, 1.06, 0.96, 1.0, 0.94, 0.9, 0.92, 0.96, 0.98, 0.95, 0.9, 0.9];
const OUT_NOTES = ['Reposición de punto de uso', 'Retiro para mantención programada', 'Consumo habitual del turno', 'Solicitud urgente del área'];
const RETURN_RATE_BY_CATEGORY = { 'EPP y seguridad': 0.05, 'Limpieza e higiene': 0.05, 'Calidad y laboratorio': 0.05 };

export const HISTORY_DAYS = 300;
export const TAIL_DAYS = 30;

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rngFrom = (text) => mulberry32(fnv(text));

function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function weightedPick(rng, items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

const roundUp = (x, multiple) => (multiple > 1 ? Math.ceil(x / multiple) * multiple : Math.ceil(x));
const pad = (n, width) => String(n).padStart(width, '0');

/** Consumo diario nominal usado para dimensionar parámetros y simulación. */
export function nominalDaily(spec) {
  return (spec.perEvent * spec.eventsPerWeek) / 6;
}

/** Punto de reposición coherente con la demanda y el plazo del proveedor. */
export function reorderPointOf(spec) {
  return Math.ceil(nominalDaily(spec) * spec.leadTimeDays + spec.safetyStock);
}

/** Stock DISPONIBLE objetivo al final de la simulación, según el estado de demostración del SKU. */
function targetAvailable(spec) {
  const daily = nominalDaily(spec);
  const rop = reorderPointOf(spec);
  switch (spec.finalState) {
    case 'A': return 0;
    case 'B': return Math.max(1, Math.round(spec.minStock * 0.5));
    case 'R': return Math.round(spec.minStock + (daily * spec.leadTimeDays - spec.minStock) * 0.5);
    case 'P': return Math.round(rop * 1.08);
    default: return Math.round(rop * (1.6 + 0.9 * rngFrom(`${spec.sku}:F`)()));
  }
}

function slotIndexFor(off, dept, second) {
  const base = fnv(`${off}|${dept}`);
  const a = base % 5;
  const b = (a + 1 + ((base >>> 3) % 4)) % 5;
  return second ? b : a;
}

function eventQty(rng, perEvent) {
  if (perEvent === 1) return rng() < 0.12 ? 2 : 1;
  return Math.max(1, Math.round(perEvent * (0.55 + rng() * 0.9)));
}

/**
 * Simula la vida de un producto y devuelve sus eventos y existencias finales por ubicación.
 */
function simulateProduct(spec, ctx) {
  const { base, nowMinutes, todayOk, historyDays: D, tailDays: T } = ctx;
  const rng = rngFrom(`${spec.sku}:sim`);
  const events = [];
  const locations = [spec.primary, ...spec.reserves];
  const stockAt = new Map(locations.map((l) => [l, 0]));
  const total = () => [...stockAt.values()].reduce((a, b) => a + b, 0);
  const daily = nominalDaily(spec);
  const rop = reorderPointOf(spec);
  const committed = COMMITMENTS.filter((c) => c.sku === spec.sku).reduce((s, c) => s + c.qty, 0);
  const target = targetAvailable(spec) + committed;
  const receiveLocs = spec.reserves.length ? spec.reserves : [spec.primary];
  const primaryTarget = Math.max(spec.perEvent * 3, Math.ceil(daily * 10));
  const returnRate = RETURN_RATE_BY_CATEGORY[spec.category] ?? 0.02;
  const tailStart = -T;
  const orders = [];
  const returnsByDay = new Map();
  const tailPlan = new Map();
  let seq = 0;

  const push = (off, minutes, ev) => events.push({ off, minutes, seq: seq++, sku: spec.sku, ...ev });

  const receive = (off, minutes, qty, extra = {}) => {
    const n = receiveLocs.length;
    const baseQty = Math.floor(qty / n);
    const rem = qty - baseQty * n;
    receiveLocs.forEach((loc, i) => {
      const q = baseQty + (i < rem ? 1 : 0);
      if (q <= 0) return;
      stockAt.set(loc, stockAt.get(loc) + q);
      push(off, minutes, { type: 'ENTRADA', qty: q, from: null, to: loc, dept: null, group: `E|${spec.sku}|${off}|${minutes}`, ...extra });
    });
  };

  const exitFrom = (off, minutes, dept, slotIdx, qty) => {
    if (stockAt.get(spec.primary) < qty) {
      let need = Math.max(qty, primaryTarget) - stockAt.get(spec.primary);
      for (const r of spec.reserves) {
        if (need <= 0) break;
        const avail = stockAt.get(r);
        if (avail <= 0) continue;
        const mv = Math.min(avail, need);
        stockAt.set(r, avail - mv);
        stockAt.set(spec.primary, stockAt.get(spec.primary) + mv);
        push(off, minutes - 5, { type: 'TRASLADO', qty: mv, from: r, to: spec.primary, dept: null, group: `T|${spec.sku}|${off}|${minutes}|${r}` });
        need -= mv;
      }
    }
    const q = Math.min(qty, stockAt.get(spec.primary));
    if (q <= 0) return 0;
    stockAt.set(spec.primary, stockAt.get(spec.primary) - q);
    push(off, minutes, { type: 'SALIDA', qty: q, from: spec.primary, to: null, dept, group: `S|${off}|${dept}|${slotIdx}` });
    return q;
  };

  const monthsBack = (date) => ctx.nowMonthIndex - (date.getFullYear() * 12 + date.getMonth());
  const slotMinutes = (off, slotIdx) => (off === 0 && SLOT_MINUTES[slotIdx] > nowMinutes ? SLOT_MINUTES[0] : SLOT_MINUTES[slotIdx]);

  for (let off = -D; off <= 0; off++) {
    const date = addDays(base, off);
    const dow = date.getDay();
    const inTail = off >= tailStart;

    // Inicio de la cola: se planifica el aterrizaje exacto en el estado final previsto.
    if (off === tailStart) {
      const arriving = orders.filter((o) => o.arrive >= tailStart && (o.arrive < 0 || (o.arrive === 0 && todayOk)));
      const arrivals = spec.finalState === 'N' ? arriving.reduce((s, o) => s + o.qty, 0) : 0;
      const minTail = Math.max(1, Math.round(daily * T * 0.6));
      let toConsume = total() + arrivals - target;
      if (toConsume < minTail) {
        orders.push({ arrive: tailStart + 2, qty: minTail - toConsume, keep: true });
        toConsume = minTail;
      }
      const days = [];
      for (let o = tailStart; o <= 0; o++) {
        const dw = addDays(base, o).getDay();
        if (dw === 0 || (o === 0 && !todayOk)) continue;
        days.push(o);
      }
      const count = Math.max(1, Math.min(toConsume, Math.round(toConsume / spec.perEvent), 150));
      const weights = Array.from({ length: count }, () => 0.5 + rng());
      const sumW = weights.reduce((a, b) => a + b, 0);
      const qtys = weights.map((w) => Math.max(1, Math.floor((toConsume * w) / sumW)));
      let diff = toConsume - qtys.reduce((a, b) => a + b, 0);
      for (let i = 0; diff !== 0 && i < 100000; i++) {
        const k = i % count;
        if (diff > 0) { qtys[k] += 1; diff -= 1; }
        else if (qtys[k] > 1) { qtys[k] -= 1; diff += 1; }
      }
      qtys.forEach((q) => {
        const o = days[Math.floor(rng() * days.length)];
        const dept = weightedPick(rng, spec.depts).departmentId;
        const slotIdx = slotIndexFor(o, dept, rng() < 0.6 ? 0 : 1);
        if (!tailPlan.has(o)) tailPlan.set(o, []);
        tailPlan.get(o).push({ dept, slotIdx, minutes: slotMinutes(o, slotIdx), qty: q });
      });
    }

    // Llegadas de pedidos
    const due = orders.filter((o) => o.arrive === off);
    for (const o of due) orders.splice(orders.indexOf(o), 1);
    for (const o of due) {
      const dropped = (inTail && spec.finalState !== 'N' && !o.keep) || (off === 0 && !todayOk);
      if (!dropped) receive(off, 7 * 60 + 30, o.qty, { kind: o.keep ? 'late' : 'receipt' });
    }

    if (off === -D) {
      receive(off, 7 * 60 + 15, Math.ceil(rop * 1.7), { kind: 'opening' });
    }

    // Devoluciones programadas
    for (const r of returnsByDay.get(off) || []) {
      stockAt.set(spec.primary, stockAt.get(spec.primary) + r.qty);
      push(off, 7 * 60 + 45, { type: 'DEVOLUCION', qty: r.qty, from: null, to: spec.primary, dept: r.dept, group: `D|${spec.sku}|${off}|${r.dept}` });
    }

    // Retiros del día
    let dayEvents = [];
    if (inTail) {
      dayEvents = tailPlan.get(off) || [];
    } else if (dow !== 0) {
      const wf = dow === 6 ? 0.35 : 1;
      const mf = MONTH_FACTORS[Math.max(0, monthsBack(date))] ?? 1;
      const n = poisson(rng, (spec.eventsPerWeek / 5.35) * wf * mf);
      for (let i = 0; i < n; i++) {
        const dept = weightedPick(rng, spec.depts).departmentId;
        const slotIdx = slotIndexFor(off, dept, rng() < 0.6 ? 0 : 1);
        dayEvents.push({ dept, slotIdx, minutes: SLOT_MINUTES[slotIdx], qty: eventQty(rng, spec.perEvent) });
      }
    }
    dayEvents.sort((a, b) => a.minutes - b.minutes);
    for (const ev of dayEvents) {
      const q = exitFrom(off, ev.minutes, ev.dept, ev.slotIdx, ev.qty);
      if (q > 0 && !inTail && rng() < returnRate) {
        const back = off + 1 + Math.floor(rng() * 3);
        if (back < tailStart) {
          const rq = Math.max(1, Math.min(q, Math.round(q * (0.2 + rng() * 0.4))));
          if (!returnsByDay.has(back)) returnsByDay.set(back, []);
          returnsByDay.get(back).push({ qty: rq, dept: ev.dept });
        }
      }
    }

    // Política de reposición (solo antes de la cola)
    if (!inTail) {
      const onOrder = orders.reduce((s, o) => s + o.qty, 0);
      if (total() + onOrder <= rop) {
        const q = roundUp(Math.max(spec.minOrderQty, Math.ceil(daily * (spec.leadTimeDays + 14))), spec.purchaseMultiple);
        orders.push({ arrive: off + spec.leadTimeDays + (fnv(`${spec.sku}|${off}`) % 3), qty: q });
      }
    }
  }

  // Ajuste final exacto (si por recortes quedó stock sobrante frente al objetivo)
  const residual = total() - target;
  if (residual > 0) {
    const dept = spec.depts.reduce((a, b) => (b.weight > a.weight ? b : a)).departmentId;
    const off = todayOk ? 0 : -1;
    // Hora posterior a cualquier otro evento del producto y operación propia (orden cronológico coherente).
    const minutes = off === 0 ? nowMinutes : SLOT_MINUTES[4] + 30;
    exitFrom(off, minutes, dept, 'R', residual);
  }

  return { events, finalStock: [...stockAt.entries()].filter(([, q]) => q > 0).map(([location, qty]) => ({ sku: spec.sku, location, qty })) };
}

/**
 * Genera movimientos y existencias finales para todos los productos.
 * @param {Date} now
 * @returns {{movements: object[], stock: object[], movementSeq: number, operationSeq: number}}
 */
export function generateHistory(now, options = {}) {
  const historyDays = options.historyDays ?? HISTORY_DAYS;
  const base = startOfDay(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const ctx = {
    base,
    nowMinutes,
    todayOk: nowMinutes >= SLOT_MINUTES[0] + 10,
    historyDays,
    tailDays: TAIL_DAYS,
    nowMonthIndex: now.getFullYear() * 12 + now.getMonth(),
  };

  const all = [];
  const stock = [];
  PRODUCT_SPECS.forEach((spec, productIndex) => {
    const sim = simulateProduct(spec, ctx);
    for (const e of sim.events) all.push({ ...e, productIndex });
    stock.push(...sim.finalStock);
  });

  const stamp = (e) => {
    const d = addDays(base, e.off);
    d.setHours(Math.floor(e.minutes / 60), e.minutes % 60, 0, 0);
    return d;
  };
  for (const e of all) e.date = stamp(e);
  all.sort((a, b) => a.date - b.date || a.productIndex - b.productIndex || a.seq - b.seq);

  const opByGroup = new Map();
  const counters = { SALIDA: 0, ENTRADA: 0, TRASLADO: 0, DEVOLUCION: 0 };
  const opInfo = [];
  const movements = [];
  let movementSeq = 0;

  for (const e of all) {
    let op = opByGroup.get(e.group);
    if (!op) {
      const h = fnv(e.group);
      const year = e.date.getFullYear();
      counters[e.type] += 1;
      const n = counters[e.type];
      let document;
      let notes = '';
      if (e.kind === 'opening') {
        document = 'INV-INICIAL';
        notes = 'Saldo inicial de demostración (ficticio)';
      } else if (e.type === 'SALIDA') {
        document = `REQ-${year}-${pad(n, 5)}`;
        notes = h % 100 < 15 ? OUT_NOTES[h % OUT_NOTES.length] : '';
      } else if (e.type === 'ENTRADA') {
        document = `GR-${year}-${pad(n, 4)}`;
        notes = e.kind === 'late' ? 'Recepción de pedido atrasado' : 'Recepción conforme';
      } else if (e.type === 'TRASLADO') {
        document = `TRA-${year}-${pad(n, 4)}`;
        notes = 'Reposición del punto de picking';
      } else {
        document = `DEV-${year}-${pad(n, 4)}`;
        notes = 'Devolución de material no utilizado';
      }
      op = {
        id: `OP-${pad(opInfo.length + 1, 6)}`,
        responsible: USERS[(h >>> 5) % USERS.length].name,
        document,
        notes,
      };
      opByGroup.set(e.group, op);
      opInfo.push(op);
    }
    movementSeq += 1;
    const iso = e.date.toISOString();
    movements.push({
      id: `MOV-${pad(movementSeq, 6)}`,
      operationId: op.id,
      type: e.type,
      sku: e.sku,
      qty: e.qty,
      from: e.from,
      to: e.to,
      departmentId: e.dept,
      responsible: op.responsible,
      document: op.document,
      notes: op.notes,
      at: iso,
      createdAt: iso,
      source: 'DEMO',
    });
  }

  return { movements, stock, movementSeq, operationSeq: opInfo.length };
}
