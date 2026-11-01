import { replace, h } from '../../core/dom.js';
import { PERIOD_PRESETS } from '../../core/dates.js';
import { ceilUnits, fmtDays, fmtInt, fmtMoney, fmtPct, fmtUnits } from '../../core/format.js';
import { barChart, compareBarChart, donutChart, groupedBarChart, lineChart } from '../charts/svgCharts.js';
import { dataTable, field, kpiCard, pageHeader, select, stockNum } from '../components/common.js';

function legendBox(title, items) {
  return h('div.legend-box',
    h('h3', title),
    h('ul', items.map((item) => h('li',
      item.color ? h('i.swatch', { style: { background: item.color } }) : null,
      item.text,
    ))),
  );
}

export function createDashboardView(ctx) {
  const ui = {
    open: null,
    pick: null,
    rank: { periodId: 'mes_actual', from: '', to: '', departmentId: '', open: null },
    match: null,
    routeToken: '',
    scrolledRank: false,
  };

  function toggle(id, container) {
    ui.open = ui.open === id ? null : id;
    render(container);
    if (ui.open) {
      requestAnimationFrame(() => {
        container.querySelector(`#grafico-${ui.open}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function selectGroup(kind, key, label, container) {
    if (ui.pick?.kind === kind && ui.pick.key === key) ui.pick = null;
    else ui.pick = { kind, key, label };
    render(container);
    if (ui.pick) {
      requestAnimationFrame(() => {
        container.querySelector('#sku-pick')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function skuPickPanel(skus, title, qtyQuery) {
    return h('div.sku-pick#sku-pick',
      h('div.sku-pick-head',
        h('h3', title),
        h('button.btn.btn-tiny', {
          type: 'button',
          title: 'Ver cantidades en inventario',
          onClick: () => ctx.navigate('/inventario', qtyQuery),
        }, 'Ver cantidades'),
      ),
      skus.length
        ? h('ul.sku-list', skus.map((sku) => h('li',
          h('button.sku-chip', {
            type: 'button',
            onClick: () => ctx.navigate(`/producto/${sku}`),
          }, sku),
        )))
        : h('p.muted.small', 'No hay SKU en este grupo.'),
    );
  }

  function render(container, match = ui.match) {
    if (match) ui.match = match;
    const routeToken = JSON.stringify(match?.query || {});
    if (routeToken !== ui.routeToken) {
      ui.routeToken = routeToken;
      ui.scrolledRank = false;
      if (match?.query?.departamento) ui.rank.departmentId = match.query.departamento;
      if (match?.query?.seccion === 'ranking') ui.open = 'ranking';
    }
    const alerts = ctx.inventory.alerts();
    const kpis = ctx.inventory.kpis(alerts);
    const monthly = ctx.inventory.monthlySeries(6);
    const period = ctx.inventory.period('mes_actual');
    const rankPeriod = ctx.inventory.period(ui.rank.periodId, { from: ui.rank.from, to: ui.rank.to });
    const rankData = ctx.inventory.ranking({ period: rankPeriod, departmentId: ui.rank.departmentId || null });
    const st = ctx.store.getState();
    const depts = ctx.inventory.departmentTotals(period);
    const deptMonth = ctx.inventory.departmentMonthly(6);
    const byCategory = ctx.inventory.valueByCategory();
    const occ = ctx.inventory.occupancy();
    const risk = alerts.filter((a) => a.atRisk);
    const below = alerts.filter((a) => a.level === 'atencion');
    const empty = alerts.filter((a) => a.level === 'critico');
    const stockouts = ctx.inventory.stockouts(180);
    const emptyDays = new Map(stockouts.filter((r) => r.currentlyOut).map((r) => [r.sku, r]));
    const open = (id) => ui.open === id;
    const click = (id) => () => toggle(id, container);

    replace(container,
      pageHeader(
        'Dashboard de bodega',
        'Alertas, movimientos y ranking de salidas en una sola pantalla. Toque una barra de familia o departamento para ver sus SKU.',
      ),

      h('section.card.dash-block',
        h('h2', 'Catálogo y existencias'),
        h('div.grid.kpis.kpis-2',
          kpiCard({
            label: 'SKU registrados',
            value: fmtInt(kpis.totalSkus),
            hint: 'Productos activos',
            hasChart: true,
            open: open('skus'),
            onClick: click('skus'),
          }),
          kpiCard({
            label: 'Unidades disponibles',
            value: fmtInt(kpis.availableUnits),
            hint: `De ${fmtInt(kpis.totalUnits)} en bodega`,
            hasChart: true,
            open: open('unidades'),
            onClick: click('unidades'),
          }),
        ),
        h('div.dash-reveal', { id: 'grafico-skus', class: open('skus') ? 'is-open' : '', hidden: !open('skus') },
          barChart('Productos activos por categoría', byCategory.map((c) => ({
            label: c.category,
            value: c.skus,
            selected: ui.pick?.kind === 'category' && ui.pick.key === c.category,
          })), {
            maxItems: 12,
            onSelect: (item) => selectGroup('category', item.label, item.label, container),
          }),
          ui.pick?.kind === 'category' ? skuPickPanel(
            ctx.inventory.inventoryRows({ category: ui.pick.key }).map((r) => r.sku),
            `SKU de ${ui.pick.label}`,
            { categoria: ui.pick.key },
          ) : null,
          legendBox('Cómo leer este gráfico', [
            { text: `El número ${fmtInt(kpis.totalSkus)} es la cantidad de códigos SKU activos, no de cajas ni de unidades.` },
            { text: 'Toque una familia para ver sus códigos SKU. El botón chico abre las cantidades en inventario.' },
            { text: 'Un SKU es un artículo del catálogo (por ejemplo, “Guantes de nitrilo talla M”). Varias unidades del mismo artículo cuentan como un solo SKU.' },
          ]),
        ),
        h('div.dash-reveal', { id: 'grafico-unidades', class: open('unidades') ? 'is-open' : '', hidden: !open('unidades') },
          barChart('Unidades físicas por categoría', byCategory.map((c) => ({
            label: c.category,
            value: c.units,
            selected: ui.pick?.kind === 'category' && ui.pick.key === c.category,
          })), {
            maxItems: 12,
            onSelect: (item) => selectGroup('category', item.label, item.label, container),
          }),
          ui.pick?.kind === 'category' ? skuPickPanel(
            ctx.inventory.inventoryRows({ category: ui.pick.key }).map((r) => r.sku),
            `SKU de ${ui.pick.label}`,
            { categoria: ui.pick.key },
          ) : null,
          legendBox('Cómo leer este gráfico', [
            { text: `Hay ${fmtInt(kpis.availableUnits)} unidades listas para retirar (ya se descontó lo reservado). En bodega hay ${fmtInt(kpis.totalUnits)} unidades en total.` },
            { text: 'Toque una familia para listar sus SKU. Las cantidades de cada uno se ven con el botón chico.' },
            { text: `Valor referencial del inventario (cifras ficticias): ${fmtMoney(kpis.inventoryValue)}.` },
          ]),
        ),
      ),

      h('section.card.dash-block',
        h('h2', 'Alertas de inventario'),
        h('div.grid.kpis.kpis-3',
          kpiCard({
            label: 'Sin existencias',
            value: fmtInt(kpis.outOfStock),
            hint: kpis.outOfStock ? 'No quedó ninguna unidad' : 'Ningún SKU en cero',
            tone: kpis.outOfStock ? 'critico' : null,
            hasChart: true,
            open: open('critico'),
            onClick: click('critico'),
          }),
          kpiCard({
            label: 'Bajo stock mínimo',
            value: fmtInt(kpis.belowMin),
            tone: kpis.belowMin ? 'atencion' : null,
            hasChart: true,
            open: open('atencion'),
            onClick: click('atencion'),
          }),
          kpiCard({
            label: 'Riesgo de quiebre',
            value: fmtInt(kpis.atRisk),
            tone: kpis.atRisk ? 'precaucion' : null,
            hasChart: true,
            open: open('riesgo'),
            onClick: click('riesgo'),
          }),
        ),
        h('div.dash-reveal', { id: 'grafico-critico', class: open('critico') ? 'is-open' : '', hidden: !open('critico') },
          compareBarChart('Nada en bodega frente al mínimo', empty.map((a) => ({
            label: a.sku,
            actual: a.total,
            target: a.minStock,
            hint: `${a.name}. No quedó ninguna unidad. El mínimo es ${fmtInt(a.minStock)} ${a.unit}.`,
            actualText: '0',
            targetText: `${fmtInt(a.minStock)} mín.`,
          })), {
            actualLabel: 'En bodega (ninguna)',
            targetLabel: 'Stock mínimo',
            actualColor: '#b42318',
            targetColor: '#2b6cb0',
            maxItems: 12,
          }),
          dataTable({
            empty: 'Ningún SKU está sin existencias.',
            onRowClick: (row) => ctx.navigate(`/producto/${row.sku}`),
            columns: [
              { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
              { key: 'name', label: 'Producto' },
              { key: 'total', label: 'En bodega', align: 'right', render: (v) => stockNum(v, fmtInt(v)) },
              { key: 'minStock', label: 'Mínimo', align: 'right', render: (v) => fmtInt(v) },
              { key: 'days', label: 'Días en cero', align: 'right', render: (v) => (v ? fmtDays(v) : '—') },
            ],
            rows: empty.map((a) => ({ ...a, days: emptyDays.get(a.sku)?.days || 0 })),
          }),
          legendBox('Cómo se lee', [
            { color: '#b42318', text: `Rojo: no quedó ninguno. El número del indicador (${fmtInt(kpis.outOfStock)}) son esos SKU.` },
            { color: '#2b6cb0', text: 'Azul: stock mínimo que debería haber. La barra roja no aparece porque el stock es 0.' },
            { text: empty.length
              ? `Hoy en cero: ${empty.map((a) => a.sku).join(', ')}.`
              : 'Hoy no hay SKU sin existencias.' },
          ]),
        ),
        h('div.dash-reveal', { id: 'grafico-atencion', class: open('atencion') ? 'is-open' : '', hidden: !open('atencion') },
          compareBarChart('Stock disponible frente al mínimo', below.map((a) => ({
            label: a.sku,
            actual: a.available,
            target: a.minStock,
            hint: `${a.name}. Disponible ${fmtInt(a.available)} ${a.unit} < mínimo ${fmtInt(a.minStock)} ${a.unit}. Faltan ${fmtInt(Math.max(0, a.minStock - a.available))} ${a.unit}.`,
            actualText: `${fmtInt(a.available)} disp.`,
            targetText: `${fmtInt(a.minStock)} mín.`,
          })), {
            actualLabel: 'Stock disponible (actual)',
            targetLabel: 'Stock mínimo',
            actualColor: '#c05621',
            targetColor: '#2b6cb0',
            maxItems: 10,
          }),
          dataTable({
            empty: 'Ningún SKU está bajo el mínimo.',
            onRowClick: (row) => ctx.navigate(`/producto/${row.sku}`),
            columns: [
              { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
              { key: 'name', label: 'Producto' },
              { key: 'available', label: 'Disponible', align: 'right', render: (v) => fmtInt(v) },
              { key: 'minStock', label: 'Mínimo', align: 'right', render: (v) => fmtInt(v) },
              { key: 'gap', label: 'Faltan al mínimo', align: 'right', render: (v) => fmtInt(v) },
            ],
            rows: below.map((a) => ({ ...a, gap: Math.max(0, a.minStock - a.available) })),
          }),
        ),
        h('div.dash-reveal', { id: 'grafico-riesgo', class: open('riesgo') ? 'is-open' : '', hidden: !open('riesgo') },
          compareBarChart('Disponible frente a la demanda del plazo', risk.map((a) => {
            const need = ceilUnits(a.avgDaily * a.leadTimeDays);
            return {
              label: a.sku,
              actual: a.available,
              target: need,
              hint: `${a.name}. Disponible ${fmtInt(a.available)} ${a.unit} < ${fmtUnits(a.avgDaily)} ${a.unit}/día × ${fmtInt(a.leadTimeDays)} días → ${fmtUnits(need)} ${a.unit}. Cobertura ${fmtDays(a.coverageDays)}.`,
              actualText: `${fmtInt(a.available)} disp.`,
              targetText: `${fmtUnits(need)} necesarios`,
            };
          }), {
            actualLabel: 'Stock disponible (actual)',
            targetLabel: 'Consumo diario × plazo proveedor',
            actualColor: '#b7791f',
            targetColor: '#2b6cb0',
            maxItems: 10,
          }),
          dataTable({
            empty: 'Ningún SKU tiene riesgo de quiebre por cobertura.',
            onRowClick: (row) => ctx.navigate(`/producto/${row.sku}`),
            columns: [
              { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
              { key: 'available', label: 'Disponible', align: 'right', render: (v) => fmtInt(v) },
              { key: 'avgDaily', label: 'Consumo/día', align: 'right', render: (v) => fmtUnits(v) },
              { key: 'leadTimeDays', label: 'Plazo (días)', align: 'right', render: (v) => fmtInt(v) },
              { key: 'need', label: 'Necesario', align: 'right', render: (v) => fmtUnits(v) },
              { key: 'gap', label: 'Faltan', align: 'right', render: (v) => fmtUnits(v) },
              { key: 'coverageDays', label: 'Cobertura', align: 'right', render: (v) => fmtDays(v) },
            ],
            rows: risk.map((a) => {
              const need = ceilUnits(a.avgDaily * a.leadTimeDays);
              return { ...a, need, gap: Math.max(0, need - a.available) };
            }),
          }),
          legendBox('Cómo se calcula', [
            { color: '#b7791f', text: 'Amarillo: stock disponible ahora. Todavía hay unidades; no está agotado.' },
            { color: '#2b6cb0', text: 'Azul: unidades que se van a consumir mientras llega el proveedor (consumo diario × plazo).' },
            { text: 'Hay riesgo cuando la barra amarilla es más corta que la azul: el stock se acaba antes de la entrega. Eso es lo mismo que cobertura < plazo.' },
            { text: 'Este gráfico no usa el stock mínimo. El mínimo es el indicador de al lado. Aquí el umbral es la demanda del plazo.' },
          ]),
        ),
      ),

      h('section.card.dash-block#ranking-salidas',
        h('h2', 'Movimientos del mes'),
        h('div.grid.kpis.kpis-3',
          kpiCard({
            label: 'Salidas del mes',
            value: fmtInt(kpis.monthExitUnits),
            hint: `${fmtInt(kpis.monthExitMoves)} movimientos`,
            hasChart: true,
            open: open('salidas'),
            onClick: click('salidas'),
          }),
          kpiCard({
            label: 'Entradas del mes',
            value: fmtInt(kpis.monthEntryUnits),
            hint: `${fmtInt(kpis.monthEntryMoves)} movimientos`,
            hasChart: true,
            open: open('entradas'),
            onClick: click('entradas'),
          }),
          kpiCard({
            label: 'Ranking de salidas',
            value: rankData.rows[0]?.sku || '—',
            hint: rankData.rows[0]
              ? `1° · ${fmtInt(rankData.rows[0].units)} un. · ${fmtInt(rankData.rows.length)} SKU`
              : 'Sin salidas en el período',
            hasChart: true,
            open: open('ranking'),
            onClick: click('ranking'),
          }),
        ),
        h('div.dash-reveal', { id: 'grafico-salidas', class: open('salidas') ? 'is-open' : '', hidden: !open('salidas') },
          lineChart('Evolución mensual de entradas y salidas', monthly.map((m) => ({ label: m.label })), {
            series: [
              { label: 'Salidas', values: monthly.map((m) => m.salidas), color: '#c05621' },
              { label: 'Entradas', values: monthly.map((m) => m.entradas), color: '#2b6cb0' },
            ],
          }),
          legendBox('Cómo leer este gráfico', [
            { color: '#c05621', text: `La línea naranja es lo que se retiró. El número ${fmtInt(kpis.monthExitUnits)} son unidades del mes actual, no movimientos.` },
            { color: '#2b6cb0', text: 'La línea azul es lo que ingresó a bodega (recepciones).' },
            { text: `Hubo ${fmtInt(kpis.monthExitMoves)} retiros. Un retiro de 50 cajas cuenta como 1 movimiento y 50 unidades.` },
            { text: 'El detalle por SKU está en Ranking de salidas, al lado. Toque ese recuadro para abrirlo. Las devoluciones no se suman.' },
          ]),
        ),
        h('div.dash-reveal', { id: 'grafico-entradas', class: open('entradas') ? 'is-open' : '', hidden: !open('entradas') },
          lineChart('Evolución mensual de entradas y salidas', monthly.map((m) => ({ label: m.label })), {
            series: [
              { label: 'Entradas', values: monthly.map((m) => m.entradas), color: '#2b6cb0' },
              { label: 'Salidas', values: monthly.map((m) => m.salidas), color: '#c05621' },
            ],
          }),
          legendBox('Cómo leer este gráfico', [
            { color: '#2b6cb0', text: `La línea azul es lo recibido. El número ${fmtInt(kpis.monthEntryUnits)} son unidades ingresadas este mes.` },
            { color: '#c05621', text: 'La línea naranja es lo retirado, para comparar si la bodega se está reponiendo o vaciando.' },
            { text: `Se registraron ${fmtInt(kpis.monthEntryMoves)} recepciones. El mes anterior ingresaron ${fmtInt(kpis.prevMonthEntryUnits)} unidades.` },
          ]),
        ),
        h('div.dash-reveal', { id: 'grafico-ranking', class: open('ranking') ? 'is-open' : '', hidden: !open('ranking') },
          h('p.muted.small', 'Unidades retiradas del período. Si un SKU lo pidieron varias áreas, el desglose queda en la fila. Las devoluciones no cuentan.'),
          h('div.filters',
            field({
              label: 'Período',
              children: select({
                value: ui.rank.periodId,
                onChange: (e) => { ui.rank.periodId = e.target.value; render(container, match); },
              }, PERIOD_PRESETS.map((p) => ({ value: p.id, label: p.label }))),
            }),
            ui.rank.periodId === 'personalizado' ? field({
              label: 'Desde',
              children: h('input', { type: 'date', value: ui.rank.from || '', onChange: (e) => { ui.rank.from = e.target.value; render(container, match); } }),
            }) : null,
            ui.rank.periodId === 'personalizado' ? field({
              label: 'Hasta',
              children: h('input', { type: 'date', value: ui.rank.to || '', onChange: (e) => { ui.rank.to = e.target.value; render(container, match); } }),
            }) : null,
            field({
              label: 'Departamento',
              children: select({
                value: ui.rank.departmentId,
                onChange: (e) => { ui.rank.departmentId = e.target.value; render(container, match); },
              }, [{ value: '', label: 'Todos los departamentos' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
            }),
          ),
          !rankPeriod.valid ? h('p.err', rankPeriod.error) : h('p',
            `${rankPeriod.label}. Retiradas: ${fmtInt(rankData.totalUnits)} un. · ${fmtInt(rankData.totalMovements)} movimientos. Devoluciones (no suman): ${fmtInt(rankData.returnsUnits)}.`,
          ),
          h('div.grid.charts',
            barChart('Unidades retiradas', rankData.rows.slice(0, 10).map((r) => ({
              label: r.sku,
              value: r.units,
              hint: r.name,
              selected: ui.rank.open === r.sku,
            })), {
              maxItems: 10,
              onSelect: (item) => {
                ui.rank.open = ui.rank.open === item.label ? null : item.label;
                render(container, match);
              },
            }),
            barChart('Participación por departamento', rankData.departments.map((d) => ({
              label: d.name,
              value: d.units,
              id: d.departmentId,
              selected: ui.rank.departmentId === d.departmentId,
            })), {
              onSelect: (item) => {
                ui.rank.departmentId = ui.rank.departmentId === item.id ? '' : item.id;
                render(container, match);
              },
            }),
          ),
          dataTable({
            empty: 'No hubo salidas en el período seleccionado.',
            selectedKey: ui.rank.open,
            rowKey: (row) => row.sku,
            onRowClick: (row) => { ui.rank.open = ui.rank.open === row.sku ? null : row.sku; render(container, match); },
            columns: [
              { key: 'position', label: 'Puesto', align: 'right' },
              { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
              { key: 'name', label: 'Producto' },
              { key: 'departmentLabel', label: 'Departamento' },
              { key: 'units', label: 'Unidades', align: 'right', render: (v) => fmtInt(v) },
              { key: 'share', label: 'Participación', align: 'right', render: (v) => fmtPct(v) },
              { key: 'movements', label: 'Movimientos', align: 'right', render: (v) => fmtInt(v) },
            ],
            rows: rankData.rows,
          }),
          ui.rank.open ? (() => {
            const row = rankData.rows.find((r) => r.sku === ui.rank.open);
            if (!row) return null;
            return h('div', { style: { marginTop: '12px' } },
              h('h3', `Desglose de ${row.sku}`),
              h('p.muted.small', 'Cada área conserva su consumo; el SKU no se asigna a un solo departamento.'),
              dataTable({
                columns: [
                  { key: 'name', label: 'Departamento' },
                  { key: 'units', label: 'Unidades', align: 'right', render: (v) => fmtInt(v) },
                  { key: 'movements', label: 'Movimientos', align: 'right', render: (v) => fmtInt(v) },
                  { key: 'pct', label: 'Sobre el SKU', align: 'right', render: (v) => fmtPct(v) },
                ],
                rows: row.departments,
              }),
              h('div.btn-row',
                h('button.btn', { type: 'button', onClick: () => ctx.navigate(`/producto/${row.sku}`) }, 'Ver ficha del producto'),
              ),
            );
          })() : h('p.muted.small', 'Pulse un producto para ver el desglose por departamento.'),
        ),
      ),

      h('section.card.dash-block',
        h('h2', 'Departamentos y ocupación'),
        h('div.grid.kpis.kpis-2',
          kpiCard({
            label: 'Áreas que retiraron este mes',
            value: fmtInt(depts.filter((d) => d.units > 0).length),
            hint: depts[0] ? `Mayor consumo: ${depts[0].name}` : 'Sin retiros',
            hasChart: true,
            open: open('departamentos'),
            onClick: click('departamentos'),
          }),
          kpiCard({
            label: 'Ocupación de ubicaciones',
            value: fmtPct(kpis.occupancyPct),
            hint: `${fmtInt(kpis.occupiedLocations)} de ${fmtInt(kpis.totalLocations)} · Pareto: abra un SKU en inventario`,
            hasChart: true,
            open: open('ocupacion'),
            onClick: click('ocupacion'),
          }),
        ),
        h('div.dash-reveal', { id: 'grafico-departamentos', class: open('departamentos') ? 'is-open' : '', hidden: !open('departamentos') },
          barChart('Salidas acumuladas por departamento (mes actual)', depts.map((d) => ({
            label: d.name,
            value: d.units,
            id: d.departmentId,
            selected: ui.pick?.kind === 'department' && ui.pick.key === d.departmentId,
          })), {
            maxItems: 12,
            onSelect: (item) => selectGroup('department', item.id, item.label, container),
          }),
          groupedBarChart('Comparación del consumo entre departamentos', deptMonth.months, deptMonth.departments.slice(0, 5).map((d) => ({
            label: d.name,
            values: d.values,
            id: d.departmentId,
            selected: ui.pick?.kind === 'department' && ui.pick.key === d.departmentId,
          })), {
            onSelect: (ser) => selectGroup('department', ser.id, ser.label, container),
          }),
          ui.pick?.kind === 'department' ? skuPickPanel(
            (() => {
              const withdrawn = ctx.inventory.ranking({ period, departmentId: ui.pick.key }).rows.map((r) => r.sku);
              return withdrawn.length
                ? withdrawn
                : ctx.inventory.inventoryRows({ departmentId: ui.pick.key }).map((r) => r.sku);
            })(),
            `SKU de ${ui.pick.label}`,
            { departamento: ui.pick.key },
          ) : null,
          legendBox('Cómo leer estos gráficos', [
            { text: 'Toque un departamento para ver los SKU que le corresponden. El botón chico abre las cantidades.' },
            { text: 'El segundo gráfico compara los últimos meses: cada grupo de barras es un mes y cada color es un departamento.' },
            { text: 'Un SKU pedido por varias áreas no se asigna a una sola: cada departamento conserva su parte.' },
          ]),
        ),
        h('div.dash-reveal', { id: 'grafico-ocupacion', class: open('ocupacion') ? 'is-open' : '', hidden: !open('ocupacion') },
          donutChart('Ubicaciones de la bodega', [
            { label: 'Ocupadas', hint: 'Hay al menos un SKU', value: occ.occupied, tone: 'atencion' },
            { label: 'Libres', hint: 'Sin existencias', value: occ.free, tone: 'normal' },
          ], { centerCaption: 'posiciones' }),
          legendBox('Cómo leer este gráfico', [
            { color: '#c05621', text: `Ocupada: hay al menos un SKU. ${fmtInt(occ.occupied)} de ${fmtInt(occ.total)} posiciones (${fmtPct(occ.pct)}).` },
            { color: '#276749', text: `Libre: sin existencias. ${fmtInt(occ.free)} posiciones disponibles para una recepción.` },
            { text: `El uso de capacidad (unidades respecto del máximo referencial) es ${fmtPct(occ.capacityPct)}. No es lo mismo que el porcentaje de ubicaciones ocupadas.` },
            { text: 'El Pareto (clases A/B/C) no se grafica aquí: en Inventario se muestra al abrir un SKU, pintado sobre las ubicaciones de ese producto.' },
          ]),
          h('div.btn-row',
            h('button.btn', { type: 'button', onClick: () => ctx.navigate('/inventario') }, 'Abrir inventario y elegir un SKU'),
          ),
        ),
      ),
    );
    if (match?.query?.seccion === 'ranking' && !ui.scrolledRank) {
      ui.scrolledRank = true;
      requestAnimationFrame(() => {
        container.querySelector('#grafico-ranking')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  return { render };
}
