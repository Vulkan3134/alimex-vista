import { h, replace } from '../../core/dom.js';
import { accessCard } from '../access.js';
import { ABC_CRITERIA } from '../../domain/abc.js';
import { HANDLING_RESTRICTIONS } from '../../data/schema.js';
import { INTEGRATION_DOMAINS } from '../../integration/contracts.js';
import { GATEWAY_METHODS } from '../../integration/erpGateway.js';
import { locationPayload, qrSvg } from '../../services/qr.js';
import { fmtInt, fmtMoney } from '../../core/format.js';
import { dataTable, field, input, pageHeader, select } from '../components/common.js';

function productForm(p) {
  return {
    sku: p?.sku || '',
    name: p?.name || '',
    category: p?.category || '',
    departmentId: p?.departmentId || '',
    unit: p?.unit || 'un',
    unitCost: p?.unitCost ?? 0,
    minStock: p?.params.minStock ?? 0,
    reorderPoint: p?.params.reorderPoint ?? 0,
    safetyStock: p?.params.safetyStock ?? 0,
    leadTimeDays: p?.params.leadTimeDays ?? 7,
    consumptionMode: p?.params.consumptionMode || 'auto',
    manualDailyConsumption: p?.params.manualDailyConsumption ?? 0,
    purchaseMultiple: p?.params.purchaseMultiple ?? 1,
    minOrderQty: p?.params.minOrderQty ?? 0,
    supplierId: p?.params.supplierId || '',
    weightKg: p?.handling.weightKg ?? 0,
    volumeL: p?.handling.volumeL ?? 0,
    restriction: p?.handling.restriction || 'ninguna',
  };
}

export function createSettingsView(ctx) {
  const ui = { tab: 'productos', edit: null, form: productForm(), errors: {}, qrAisle: '1' };

  function payloadFromForm() {
    const f = ui.form;
    return {
      sku: f.sku,
      name: f.name,
      category: f.category,
      departmentId: f.departmentId || null,
      unit: f.unit,
      unitCost: f.unitCost,
      params: {
        minStock: f.minStock,
        reorderPoint: f.reorderPoint,
        safetyStock: f.safetyStock,
        leadTimeDays: f.leadTimeDays,
        consumptionMode: f.consumptionMode,
        manualDailyConsumption: f.manualDailyConsumption,
        purchaseMultiple: f.purchaseMultiple,
        minOrderQty: f.minOrderQty,
        supplierId: f.supplierId || null,
      },
      handling: { weightKg: f.weightKg, volumeL: f.volumeL, restriction: f.restriction },
    };
  }

  function render(container) {
    const st = ctx.store.getState();
    const status = ctx.erp.status();
    const abc = st.settings.abc;
    const alerts = st.settings.alerts;

    const formFields = () => {
      const f = ui.form;
      const e = ui.errors;
      const set = (key) => (ev) => { f[key] = ev.target.type === 'number' ? ev.target.value : ev.target.value; };
      return h('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' } },
        field({ label: 'SKU', error: e.sku, children: input({ value: f.sku, disabled: Boolean(ui.edit), onInput: set('sku') }) }),
        field({ label: 'Nombre', error: e.name, children: input({ value: f.name, onInput: set('name') }) }),
        field({ label: 'Categoría', error: e.category, children: input({ value: f.category, onInput: set('category') }) }),
        field({
          label: 'Departamento habitual',
          children: select({ value: f.departmentId, onChange: set('departmentId') }, [{ value: '', label: 'Ninguno' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
        }),
        field({ label: 'Unidad', error: e.unit, children: input({ value: f.unit, onInput: set('unit') }) }),
        field({ label: 'Costo unitario (CLP ficticio)', error: e.unitCost, children: input({ type: 'number', min: '0', value: f.unitCost, onInput: set('unitCost') }) }),
        field({ label: 'Stock mínimo', error: e.minStock, children: input({ type: 'number', min: '0', value: f.minStock, onInput: set('minStock') }) }),
        field({ label: 'Punto de reposición', error: e.reorderPoint, children: input({ type: 'number', min: '0', value: f.reorderPoint, onInput: set('reorderPoint') }) }),
        field({ label: 'Stock de seguridad', error: e.safetyStock, children: input({ type: 'number', min: '0', value: f.safetyStock, onInput: set('safetyStock') }) }),
        field({ label: 'Tiempo de reposición (días)', error: e.leadTimeDays, children: input({ type: 'number', min: '0', value: f.leadTimeDays, onInput: set('leadTimeDays') }) }),
        field({
          label: 'Consumo diario',
          error: e.consumptionMode,
          children: select({ value: f.consumptionMode, onChange: set('consumptionMode') }, [
            { value: 'auto', label: 'Calculado desde el historial' },
            { value: 'manual', label: 'Fijado a mano' },
          ]),
        }),
        f.consumptionMode === 'manual' ? field({ label: 'Consumo diario manual (unidades enteras)', error: e.manualDailyConsumption, children: input({ type: 'number', min: '0', step: '1', value: f.manualDailyConsumption, onInput: set('manualDailyConsumption') }) }) : null,
        field({ label: 'Múltiplo de compra', error: e.purchaseMultiple, children: input({ type: 'number', min: '1', value: f.purchaseMultiple, onInput: set('purchaseMultiple') }) }),
        field({ label: 'Compra mínima', error: e.minOrderQty, children: input({ type: 'number', min: '0', value: f.minOrderQty, onInput: set('minOrderQty') }) }),
        field({
          label: 'Proveedor',
          error: e.supplierId,
          children: select({ value: f.supplierId, onChange: set('supplierId') }, [{ value: '', label: 'Ninguno' }, ...st.suppliers.map((s) => ({ value: s.id, label: s.name }))]),
        }),
        field({ label: 'Peso (kg)', error: e.weightKg, children: input({ type: 'number', min: '0', step: '0.01', value: f.weightKg, onInput: set('weightKg') }) }),
        field({ label: 'Volumen (L)', error: e.volumeL, children: input({ type: 'number', min: '0', step: '0.01', value: f.volumeL, onInput: set('volumeL') }) }),
        field({
          label: 'Restricción de manipulación',
          error: e.restriction,
          children: select({ value: f.restriction, onChange: set('restriction') }, Object.entries(HANDLING_RESTRICTIONS).map(([k, v]) => ({ value: k, label: v }))),
        }),
      );
    };

    const productsBlock = h('section.card',
      h('h2', ui.edit ? `Editar ${ui.edit}` : 'Nuevo producto'),
      h('p.muted.small', 'Los productos nuevos nacen sin existencias. El stock solo entra con un movimiento de entrada.'),
      formFields(),
      h('div.btn-row', { style: { marginTop: '10px' } },
        h('button.btn.btn-primary', {
          type: 'button',
          onClick: () => {
            const data = payloadFromForm();
            const editing = Boolean(ui.edit);
            const result = editing ? ctx.products.update(ui.edit, data) : ctx.products.create(data);
            if (!result.ok) {
              ui.errors = result.errors;
              ctx.toast('Revise los campos marcados.', 'error');
            } else {
              ui.errors = {};
              ui.edit = null;
              ui.form = productForm();
              ctx.toast(editing ? 'Producto actualizado. El historial de movimientos no se modificó.' : `Se creó ${data.sku} sin existencias.`, 'ok');
            }
            render(container);
          },
        }, ui.edit ? 'Guardar cambios' : 'Crear producto'),
        ui.edit ? h('button.btn', { type: 'button', onClick: () => { ui.edit = null; ui.form = productForm(); ui.errors = {}; render(container); } }, 'Cancelar') : null,
      ),
      h('h3', { style: { marginTop: '18px' } }, 'Catálogo'),
      dataTable({
        onRowClick: (row) => { ui.edit = row.sku; ui.form = productForm(st.products.find((p) => p.sku === row.sku)); ui.errors = {}; render(container); },
        columns: [
          { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
          { key: 'name', label: 'Producto' },
          { key: 'category', label: 'Categoría' },
          { key: 'unitCost', label: 'Costo', align: 'right', render: (v) => fmtMoney(v) },
          { key: 'min', label: 'Mínimo', align: 'right', render: (_, r) => fmtInt(r.params.minStock) },
          { key: 'lead', label: 'Plazo', align: 'right', render: (_, r) => `${fmtInt(r.params.leadTimeDays)} d` },
          { key: 'active', label: 'Estado', render: (v) => (v ? 'Activo' : 'Inactivo') },
        ],
        rows: st.products,
      }),
    );

    const paramsBlock = h('section.card',
      h('h2', 'Parámetros generales'),
      h('div.filters',
        field({
          label: 'Criterio ABC',
          children: select({
            value: abc.criterion,
            onChange: (e) => { ctx.products.updateSettings({ abc: { ...abc, criterion: e.target.value } }); render(container); },
          }, ABC_CRITERIA.map((c) => ({ value: c.id, label: c.label }))),
        }),
        field({
          label: 'Umbral clase A (%)',
          children: input({ type: 'number', min: '1', max: '99', value: abc.thresholdA, onChange: (e) => ctx.products.updateSettings({ abc: { ...abc, thresholdA: Number(e.target.value) } }) }),
        }),
        field({
          label: 'Umbral clase B (%)',
          children: input({ type: 'number', min: '1', max: '99', value: abc.thresholdB, onChange: (e) => ctx.products.updateSettings({ abc: { ...abc, thresholdB: Number(e.target.value) } }) }),
        }),
        field({
          label: 'Ventana ABC (días)',
          children: input({ type: 'number', min: '30', value: abc.windowDays, onChange: (e) => ctx.products.updateSettings({ abc: { ...abc, windowDays: Number(e.target.value) } }) }),
        }),
        field({
          label: 'Margen «cerca del punto de reposición» (%)',
          children: input({ type: 'number', min: '0', value: alerts.nearReorderMarginPct, onChange: (e) => ctx.products.updateSettings({ alerts: { ...alerts, nearReorderMarginPct: Number(e.target.value) } }) }),
        }),
        field({
          label: 'Ventana de consumo (días)',
          children: input({ type: 'number', min: '7', value: alerts.consumptionWindowDays, onChange: (e) => ctx.products.updateSettings({ alerts: { ...alerts, consumptionWindowDays: Number(e.target.value) } }) }),
        }),
        field({
          label: 'Usuario de la sesión',
          children: select({
            value: st.settings.currentUserId,
            onChange: (e) => { ctx.products.updateSettings({ currentUserId: e.target.value }); render(container); },
          }, st.users.map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` }))),
        }),
        field({
          label: 'Separador CSV',
          children: select({
            value: st.settings.csvDelimiter,
            onChange: (e) => ctx.products.updateSettings({ csvDelimiter: e.target.value }),
          }, [{ value: ';', label: 'Punto y coma (Excel en Chile)' }, { value: ',', label: 'Coma' }]),
        }),
      ),
      h('p.muted.small', ABC_CRITERIA.find((c) => c.id === abc.criterion)?.explain),
      h('p.muted.small', 'Las clases A, B y C se pintan en las ubicaciones del plano (Inventario y layout). El mismo criterio se usará en el layout físico del sitio cuando esté listo.'),
      h('div.btn-row',
        h('button.btn', {
          type: 'button',
          onClick: () => {
            const blob = JSON.stringify(st, null, 2);
            ctx.export.downloadText(blob, 'alimex-respaldo-demo.json', 'application/json');
          },
        }, 'Descargar respaldo'),
        h('button.btn', {
          type: 'button',
          onClick: () => {
            const inp = h('input', {
              type: 'file',
              accept: 'application/json',
              onChange: async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const data = JSON.parse(await file.text());
                  if (!ctx.store.replaceState(data)) ctx.toast('El archivo no es un respaldo válido.', 'error');
                  else ctx.toast('Respaldo restaurado.', 'ok');
                } catch {
                  ctx.toast('No se pudo leer el archivo.', 'error');
                }
              },
            });
            inp.click();
          },
        }, 'Restaurar respaldo'),
        h('button.btn.btn-danger', {
          type: 'button',
          onClick: async () => {
            const ok = await ctx.confirm({
              title: 'Volver a los datos de demostración',
              message: 'Se perderán los movimientos registrados en este navegador y se cargará de nuevo el catálogo ficticio.',
              ok: 'Restablecer',
              danger: true,
            });
            if (ok) {
              ctx.store.resetDemo();
              ctx.toast('Datos de demostración restablecidos.', 'ok');
              render(container);
            }
          },
        }, 'Restablecer demostración'),
      ),
    );

    const integration = h('section.card',
      h('h2', 'Preparación para Microsoft Dynamics'),
      h('p', `${status.label}. ${status.detail}`),
      h('p.muted.small', 'Un conector real deberá usar APIs, conectores o servicios oficiales y autorizados. Esta plataforma no accede a la base de datos interna de Dynamics ni genera órdenes de compra automáticas.'),
      dataTable({
        columns: [
          { key: 'name', label: 'Dominio' },
          { key: 'futureSource', label: 'Fuente oficial futura' },
          { key: 'now', label: 'Hoy (demostración)' },
          { key: 'purpose', label: 'Para qué sirve' },
        ],
        rows: INTEGRATION_DOMAINS,
      }),
      h('h3', { style: { marginTop: '14px' } }, 'Operaciones previstas del conector'),
      dataTable({
        columns: [
          { key: 'name', label: 'Operación' },
          { key: 'direction', label: 'Sentido' },
        ],
        rows: GATEWAY_METHODS,
      }),
    );

    const locs = st.locations.filter((l) => String(l.aisle) === ui.qrAisle);
    const qrBlock = h('section.card',
      h('h2', 'Etiquetas QR de ubicaciones'),
      h('p', 'Los códigos QR van en las ubicaciones físicas, no en cada caja. El QR solo lleva el código del lugar (ALIMEX:Pxx-Exx-Nxx): no incluye un SKU. Al escanear se abre el picking de Entradas y salidas y se ven los productos que hay ahí ahora.'),
      field({
        label: 'Pasillo a imprimir',
        children: select({
          value: ui.qrAisle,
          onChange: (e) => { ui.qrAisle = e.target.value; render(container); },
        }, [...new Set(st.locations.map((l) => String(l.aisle)))].map((a) => ({ value: a, label: `Pasillo ${a}` }))),
      }),
      h('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginTop: '10px' } },
        locs.map((l) => h('div', { style: { border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', textAlign: 'center' } },
          qrSvg(locationPayload(l.code), { moduleSize: 3, margin: 2, title: l.code }),
          h('div', { style: { fontFamily: 'var(--mono)', marginTop: '6px' } }, l.code),
          h('div.muted.small', locationPayload(l.code)),
        )),
      ),
      h('p.muted.small', 'Use la impresión del navegador para generar las etiquetas. Una ubicación puede tener varios SKU o ninguno: el producto no va grabado en el QR.'),
    );

    replace(container,
      pageHeader('Configuración de productos y parámetros', 'Cambiar un mínimo o un criterio ABC no altera el historial de movimientos. Cada cambio queda en la auditoría interna.'),
      accessCard({ onCopy: (msg, kind) => ctx.toast(msg, kind) }),
      h('div.tabs.no-print', { style: { marginTop: '12px' } },
        [['productos', 'Productos'], ['parametros', 'Parámetros'], ['dynamics', 'Dynamics (preparación)'], ['qr', 'Etiquetas QR']].map(([id, label]) => h('button.tab', {
          type: 'button',
          class: ui.tab === id ? 'is-on' : '',
          onClick: () => { ui.tab = id; render(container); },
        }, label)),
      ),
      ui.tab === 'productos' ? productsBlock : null,
      ui.tab === 'parametros' ? paramsBlock : null,
      ui.tab === 'dynamics' ? integration : null,
      ui.tab === 'qr' ? qrBlock : null,
      ui.tab === 'productos' ? h('p.muted.small', `${fmtInt(st.products.length)} SKU en el catálogo ficticio. Pulse una fila para editarla.`) : null,
    );
  }

  return { render };
}
