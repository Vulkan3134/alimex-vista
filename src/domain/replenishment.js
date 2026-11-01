// Recomendación de reposición. Solo calcula una sugerencia: NO genera solicitudes ni órdenes de compra.
import { ceilUnits, fmtInt, fmtUnits } from '../core/format.js';

/**
 * Cantidad sugerida a reponer.
 *   Necesidad = demanda durante el plazo del proveedor + stock de seguridad
 *   Sugerido  = Necesidad - stock disponible (ya descontados los comprometidos) - pendiente de recibir
 *   Luego se respeta la cantidad mínima de compra y el múltiplo de compra del proveedor.
 *
 * @param {object} input
 * @param {{params: import('../data/schema.js').ProductParams, unit?: string}} input.product
 * @param {number} input.avgDaily consumo promedio diario
 * @param {number} input.total stock total físico
 * @param {number} input.committed unidades comprometidas
 * @param {number} input.pending unidades pendientes de recepción
 */
export function suggestReplenishment({ product, avgDaily, total, committed, pending }) {
  const p = product.params;
  const unit = product.unit || 'un';
  const available = Math.max(0, total - committed);
  const demandDuringLeadTime = ceilUnits(avgDaily * p.leadTimeDays);
  const requirement = demandDuringLeadTime + p.safetyStock;
  const rawNeed = requirement - available - pending;

  const steps = [];
  steps.push(`Demanda esperada durante el plazo del proveedor: ${fmtUnits(avgDaily)} ${unit}/día × ${fmtInt(p.leadTimeDays)} días = ${fmtUnits(demandDuringLeadTime)} ${unit}. El consumo diario es entero: no se usa media unidad (si el promedio da decimal, se sube al siguiente).`);
  steps.push(`Más el stock de seguridad (${fmtInt(p.safetyStock)} ${unit}): necesidad total de ${fmtUnits(requirement)} ${unit}.`);
  steps.push(`Menos el stock disponible: ${fmtInt(available)} ${unit} (stock total ${fmtInt(total)} menos ${fmtInt(committed)} comprometidas).`);
  steps.push(`Menos lo pendiente de recibir: ${fmtInt(pending)} ${unit}.`);

  let qty = 0;
  let minOrderApplied = false;
  let multipleApplied = false;
  if (rawNeed > 0) {
    qty = Math.ceil(rawNeed - 1e-9);
    steps.push(`Cantidad necesaria: ${fmtInt(qty)} ${unit}.`);
    if (p.minOrderQty > 0 && qty < p.minOrderQty) {
      qty = p.minOrderQty;
      minOrderApplied = true;
      steps.push(`Se ajusta a la compra mínima del proveedor: ${fmtInt(qty)} ${unit}.`);
    }
    if (p.purchaseMultiple > 1 && qty % p.purchaseMultiple !== 0) {
      qty = Math.ceil(qty / p.purchaseMultiple) * p.purchaseMultiple;
      multipleApplied = true;
      steps.push(`Se redondea al múltiplo de compra (${fmtInt(p.purchaseMultiple)}): ${fmtInt(qty)} ${unit}.`);
    }
  } else {
    steps.push('Las existencias y lo que viene en camino cubren la necesidad: no se sugiere reponer.');
  }

  return {
    suggestedQty: qty,
    demandDuringLeadTime,
    requirement,
    available,
    pending,
    rawNeed: Math.max(0, rawNeed),
    minOrderApplied,
    multipleApplied,
    steps,
  };
}
