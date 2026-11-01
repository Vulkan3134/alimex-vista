import { h, replace } from '../../core/dom.js';
import { MOVEMENT_LABELS, MOVEMENT_ORDER } from '../../data/schema.js';
import { fmtDateTime, fmtInt } from '../../core/format.js';
import { dataTable, field, input, pageHeader, pager, periodFilter, select } from '../components/common.js';

export function createHistoryView(ctx) {
  const ui = {
    periodId: 'mes_actual',
    from: '',
    to: '',
    sku: '',
    departmentId: '',
    location: '',
    type: '',
    page: 1,
    selected: null,
    pageSize: 40,
  };

  function filtered() {
    const period = ctx.inventory.period(ui.periodId, { from: ui.from, to: ui.to });
    const st = ctx.store.getState();
    const loc = ui.location.trim().toUpperCase();
    const sku = ui.sku.trim().toUpperCase();
    return st.movements.filter((m) => {
      const ts = Date.parse(m.at);
      if (period.valid && (ts < period.from.getTime() || ts > period.to.getTime())) return false;
      if (ui.type && m.type !== ui.type) return false;
      if (sku && m.sku !== sku) return false;
      if (ui.departmentId && m.departmentId !== ui.departmentId) return false;
      if (loc && m.from !== loc && m.to !== loc) return false;
      return true;
    }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (b.id < a.id ? 1 : -1));
  }

  function render(container) {
    const st = ctx.store.getState();
    const rows = filtered();
    const start = (ui.page - 1) * ui.pageSize;
    const pageRows = rows.slice(start, start + ui.pageSize);
    const selected = ui.selected ? rows.find((m) => m.id === ui.selected) : null;
    const productName = (sku) => st.products.find((p) => p.sku === sku)?.name || sku;
    const deptName = (id) => st.departments.find((d) => d.id === id)?.name || '—';

    const columns = [
      { key: 'at', label: 'Fecha y hora', render: (v) => fmtDateTime(v) },
      { key: 'type', label: 'Tipo', render: (v) => MOVEMENT_LABELS[v] || v },
      { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
      { key: 'name', label: 'Producto', render: (_, r) => productName(r.sku) },
      { key: 'qty', label: 'Cantidad', align: 'right', render: (v) => fmtInt(v) },
      { key: 'from', label: 'Origen' },
      { key: 'to', label: 'Destino' },
      { key: 'departmentId', label: 'Departamento', render: (v) => (v ? deptName(v) : '—') },
      { key: 'responsible', label: 'Responsable' },
      { key: 'document', label: 'Documento' },
    ];

    replace(container,
      pageHeader(
        'Historial y trazabilidad',
        'Cada movimiento queda registrado y no se modifica. Las devoluciones aparecen como un tipo propio, no como una salida negativa.',
        [
          h('button.btn', {
            type: 'button',
            onClick: () => ctx.export.downloadCsv(rows.map((m) => ({
              ...m,
              typeLabel: MOVEMENT_LABELS[m.type],
              name: productName(m.sku),
              department: m.departmentId ? deptName(m.departmentId) : '',
            })), [
              { key: 'id', label: 'Id' }, { key: 'at', label: 'Fecha' }, { key: 'typeLabel', label: 'Tipo' },
              { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'qty', label: 'Cantidad' },
              { key: 'from', label: 'Origen' }, { key: 'to', label: 'Destino' },
              { key: 'department', label: 'Departamento' }, { key: 'responsible', label: 'Responsable' },
              { key: 'document', label: 'Documento' }, { key: 'notes', label: 'Observaciones' },
            ], 'historial_movimientos'),
          }, 'Exportar CSV'),
          h('button.btn', {
            type: 'button',
            onClick: () => ctx.export.downloadXlsx([{
              name: 'Historial',
              columns: [
                { key: 'id', label: 'Id' }, { key: 'at', label: 'Fecha' }, { key: 'type', label: 'Tipo' },
                { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Producto' }, { key: 'qty', label: 'Cantidad' },
                { key: 'from', label: 'Origen' }, { key: 'to', label: 'Destino' },
                { key: 'department', label: 'Departamento' }, { key: 'responsible', label: 'Responsable' },
                { key: 'document', label: 'Documento' }, { key: 'notes', label: 'Observaciones' },
              ],
              rows: rows.map((m) => ({
                ...m,
                type: MOVEMENT_LABELS[m.type],
                name: productName(m.sku),
                department: m.departmentId ? deptName(m.departmentId) : '',
              })),
            }], 'historial_movimientos'),
          }, 'Exportar Excel'),
        ],
      ),
      h('section.card',
        h('div.filters',
          periodFilter(ui, () => { ui.page = 1; render(container); }),
          field({
            label: 'SKU',
            children: input({ value: ui.sku, placeholder: 'SKU-001', onInput: (e) => { ui.sku = e.target.value; ui.page = 1; render(container); } }),
          }),
          field({
            label: 'Departamento',
            children: select({
              value: ui.departmentId,
              onChange: (e) => { ui.departmentId = e.target.value; ui.page = 1; render(container); },
            }, [{ value: '', label: 'Todos' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
          }),
          field({
            label: 'Ubicación',
            children: input({ value: ui.location, placeholder: 'P01-E02-N03', onInput: (e) => { ui.location = e.target.value; ui.page = 1; render(container); } }),
          }),
          field({
            label: 'Tipo',
            children: select({
              value: ui.type,
              onChange: (e) => { ui.type = e.target.value; ui.page = 1; render(container); },
            }, [{ value: '', label: 'Todos' }, ...MOVEMENT_ORDER.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))]),
          }),
        ),
        dataTable({
          selectedKey: ui.selected,
          rowKey: (r) => r.id,
          onRowClick: (row) => { ui.selected = row.id; render(container); },
          columns,
          rows: pageRows,
          empty: 'No hay movimientos con esos filtros.',
        }),
        pager({
          page: ui.page,
          pageSize: ui.pageSize,
          total: rows.length,
          onPage: (p) => { ui.page = p; render(container); },
        }),
      ),
      selected ? h('section.card',
        h('h2', `Detalle ${selected.id}`),
        h('p', `${MOVEMENT_LABELS[selected.type]} de ${fmtInt(selected.qty)} × ${selected.sku} (${productName(selected.sku)}).`),
        h('p', `Operación ${selected.operationId}. Registrado el ${fmtDateTime(selected.createdAt)} por ${selected.responsible}.`),
        h('p', `Origen: ${selected.from || '—'}. Destino: ${selected.to || '—'}. Departamento: ${selected.departmentId ? deptName(selected.departmentId) : '—'}.`),
        h('p', `Documento: ${selected.document || '—'}. Observaciones: ${selected.notes || '—'}.`),
        h('p.muted.small', `Origen del registro: ${selected.source}. Este registro no se edita ni se elimina.`),
      ) : null,
    );
  }

  return { render };
}
