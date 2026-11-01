import { APP } from '../config.js';
import { fmtDate } from '../core/format.js';

/** Abre una vista limpia lista para «Guardar como PDF» del navegador. */
export function printReport(report, html) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!win) return false;
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  body { font: 13px/1.5 "Segoe UI", system-ui, sans-serif; color: #1a2433; margin: 18mm; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 18px 0 8px; }
  .meta, .demo { color: #5c6b7a; font-size: 12px; }
  .demo { background: #fff7ed; border: 1px solid #f6d7b0; padding: 8px 10px; margin: 10px 0 16px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { border: 1px solid #d5dde6; padding: 8px; border-radius: 6px; }
  .kpi b { display: block; font-size: 18px; }
  .kpi.is-critico { border-color: #f3b4b1; background: #fee4e2; color: #b42318; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #d5dde6; text-align: left; padding: 5px 6px; vertical-align: top; }
  th { background: #f4f6f8; }
  .exec { font-size: 14px; }
  ul { padding-left: 18px; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body>
<p class="noprint"><button onclick="window.print()">Guardar como PDF / Imprimir</button></p>
<h1>${escapeHtml(report.title)}</h1>
<p class="meta">${escapeHtml(APP.name)} · ${escapeHtml(report.generatedLabel)} · ${escapeHtml(report.periodLabel || '')} · Vista ${report.level}</p>
<p class="demo">${escapeHtml(report.demo)}</p>
${html}
</body></html>`);
  win.document.close();
  return true;
}

export function reportToPrintHtml(report) {
  const kpi = (report.kpis || []).map((k) => `<div class="kpi${k.tone ? ` is-${escapeHtml(k.tone)}` : ''}"><span>${escapeHtml(k.label)}</span><b>${escapeHtml(k.value)}</b><div class="meta">${escapeHtml(k.hint || '')}</div></div>`).join('');
  const sections = (report.sections || []).map((sec) => {
    const paras = (sec.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    const table = sec.table ? tableHtml(sec.table) : '';
    return `<h2>${escapeHtml(sec.title)}</h2>${paras}${table}`;
  }).join('');
  const list = (title, items) => items?.length ? `<h2>${title}</h2><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';
  return `
    <p class="exec">${escapeHtml(report.executiveSummary)}</p>
    <div class="kpis">${kpi}</div>
    ${sections}
    ${list('Conclusiones', report.conclusions)}
    ${list('Acciones recomendadas', report.recommendations)}
    <p class="meta">Generado el ${escapeHtml(fmtDate(report.generatedAt))}. ${escapeHtml((report.footnotes || []).join(' '))}</p>
  `;
}

function tableHtml(table) {
  const head = table.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = table.rows.map((row) => `<tr>${table.columns.map((c) => {
    const raw = c.format ? c.format(row[c.key], row) : row[c.key];
    return `<td>${escapeHtml(raw)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
