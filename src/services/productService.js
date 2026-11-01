// Gestión de productos y de sus parámetros (datos maestros ficticios en esta etapa).
// Cada cambio de parámetros deja una huella en el registro de auditoría; el historial de movimientos no se toca.
import { HANDLING_RESTRICTIONS } from '../data/schema.js';
import { ceilUnits, fmtNum } from '../core/format.js';

const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

const PARAM_LABELS = {
  minStock: 'Stock mínimo',
  reorderPoint: 'Punto de reposición',
  safetyStock: 'Stock de seguridad',
  leadTimeDays: 'Tiempo de reposición (días)',
  consumptionMode: 'Origen del consumo diario',
  manualDailyConsumption: 'Consumo diario manual',
  purchaseMultiple: 'Múltiplo de compra',
  minOrderQty: 'Compra mínima',
  supplierId: 'Proveedor',
};

const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;

/**
 * Valida los datos de un producto. Devuelve un objeto { campo: mensaje } (vacío si todo está bien).
 * @param {import('../data/schema.js').AppState} state
 * @param {Partial<import('../data/schema.js').Product> & {params?: object, handling?: object}} data
 * @param {{isNew: boolean}} options
 */
export function validateProduct(state, data, { isNew }) {
  const errors = {};
  const sku = String(data.sku ?? '').trim().toUpperCase();
  if (isNew) {
    if (!sku) errors.sku = 'Indique el código SKU.';
    else if (!SKU_RE.test(sku)) errors.sku = 'El SKU solo admite letras, números y guiones (2 a 20 caracteres).';
    else if (state.products.some((p) => p.sku.toUpperCase() === sku)) errors.sku = `El SKU «${sku}» ya existe.`;
  }
  if (!String(data.name ?? '').trim()) errors.name = 'Indique el nombre del producto.';
  else if (String(data.name).trim().length > 80) errors.name = 'El nombre admite hasta 80 caracteres.';
  if (!String(data.category ?? '').trim()) errors.category = 'Indique la categoría.';
  if (!String(data.unit ?? '').trim()) errors.unit = 'Indique la unidad de medida.';
  if (!(Number(data.unitCost) >= 0) || data.unitCost === '' || data.unitCost === null) errors.unitCost = 'El costo unitario debe ser un número igual o mayor que cero.';

  const p = data.params || {};
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  if (!isNonNegInt(num(p.minStock))) errors.minStock = 'El stock mínimo debe ser un número entero igual o mayor que cero.';
  if (!isNonNegInt(num(p.reorderPoint))) errors.reorderPoint = 'El punto de reposición debe ser un número entero igual o mayor que cero.';
  else if (!errors.minStock && num(p.reorderPoint) < num(p.minStock)) errors.reorderPoint = 'El punto de reposición no puede ser menor que el stock mínimo.';
  if (!isNonNegInt(num(p.safetyStock))) errors.safetyStock = 'El stock de seguridad debe ser un número entero igual o mayor que cero.';
  if (!isNonNegInt(num(p.leadTimeDays))) errors.leadTimeDays = 'El tiempo de reposición debe ser un número entero de días.';
  if (!['auto', 'manual'].includes(p.consumptionMode)) errors.consumptionMode = 'Seleccione el origen del consumo diario.';
  if (p.consumptionMode === 'manual' && !(num(p.manualDailyConsumption) >= 0)) errors.manualDailyConsumption = 'Indique el consumo diario en unidades enteras (si hay decimal, se sube al siguiente).';
  if (!(Number.isInteger(num(p.purchaseMultiple)) && num(p.purchaseMultiple) >= 1)) errors.purchaseMultiple = 'El múltiplo de compra debe ser un entero igual o mayor que 1.';
  if (!isNonNegInt(num(p.minOrderQty))) errors.minOrderQty = 'La compra mínima debe ser un entero igual o mayor que cero.';
  if (p.supplierId && !state.suppliers.some((s) => s.id === p.supplierId)) errors.supplierId = 'El proveedor indicado no existe.';

  const h = data.handling || {};
  if (!(num(h.weightKg) >= 0)) errors.weightKg = 'El peso debe ser un número igual o mayor que cero.';
  if (!(num(h.volumeL) >= 0)) errors.volumeL = 'El volumen debe ser un número igual o mayor que cero.';
  if (!Object.keys(HANDLING_RESTRICTIONS).includes(h.restriction)) errors.restriction = 'Seleccione una restricción de manipulación.';
  return errors;
}

function normalizeProduct(data) {
  const p = data.params;
  const h = data.handling;
  return {
    sku: String(data.sku).trim().toUpperCase(),
    name: String(data.name).trim(),
    category: String(data.category).trim(),
    departmentId: data.departmentId || null,
    unit: String(data.unit).trim(),
    unitCost: Number(data.unitCost),
    active: data.active !== false,
    params: {
      minStock: Number(p.minStock),
      reorderPoint: Number(p.reorderPoint),
      safetyStock: Number(p.safetyStock),
      leadTimeDays: Number(p.leadTimeDays),
      consumptionMode: p.consumptionMode,
      manualDailyConsumption: ceilUnits(Number(p.manualDailyConsumption) || 0),
      purchaseMultiple: Number(p.purchaseMultiple),
      minOrderQty: Number(p.minOrderQty),
      supplierId: p.supplierId || null,
    },
    handling: { weightKg: Number(h.weightKg), volumeL: Number(h.volumeL), restriction: h.restriction },
  };
}

function nextAuditId(state) {
  return `AUD-${String(state.audit.length + 1).padStart(6, '0')}`;
}

function currentUserName(state) {
  return state.users.find((u) => u.id === state.settings.currentUserId)?.name || 'Usuario';
}

function addAudit(draft, nowDate, action, target, detail) {
  draft.audit.push({ id: nextAuditId(draft), at: nowDate.toISOString(), user: currentUserName(draft), action, target, detail });
  if (draft.audit.length > 500) draft.audit.splice(0, draft.audit.length - 500);
}

/**
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @param {{now: () => Date}} deps
 */
export function createProductService(store, { now }) {
  return {
    validate: (data, options) => validateProduct(store.getState(), data, options),

    /** Crea un producto nuevo (sin existencias: estas solo ingresan con movimientos de entrada). */
    create(data) {
      const errors = validateProduct(store.getState(), data, { isNew: true });
      if (Object.keys(errors).length) return { ok: false, errors };
      const product = normalizeProduct(data);
      store.commit((draft) => {
        draft.products.push(product);
        addAudit(draft, now(), 'Alta de producto', product.sku, `Se creó «${product.name}».`);
      }, 'alta de producto');
      return { ok: true, product };
    },

    /** Modifica datos maestros y parámetros. Registra en auditoría qué cambió. */
    update(sku, data) {
      const current = store.getState().products.find((p) => p.sku === sku);
      if (!current) return { ok: false, errors: { sku: 'El producto no existe.' } };
      const errors = validateProduct(store.getState(), { ...data, sku }, { isNew: false });
      if (Object.keys(errors).length) return { ok: false, errors };
      const next = normalizeProduct({ ...data, sku, active: current.active });

      const changes = [];
      for (const key of Object.keys(PARAM_LABELS)) {
        if (current.params[key] !== next.params[key]) {
          const show = (v) => (typeof v === 'number' ? fmtNum(v, 2) : v ?? '—');
          changes.push(`${PARAM_LABELS[key]}: ${show(current.params[key])} → ${show(next.params[key])}`);
        }
      }
      if (current.name !== next.name) changes.push(`Nombre: «${current.name}» → «${next.name}»`);
      if (current.category !== next.category) changes.push(`Categoría: ${current.category} → ${next.category}`);
      if (current.unitCost !== next.unitCost) changes.push(`Costo unitario: ${current.unitCost} → ${next.unitCost}`);
      if (current.handling.restriction !== next.handling.restriction) changes.push(`Restricción: ${current.handling.restriction} → ${next.handling.restriction}`);

      store.commit((draft) => {
        const target = draft.products.find((p) => p.sku === sku);
        Object.assign(target, { name: next.name, category: next.category, departmentId: next.departmentId, unit: next.unit, unitCost: next.unitCost });
        target.params = next.params;
        target.handling = next.handling;
        if (changes.length) addAudit(draft, now(), 'Cambio de parámetros', sku, changes.join('; '));
      }, 'edición de producto');
      return { ok: true, changes };
    },

    /** Activa o desactiva un producto. No se elimina nunca: su historial permanece. */
    setActive(sku, active) {
      const current = store.getState().products.find((p) => p.sku === sku);
      if (!current) return { ok: false, errors: { sku: 'El producto no existe.' } };
      store.commit((draft) => {
        draft.products.find((p) => p.sku === sku).active = Boolean(active);
        addAudit(draft, now(), active ? 'Reactivación de producto' : 'Desactivación de producto', sku, active ? 'El producto vuelve a admitir movimientos.' : 'El producto deja de admitir movimientos; su historial se conserva.');
      }, 'estado de producto');
      return { ok: true };
    },

    /** Actualiza la configuración general (ABC, alertas, formato de exportación). */
    updateSettings(patch) {
      store.commit((draft) => {
        const s = draft.settings;
        const changes = [];
        if (patch.abc) {
          for (const k of Object.keys(patch.abc)) {
            if (s.abc[k] !== patch.abc[k]) {
              changes.push(`ABC ${k}: ${s.abc[k]} → ${patch.abc[k]}`);
              s.abc[k] = patch.abc[k];
            }
          }
        }
        if (patch.alerts) {
          for (const k of Object.keys(patch.alerts)) {
            if (s.alerts[k] !== patch.alerts[k]) {
              changes.push(`Alertas ${k}: ${s.alerts[k]} → ${patch.alerts[k]}`);
              s.alerts[k] = patch.alerts[k];
            }
          }
        }
        for (const k of ['csvDelimiter', 'currentUserId']) {
          if (patch[k] !== undefined && s[k] !== patch[k]) {
            changes.push(`${k}: ${s[k]} → ${patch[k]}`);
            s[k] = patch[k];
          }
        }
        if (changes.length) addAudit(draft, now(), 'Cambio de configuración', 'Parámetros generales', changes.join('; '));
      }, 'configuración');
      return { ok: true };
    },
  };
}
