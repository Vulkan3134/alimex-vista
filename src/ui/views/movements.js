import { h, replace } from '../../core/dom.js';
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from '../../data/schema.js';
import { toLocalInput, fromLocalInput } from '../../core/dates.js';
import { fmtInt } from '../../core/format.js';
import { field, input, pageHeader, select, tabs } from '../components/common.js';
import { createMobileView } from './mobile.js';

function blankLine() {
  return { sku: '', name: '', qty: '', from: '', to: '', receiptId: '', available: 0 };
}

export function createMovementsView(ctx) {
  const state0 = ctx.store.getState();
  const user = state0.users.find((u) => u.id === state0.settings.currentUserId);
  const picking = createMobileView(ctx, { embedded: true });
  const ui = {
    mode: 'escritorio',
    type: 'SALIDA',
    at: toLocalInput(ctx.now()),
    responsible: user?.name || '',
    document: '',
    notes: '',
    departmentId: '',
    lines: [blankLine()],
    errors: [],
    warnings: [],
    querySig: '',
  };

  function stockAt(sku, loc) {
    const rec = ctx.store.getState().stock.find((r) => r.sku === sku && r.location === loc);
    return rec?.qty || 0;
  }

  function locationsFor(sku, kind) {
    const st = ctx.store.getState();
    if (kind === 'from') {
      return st.stock.filter((r) => r.sku === sku && r.qty > 0).map((r) => ({ value: r.location, label: `${r.location} (${fmtInt(r.qty)} un.)` }));
    }
    return st.locations.filter((l) => l.active).map((l) => ({ value: l.code, label: l.code }));
  }

  function applyQuery(query) {
    if (!query) return;
    if (query.modo === 'picking' || query.modo === 'movil') ui.mode = 'picking';
    if (query.modo === 'escritorio') ui.mode = 'escritorio';
    if (query.tipo && MOVEMENT_TYPES[query.tipo]) ui.type = query.tipo;
    if (query.sku) {
      const p = ctx.store.getState().products.find((x) => x.sku === query.sku);
      ui.lines[0].sku = query.sku;
      ui.lines[0].name = p?.name || '';
      const locs = locationsFor(query.sku, 'from');
      if (locs[0]) {
        ui.lines[0].from = query.from || locs[0].value;
        ui.lines[0].available = stockAt(query.sku, ui.lines[0].from);
      }
    } else if (query.from) {
      ui.lines[0].from = query.from;
      const found = ctx.store.getState().stock.find((r) => r.location === query.from && r.qty > 0);
      if (found) {
        const p = ctx.store.getState().products.find((x) => x.sku === found.sku);
        ui.lines[0].sku = found.sku;
        ui.lines[0].name = p?.name || '';
        ui.lines[0].available = found.qty;
      }
    }
  }

  function validatePreview() {
    const op = currentOp();
    const result = ctx.movements.validate(op);
    ui.errors = result.ok ? [] : result.errors;
    ui.warnings = result.ok ? result.warnings : [];
    return result;
  }

  function currentOp() {
    return {
      type: ui.type,
      at: fromLocalInput(ui.at) || ctx.now(),
      responsible: ui.responsible,
      document: ui.document,
      notes: ui.notes,
      departmentId: ui.departmentId || null,
      source: 'ESCRITORIO',
      lines: ui.lines.map((l) => ({
        sku: l.sku,
        qty: l.qty === '' ? '' : Number(l.qty),
        from: l.from || null,
        to: l.to || null,
        receiptId: l.receiptId || null,
      })),
    };
  }

  function err(line, fieldName) {
    return ui.errors.find((e) => e.line === line && e.field === fieldName)?.message
      || (line === null ? ui.errors.find((e) => e.line === null && e.field === fieldName)?.message : '');
  }

  async function submit() {
    const result = ctx.movements.register(currentOp());
    if (!result.ok) {
      ui.errors = result.errors;
      ctx.toast('Revise los datos: no se registró el movimiento.', 'error');
      return false;
    }
    ui.errors = [];
    ui.warnings = result.warnings || [];
    ui.lines = [blankLine()];
    ui.document = '';
    ui.notes = '';
    ctx.toast(`Se registró la operación ${result.operationId}. El inventario, las alertas y el ranking se actualizaron.`, 'ok');
    return true;
  }

  function render(container, match) {
    const sig = JSON.stringify(match?.query || {});
    if (sig !== ui.querySig) {
      ui.querySig = sig;
      applyQuery(match?.query);
    }
    const st = ctx.store.getState();
    const products = st.products.filter((p) => p.active);
    const needsDept = ui.type === 'SALIDA' || ui.type === 'DEVOLUCION';
    const needsFrom = ui.type === 'SALIDA' || ui.type === 'TRASLADO';
    const needsTo = ui.type === 'ENTRADA' || ui.type === 'DEVOLUCION' || ui.type === 'TRASLADO';

    const pickingHost = h('div.picking-host');
    replace(container,
      pageHeader(
        'Registro de entradas y salidas',
        ui.mode === 'picking'
          ? 'Picking por ubicación: ingresos y salidas desde el QR del rack. Es el mismo registro que el formulario; los traslados y devoluciones se hacen en el formulario.'
          : 'Una operación puede incluir varias líneas. Si alguna es inválida, no se registra ninguna. No se permite inventario negativo.',
      ),
      tabs(
        [
          { id: 'escritorio', label: 'Formulario' },
          { id: 'picking', label: 'Picking por ubicación' },
        ],
        ui.mode,
        (id) => {
          if (id !== 'picking') picking.stopScan();
          ui.mode = id;
          render(container, match);
        },
      ),
      ui.mode === 'picking' ? pickingHost : h('section.card',
        tabs(
          Object.keys(MOVEMENT_TYPES).map((id) => ({ id, label: MOVEMENT_LABELS[id] })),
          ui.type,
          (id) => { ui.type = id; ui.errors = []; render(container, match); },
        ),
        h('div.filters', { style: { marginTop: '12px' } },
          field({
            label: 'Fecha y hora',
            error: err(null, 'at'),
            children: input({ type: 'datetime-local', value: ui.at, onChange: (e) => { ui.at = e.target.value; } }),
          }),
          field({
            label: 'Responsable',
            error: err(null, 'responsible'),
            children: select(
              { value: ui.responsible, onChange: (e) => { ui.responsible = e.target.value; } },
              [{ value: '', label: 'Seleccione' }, ...st.users.map((u) => ({ value: u.name, label: u.name }))],
            ),
          }),
          needsDept ? field({
            label: ui.type === 'SALIDA' ? 'Departamento solicitante' : 'Departamento que devuelve',
            error: err(null, 'departmentId'),
            children: select(
              { value: ui.departmentId, onChange: (e) => { ui.departmentId = e.target.value; } },
              [{ value: '', label: 'Seleccione' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))],
            ),
          }) : null,
          field({
            label: 'Documento o referencia',
            error: err(null, 'document'),
            children: input({ value: ui.document, maxlength: '60', onInput: (e) => { ui.document = e.target.value; } }),
          }),
        ),
        field({
          label: 'Observaciones (opcional)',
          error: err(null, 'notes'),
          children: h('textarea', { value: ui.notes, maxlength: '300', onInput: (e) => { ui.notes = e.target.value; } }),
        }),
        h('h3', 'Líneas de producto'),
        err(null, 'lines') ? h('p.err', err(null, 'lines')) : null,
        h('div.lines', ui.lines.map((line, i) => {
          const n = i + 1;
          const fromOpts = line.sku ? locationsFor(line.sku, 'from') : [];
          const receipts = st.pendingReceipts.filter((r) => r.sku === line.sku && r.qtyOrdered - r.qtyReceived > 0);
          return h('div.line',
            field({
              label: `SKU línea ${n}`,
              error: err(n, 'sku'),
              children: input({
                value: line.sku,
                list: 'sku-list',
                placeholder: 'SKU-001',
                onInput: (e) => {
                  line.sku = e.target.value.toUpperCase();
                  const p = products.find((x) => x.sku === line.sku);
                  line.name = p?.name || '';
                  const locs = locationsFor(line.sku, 'from');
                  if (locs[0] && !line.from) line.from = locs[0].value;
                  line.available = stockAt(line.sku, line.from);
                  render(container, match);
                },
              }),
            }),
            field({ label: 'Nombre', children: input({ value: line.name, readOnly: true }) }),
            needsFrom ? field({
              label: 'Origen',
              error: err(n, 'from'),
              children: select({
                value: line.from,
                onChange: (e) => {
                  line.from = e.target.value;
                  line.available = stockAt(line.sku, line.from);
                  render(container, match);
                },
              }, [{ value: '', label: 'Seleccione' }, ...fromOpts]),
            }) : null,
            needsTo ? field({
              label: 'Destino',
              error: err(n, 'to'),
              children: select({
                value: line.to,
                onChange: (e) => { line.to = e.target.value; },
              }, [{ value: '', label: 'Seleccione' }, ...st.locations.filter((l) => l.active).map((l) => ({ value: l.code, label: l.code }))]),
            }) : null,
            field({
              label: needsFrom ? `Cantidad (hay ${fmtInt(line.available)})` : 'Cantidad',
              error: err(n, 'qty'),
              children: input({
                type: 'number',
                min: '1',
                step: '1',
                value: line.qty,
                onInput: (e) => { line.qty = e.target.value; },
              }),
            }),
            ui.type === 'ENTRADA' && receipts.length ? field({
              label: 'Recepción pendiente',
              error: err(n, 'receiptId'),
              children: select({
                value: line.receiptId,
                onChange: (e) => { line.receiptId = e.target.value; },
              }, [{ value: '', label: 'Ninguna' }, ...receipts.map((r) => ({ value: r.id, label: `${r.id} (${fmtInt(r.qtyOrdered - r.qtyReceived)} por recibir)` }))]),
            }) : null,
            h('button.btn', {
              type: 'button',
              'aria-label': 'Quitar línea',
              onClick: () => { ui.lines = ui.lines.filter((_, j) => j !== i); if (!ui.lines.length) ui.lines = [blankLine()]; render(container, match); },
            }, '×'),
          );
        })),
        h('datalist#sku-list', products.map((p) => h('option', { value: p.sku }, p.name))),
        h('div.btn-row', { style: { marginTop: '10px' } },
          h('button.btn', { type: 'button', onClick: () => { ui.lines.push(blankLine()); render(container, match); } }, 'Agregar línea'),
          h('button.btn', { type: 'button', onClick: () => { validatePreview(); render(container, match); } }, 'Validar sin registrar'),
          h('button.btn.btn-primary', {
            type: 'button',
            onClick: async () => {
              const ok = await submit();
              render(container, match);
              if (ok) ctx.navigate('/historial');
            },
          }, `Confirmar ${MOVEMENT_LABELS[ui.type].toLowerCase()}`),
        ),
        ui.warnings.length ? h('p.muted.small', ui.warnings.join(' ')) : null,
        h('p.muted.small', 'Los traslados y las devoluciones se registran como movimientos independientes. Una devolución no se cuenta como salida en el ranking.'),
      ),
    );
    if (ui.mode === 'picking') picking.render(pickingHost, match);
  }

  return { render };
}
