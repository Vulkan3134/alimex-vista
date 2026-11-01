import { h, replace } from '../../core/dom.js';
import { fmtInt, fmtPct } from '../../core/format.js';
import { barChart } from '../charts/svgCharts.js';
import { dataTable, field, pageHeader, periodFilter, select } from '../components/common.js';

export function createRankingView(ctx) {
  const ui = { periodId: 'mes_actual', from: '', to: '', departmentId: '', open: null, routeToken: '' };

  function render(container, match) {
    const routeToken = JSON.stringify(match?.query || {});
    if (routeToken !== ui.routeToken) {
      ui.routeToken = routeToken;
      if (match?.query?.departamento) ui.departmentId = match.query.departamento;
    }
    const period = ctx.inventory.period(ui.periodId, { from: ui.from, to: ui.to });
    const data = ctx.inventory.ranking({ period, departmentId: ui.departmentId || null });
    const st = ctx.store.getState();

    replace(container,
      pageHeader(
        'Ranking de SKU con mayor salida',
        'Suma todas las unidades retiradas del período. Distingue unidades y número de movimientos. Si un SKU lo pidieron varias áreas, se muestra el desglose. Las devoluciones no cuentan como salidas.',
      ),
      h('section.card',
        h('div.filters',
          periodFilter(ui, () => render(container)),
          field({
            label: 'Departamento',
            children: select({
              value: ui.departmentId,
              onChange: (e) => { ui.departmentId = e.target.value; render(container); },
            }, [{ value: '', label: 'Todos los departamentos' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
          }),
        ),
        !period.valid ? h('p.err', period.error) : null,
        h('p', `Período: ${period.label}. Unidades retiradas: ${fmtInt(data.totalUnits)}. Movimientos: ${fmtInt(data.totalMovements)}. Devoluciones (no suman): ${fmtInt(data.returnsUnits)}.`),
      ),
      h('div.grid.charts',
        h('section.card', barChart('Unidades retiradas', data.rows.slice(0, 10).map((r) => ({ label: r.sku, value: r.units })))),
        h('section.card', barChart('Participación por departamento', data.departments.map((d) => ({ label: d.name, value: d.units })))),
      ),
      h('section.card',
        dataTable({
          empty: 'No hubo salidas en el período seleccionado.',
          onRowClick: (row) => { ui.open = ui.open === row.sku ? null : row.sku; render(container); },
          columns: [
            { key: 'position', label: 'Puesto', align: 'right' },
            { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
            { key: 'name', label: 'Producto' },
            { key: 'departmentLabel', label: 'Departamento' },
            { key: 'units', label: 'Unidades retiradas', align: 'right', render: (v) => fmtInt(v) },
            { key: 'share', label: 'Participación', align: 'right', render: (v) => fmtPct(v) },
            { key: 'movements', label: 'N° de movimientos', align: 'right', render: (v) => fmtInt(v) },
          ],
          rows: data.rows,
        }),
        ui.open ? (() => {
          const row = data.rows.find((r) => r.sku === ui.open);
          if (!row) return null;
          return h('div', { style: { marginTop: '12px' } },
            h('h3', `Desglose de ${row.sku}`),
            h('p.muted.small', 'El SKU no se asigna a un solo departamento. Cada área conserva su consumo.'),
            dataTable({
              columns: [
                { key: 'name', label: 'Departamento' },
                { key: 'units', label: 'Unidades', align: 'right', render: (v) => fmtInt(v) },
                { key: 'movements', label: 'Movimientos', align: 'right', render: (v) => fmtInt(v) },
                { key: 'pct', label: 'Sobre el SKU', align: 'right', render: (v) => fmtPct(v) },
              ],
              rows: row.departments,
            }),
            h('button.btn', { type: 'button', style: { marginTop: '8px' }, onClick: () => ctx.navigate(`/producto/${row.sku}`) }, 'Ver ficha del producto'),
          );
        })() : h('p.muted.small', 'Pulse un producto para ver el desglose por departamento.'),
      ),
    );
  }

  return { render };
}
