import { h, replace } from '../../core/dom.js';
import { fmtInt } from '../../core/format.js';
import { REPORT_TYPES } from '../../services/reportService.js';
import { ABC_CRITERIA } from '../../domain/abc.js';
import { MOVEMENT_LABELS, MOVEMENT_ORDER } from '../../data/schema.js';
import { renderChart } from '../charts/svgCharts.js';
import { dataTable, field, input, pageHeader, periodFilter, select, tabs } from '../components/common.js';
import { printReport, reportToPrintHtml } from '../print.js';

function tableFrom(section) {
  if (!section?.table) return null;
  return dataTable({
    columns: section.table.columns.map((c) => ({
      ...c,
      render: c.format ? (v, row) => c.format(v, row) : undefined,
      align: /cantidad|unidad|stock|mín|min|puesto|n°|particip|suger|plazo|cobertura|disponible|total/i.test(c.label) ? 'right' : undefined,
    })),
    rows: section.table.rows,
    empty: 'Sin filas en esta sección.',
  });
}

export function createReportsView(ctx) {
  const ui = {
    type: 'inventario',
    level: 'resumido',
    periodId: 'mes_actual',
    from: '',
    to: '',
    compareId: 'mes_anterior',
    departmentId: '',
    criterion: '',
    movementType: '',
    sku: '',
    granularity: 'semana',
  };

  function current() {
    return ctx.reports.build(ui.type, {
      level: ui.level,
      periodId: ui.periodId,
      custom: { from: ui.from, to: ui.to },
      compareId: ui.compareId,
      departmentId: ui.departmentId || null,
      criterion: ui.criterion || null,
      movementType: ui.movementType || null,
      sku: ui.sku || null,
      granularity: ui.granularity,
    });
  }

  function exportTables(report, kind) {
    const sheets = (report.sections || []).filter((s) => s.table).map((s, i) => ({
      name: (s.title || `Hoja${i + 1}`).slice(0, 31),
      columns: s.table.columns.map((c) => ({
        key: c.key,
        label: c.label,
        format: c.format ? (v, row) => c.format(v, row) : undefined,
      })),
      rows: s.table.rows,
    }));
    if (!sheets.length) {
      ctx.toast('Este reporte no tiene tablas para exportar.', 'error');
      return;
    }
    if (kind === 'csv') ctx.export.downloadCsv(sheets[0].rows, sheets[0].columns, report.title);
    else ctx.export.downloadXlsx(sheets, report.title);
  }

  function render(container, match) {
    if (match?.query?.tipo && REPORT_TYPES.some((t) => t.id === match.query.tipo)) ui.type = match.query.tipo;
    const meta = REPORT_TYPES.find((t) => t.id === ui.type);
    const st = ctx.store.getState();
    let report;
    try {
      report = current();
    } catch (error) {
      replace(container, h('p.err', String(error.message || error)));
      return;
    }

    replace(container,
      pageHeader(
        'Reportes',
        'Los textos se arman con los datos reales del prototipo. No se inventan cifras. Puede leer primero el resumen y, si lo necesita, el detalle.',
        [
          h('button.btn', { type: 'button', onClick: () => exportTables(report, 'csv') }, 'Excel / CSV (esta hoja)'),
          h('button.btn', { type: 'button', onClick: () => exportTables(report, 'xlsx') }, 'Excel completo'),
          h('button.btn.btn-primary', {
            type: 'button',
            onClick: () => {
              if (!printReport(report, reportToPrintHtml(report))) ctx.toast('El navegador bloqueó la ventana. Permita ventanas emergentes para generar el PDF.', 'error');
            },
          }, 'PDF para presentar'),
        ],
      ),
      h('section.card.no-print',
        h('div.filters',
          field({
            label: 'Tipo de reporte',
            className: 'grow',
            children: select({
              value: ui.type,
              onChange: (e) => { ui.type = e.target.value; render(container, match); },
            }, REPORT_TYPES.map((t) => ({ value: t.id, label: t.label }))),
          }),
          meta?.needsPeriod ? periodFilter(ui, () => render(container, match)) : null,
          ui.type === 'comparacion' ? field({
            label: 'Comparar con',
            children: select({
              value: ui.compareId,
              onChange: (e) => { ui.compareId = e.target.value; render(container, match); },
            }, [
              { value: 'mes_anterior', label: 'Mes anterior' },
              { value: 'ult_3_meses', label: 'Últimos 3 meses' },
              { value: 'anio_actual', label: 'Año actual' },
            ]),
          }) : null,
          ['ranking', 'departamentos', 'salidas', 'evolucion'].includes(ui.type) ? field({
            label: 'Departamento',
            children: select({
              value: ui.departmentId,
              onChange: (e) => { ui.departmentId = e.target.value; render(container, match); },
            }, [{ value: '', label: 'Todos' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
          }) : null,
          ui.type === 'abc' ? field({
            label: 'Criterio ABC',
            children: select({
              value: ui.criterion,
              onChange: (e) => { ui.criterion = e.target.value; render(container, match); },
            }, [{ value: '', label: 'El configurado' }, ...ABC_CRITERIA.map((c) => ({ value: c.id, label: c.label }))]),
          }) : null,
          ui.type === 'historial' ? field({
            label: 'Tipo de movimiento',
            children: select({
              value: ui.movementType,
              onChange: (e) => { ui.movementType = e.target.value; render(container, match); },
            }, [{ value: '', label: 'Todos' }, ...MOVEMENT_ORDER.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))]),
          }) : null,
          ['historial', 'evolucion'].includes(ui.type) ? field({
            label: 'SKU (opcional)',
            children: input({ value: ui.sku, placeholder: 'SKU-001', onInput: (e) => { ui.sku = e.target.value.toUpperCase(); render(container, match); } }),
          }) : null,
        ),
        h('p.muted.small', meta?.hint || ''),
        tabs(
          [{ id: 'resumido', label: 'Reporte resumido' }, { id: 'detallado', label: 'Reporte detallado' }],
          ui.level,
          (id) => { ui.level = id; render(container, match); },
        ),
      ),
      h('article.report',
        h('section.card.report-cover',
          h('h2', report.title),
          h('p.muted', `${report.generatedLabel} · ${report.periodLabel} · Lectura ${report.level === 'detallado' ? 'detallada' : 'resumida'}`),
          h('p.muted.small', report.demo),
          h('p.exec', report.executiveSummary),
        ),
        h('div.grid.kpis', report.kpis.map((k) => h(`div.kpi${k.tone ? `.is-${k.tone}` : ''}`, h('div.label', k.label), h('div.value', k.value), k.hint ? h('div.hint', k.hint) : null))),
        report.charts?.length ? h('div.grid.charts', report.charts.map((c) => h('section.card', renderChart(c)))) : null,
        report.sections.map((sec) => h('section.card',
          h('h2', sec.title),
          (sec.paragraphs || []).map((p) => h('p', p)),
          tableFrom(sec),
        )),
        h('section.card',
          h('h2', 'Conclusiones'),
          h('ul.conclusions', report.conclusions.map((c) => h('li', c))),
          h('h2', 'Acciones recomendadas'),
          h('ul.conclusions', report.recommendations.map((c) => h('li', c))),
          h('p.muted.small', `${fmtInt((report.footnotes || []).length)} notas. ${(report.footnotes || []).join(' ')}`),
        ),
      ),
    );
  }

  return { render };
}
