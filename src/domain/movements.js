// Reglas de los movimientos de inventario.
//  1. planOperation(): valida TODAS las líneas y calcula el efecto (función pura, no modifica nada).
//  2. applyPlan(): aplica el plan al estado de forma atómica (solo lo invoca movementService).
// Si cualquier línea es inválida no se registra ninguna: la operación es "todo o nada".
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from '../data/schema.js';
import { ceilUnits, fmtInt } from '../core/format.js';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_QTY = 1000000;

const NEEDS_FROM = new Set(['SALIDA', 'TRASLADO']);
const NEEDS_TO = new Set(['ENTRADA', 'DEVOLUCION', 'TRASLADO']);
const NEEDS_DEPARTMENT = new Set(['SALIDA', 'DEVOLUCION']);

const pad6 = (n) => String(n).padStart(6, '0');
export const movementId = (seq) => `MOV-${pad6(seq)}`;
export const operationId = (seq) => `OP-${pad6(seq)}`;

/**
 * @typedef {Object} OperationInput
 * @property {'ENTRADA'|'SALIDA'|'TRASLADO'|'DEVOLUCION'} type
 * @property {Date|string} at
 * @property {string} responsible
 * @property {string} [document]
 * @property {string} [notes]
 * @property {string|null} [departmentId]
 * @property {string} [source]
 * @property {{sku: string, qty: number|string, from?: string|null, to?: string|null, receiptId?: string|null}[]} lines
 */

/**
 * @typedef {{line: number|null, field: string, message: string}} OperationError
 */

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Valida una operación completa y calcula su efecto.
 * @param {import('../data/schema.js').AppState} state
 * @param {OperationInput} op
 * @param {Date} now
 * @returns {{ok: false, errors: OperationError[]} | {ok: true, plan: object, warnings: string[]}}
 */
export function planOperation(state, op, now) {
  /** @type {OperationError[]} */
  const errors = [];
  const warnings = [];
  const fail = (line, field, message) => errors.push({ line, field, message });

  const type = op?.type;
  if (!type || !MOVEMENT_TYPES[type]) {
    return { ok: false, errors: [{ line: null, field: 'type', message: 'Seleccione un tipo de movimiento válido.' }] };
  }

  const products = new Map(state.products.map((p) => [p.sku.toUpperCase(), p]));
  const locations = new Map(state.locations.map((l) => [l.code, l]));
  const departments = new Map(state.departments.map((d) => [d.id, d]));
  const stock = new Map(); // "sku|ubicacion" -> cantidad (copia de trabajo)
  for (const r of state.stock) stock.set(`${r.sku}|${r.location}`, (stock.get(`${r.sku}|${r.location}`) || 0) + r.qty);
  const receipts = new Map(state.pendingReceipts.map((r) => [r.id, { ...r }]));

  // --- Datos generales de la operación ---
  const at = toDate(op.at);
  if (!at) fail(null, 'at', 'Indique una fecha y hora válidas.');
  else if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) fail(null, 'at', 'La fecha y hora del movimiento no puede ser futura.');

  const responsible = String(op.responsible ?? '').trim();
  if (!responsible) fail(null, 'responsible', 'Indique el responsable del movimiento.');

  const document = String(op.document ?? '').trim();
  if (document.length > 60) fail(null, 'document', 'El documento o referencia admite hasta 60 caracteres.');
  const notes = String(op.notes ?? '').trim();
  if (notes.length > 300) fail(null, 'notes', 'Las observaciones admiten hasta 300 caracteres.');

  const departmentId = op.departmentId || null;
  if (NEEDS_DEPARTMENT.has(type)) {
    if (!departmentId) fail(null, 'departmentId', type === 'SALIDA' ? 'Indique el departamento solicitante.' : 'Indique el departamento que realiza la devolución.');
    else if (!departments.has(departmentId)) fail(null, 'departmentId', 'El departamento indicado no existe.');
  }

  const rawLines = Array.isArray(op.lines) ? op.lines : [];
  if (rawLines.length === 0) fail(null, 'lines', 'Agregue al menos una línea de producto.');

  const lines = [];
  const deltas = new Map(); // "sku|ubicacion" -> variación
  const addDelta = (sku, location, delta) => {
    const k = `${sku}|${location}`;
    deltas.set(k, (deltas.get(k) || 0) + delta);
  };
  const receiptUpdates = new Map();

  rawLines.forEach((raw, i) => {
    const n = i + 1;
    const skuText = String(raw?.sku ?? '').trim().toUpperCase();
    const product = products.get(skuText);
    if (!skuText) {
      fail(n, 'sku', 'Indique el código SKU.');
      return;
    }
    if (!product) {
      fail(n, 'sku', `El SKU «${skuText}» no existe.`);
      return;
    }
    if (!product.active) {
      fail(n, 'sku', `El SKU «${product.sku}» está inactivo y no admite movimientos.`);
      return;
    }

    const rawQty = Number(raw.qty);
    if (raw.qty === '' || raw.qty === null || raw.qty === undefined || !Number.isFinite(rawQty) || rawQty <= 0) {
      fail(n, 'qty', 'La cantidad debe ser mayor que cero.');
      return;
    }
    const qty = ceilUnits(rawQty);
    if (qty > MAX_QTY) {
      fail(n, 'qty', `La cantidad máxima por línea es ${fmtInt(MAX_QTY)} unidades.`);
      return;
    }

    const from = NEEDS_FROM.has(type) ? String(raw.from ?? '').trim().toUpperCase() : null;
    const to = NEEDS_TO.has(type) ? String(raw.to ?? '').trim().toUpperCase() : null;
    let lineOk = true;

    if (NEEDS_FROM.has(type)) {
      const loc = locations.get(from);
      if (!from) {
        fail(n, 'from', 'Seleccione la ubicación de origen.');
        lineOk = false;
      } else if (!loc || !loc.active) {
        fail(n, 'from', `La ubicación de origen «${from}» no existe o está inactiva.`);
        lineOk = false;
      } else {
        const key = `${product.sku}|${from}`;
        const have = stock.get(key) || 0;
        if (have < qty) {
          fail(n, 'qty', have <= 0
            ? `No hay existencias de ${product.sku} en ${from}.`
            : `Stock insuficiente en ${from}: hay ${fmtInt(have)} y se solicitan ${fmtInt(qty)}.`);
          lineOk = false;
        } else {
          stock.set(key, have - qty); // descuenta en la copia: valida varias líneas del mismo SKU/ubicación
        }
      }
    }

    if (NEEDS_TO.has(type)) {
      const loc = locations.get(to);
      if (!to) {
        fail(n, 'to', 'Seleccione la ubicación de destino.');
        lineOk = false;
      } else if (!loc || !loc.active) {
        fail(n, 'to', `La ubicación de destino «${to}» no existe o está inactiva.`);
        lineOk = false;
      } else if (type === 'TRASLADO' && to === from) {
        fail(n, 'to', 'El destino debe ser distinto del origen.');
        lineOk = false;
      } else if (lineOk) {
        const key = `${product.sku}|${to}`;
        stock.set(key, (stock.get(key) || 0) + qty);
      }
    }

    let receiptId = null;
    if (type === 'ENTRADA' && raw.receiptId) {
      const r = receipts.get(raw.receiptId);
      if (!r || r.sku !== product.sku) {
        fail(n, 'receiptId', 'La recepción pendiente seleccionada no corresponde a este SKU.');
        lineOk = false;
      } else {
        receiptId = r.id;
        const open = r.qtyOrdered - r.qtyReceived;
        const applied = Math.min(qty, Math.max(0, open));
        r.qtyReceived += applied;
        receiptUpdates.set(r.id, (receiptUpdates.get(r.id) || 0) + applied);
        if (qty > open) warnings.push(`Línea ${n}: se reciben ${fmtInt(qty)} unidades y la recepción pendiente esperaba ${fmtInt(Math.max(0, open))}.`);
      }
    }

    if (!lineOk) return;
    if (from) addDelta(product.sku, from, -qty);
    if (to) addDelta(product.sku, to, qty);
    lines.push({ sku: product.sku, qty, from: from || null, to: to || null, receiptId });
  });

  if (errors.length) return { ok: false, errors };

  // Advertencias de capacidad (no bloquean el movimiento)
  const usedAfter = new Map();
  for (const [key, qty] of stock) {
    const loc = key.split('|')[1];
    usedAfter.set(loc, (usedAfter.get(loc) || 0) + qty);
  }
  const warned = new Set();
  for (const l of lines) {
    if (l.to && !warned.has(l.to)) {
      const cap = locations.get(l.to)?.capacityUnits || 0;
      if (cap && (usedAfter.get(l.to) || 0) > cap) {
        warnings.push(`La ubicación ${l.to} quedará por sobre su capacidad referencial (${fmtInt(usedAfter.get(l.to))} de ${fmtInt(cap)} unidades).`);
      }
      warned.add(l.to);
    }
  }

  const opSeq = state.meta.operationSeq + 1;
  const opId = operationId(opSeq);
  const nowIso = now.toISOString();
  const atIso = at.toISOString();
  const movements = lines.map((l, i) => {
    const record = {
      id: movementId(state.meta.movementSeq + i + 1),
      operationId: opId,
      type,
      sku: l.sku,
      qty: l.qty,
      from: l.from,
      to: l.to,
      departmentId: NEEDS_DEPARTMENT.has(type) ? departmentId : null,
      responsible,
      document,
      notes,
      at: atIso,
      createdAt: nowIso,
      source: op.source || 'ESCRITORIO',
    };
    if (l.receiptId) record.receiptId = l.receiptId;
    return record;
  });

  return {
    ok: true,
    warnings,
    plan: {
      operationId: opId,
      operationSeq: opSeq,
      movementSeq: state.meta.movementSeq + movements.length,
      movements,
      stockDeltas: [...deltas.entries()].map(([key, delta]) => {
        const [sku, location] = key.split('|');
        return { sku, location, delta };
      }),
      receiptUpdates: [...receiptUpdates.entries()].map(([id, qty]) => ({ id, qty })),
    },
  };
}

/**
 * Aplica un plan validado al estado. MODIFICA el estado recibido: úsese solo dentro de store.commit().
 * @param {import('../data/schema.js').AppState} draft
 * @param {object} plan resultado de planOperation() con ok = true (propiedad plan)
 */
export function applyPlan(draft, plan) {
  for (const { sku, location, delta } of plan.stockDeltas) {
    let rec = draft.stock.find((r) => r.sku === sku && r.location === location);
    if (!rec) {
      rec = { sku, location, qty: 0 };
      draft.stock.push(rec);
    }
    rec.qty += delta;
    if (rec.qty < 0) throw new Error(`Inventario negativo evitado en ${sku} / ${location}`);
  }
  draft.stock = draft.stock.filter((r) => r.qty > 0);
  for (const { id, qty } of plan.receiptUpdates) {
    const r = draft.pendingReceipts.find((x) => x.id === id);
    if (r) r.qtyReceived += qty;
  }
  for (const m of plan.movements) draft.movements.push(m);
  draft.meta.movementSeq = plan.movementSeq;
  draft.meta.operationSeq = plan.operationSeq;
}

/** Texto breve de un movimiento para mensajes. */
export function describeMovement(m) {
  return `${MOVEMENT_LABELS[m.type]} de ${fmtInt(m.qty)} × ${m.sku}`;
}
