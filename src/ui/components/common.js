import { debounce, h } from '../../core/dom.js';
import { PERIOD_PRESETS } from '../../core/dates.js';
import { normalizeText } from '../../core/format.js';

export function pageHeader(title, lead, actions) {
  return h('header.page-head',
    h('div', h('h1', title), lead ? h('p', lead) : null),
    actions ? h('div.actions.no-print', actions) : null,
  );
}

export function kpiCard({ label, value, hint, tone, onClick, hasChart = false, open = false }) {
  const cls = ['kpi', tone ? `is-${tone}` : '', onClick ? 'is-link' : '', hasChart ? 'is-chart' : '', open ? 'is-open' : '']
    .filter(Boolean).join(' ');
  const chartHint = hasChart
    ? (open ? 'Toque el número otra vez para cerrar el gráfico.' : 'Toque el número para abrir el gráfico y la leyenda.')
    : '';
  const action = [hint, chartHint].filter(Boolean).join(' ');
  const body = [
    h('div.label', label),
    h('div.value', value, hasChart ? h('span.kpi-caret', { 'aria-hidden': 'true' }, open ? '▴' : '▾') : null),
    action ? h('div.hint', action) : null,
  ];
  if (onClick) {
    return h(`button.${cls.replace(/\s+/g, '.')}`, {
      type: 'button',
      onClick,
      'aria-expanded': hasChart ? String(open) : undefined,
    }, body);
  }
  return h(`div.${cls.replace(/\s+/g, '.')}`, body);
}

export function badge(level, label) {
  return h(`span.badge.badge-${level}`, h('i.dot'), label);
}

/** Cero de existencias: siempre en rojo. Si queda algo, número normal. */
export function stockNum(n, text) {
  const label = text ?? String(n);
  return n <= 0 ? h('b.num-empty', label) : label;
}

export function abcBadge(cls) {
  return h(`span.badge.badge-abc-${cls}`, `Clase ${cls}`);
}

export function field({ label, error, hint, className = '', children }) {
  return h(`div.field${error ? '.is-error' : ''}${className ? `.${className}` : ''}`,
    label ? h('label', label) : null,
    children,
    error ? h('div.err', error) : null,
    !error && hint ? h('p.muted.small', hint) : null,
  );
}

export function input(props) {
  return h('input', { type: 'text', ...props });
}

export function select(props, options) {
  return h('select', props, options.map((o) => h('option', { value: o.value, selected: o.value === props.value }, o.label)));
}

export function emptyState(text) {
  return h('div.empty', text);
}

export function tabs(items, current, onChange) {
  return h('div.tabs.no-print', items.map((item) => h('button.tab', {
    type: 'button',
    class: item.id === current ? 'is-on' : '',
    onClick: () => onChange(item.id),
  }, item.label)));
}

export function periodFilter(ui, onChange) {
  return h('div.filters',
    field({
      label: 'Período',
      children: select({
        value: ui.periodId,
        onChange: (e) => { ui.periodId = e.target.value; onChange(); },
      }, PERIOD_PRESETS.map((p) => ({ value: p.id, label: p.label }))),
    }),
    ui.periodId === 'personalizado' ? field({
      label: 'Desde',
      children: input({ type: 'date', value: ui.from || '', onChange: (e) => { ui.from = e.target.value; onChange(); } }),
    }) : null,
    ui.periodId === 'personalizado' ? field({
      label: 'Hasta',
      children: input({ type: 'date', value: ui.to || '', onChange: (e) => { ui.to = e.target.value; onChange(); } }),
    }) : null,
  );
}

export function pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pages);
  return h('div.pager',
    `${(safe - 1) * pageSize + (total ? 1 : 0)}–${Math.min(safe * pageSize, total)} de ${total}`,
    h('button.btn', { type: 'button', disabled: safe <= 1, onClick: () => onPage(safe - 1) }, 'Anterior'),
    h('button.btn', { type: 'button', disabled: safe >= pages, onClick: () => onPage(safe + 1) }, 'Siguiente'),
  );
}

/**
 * Tabla con ordenación, clic en fila y estado vacío. El texto se inserta como nodos, no como HTML.
 */
export function dataTable({ columns, rows, rowKey, onRowClick, empty = 'No hay registros para mostrar.', sort, onSort, selectedKey }) {
  if (!rows.length) return emptyState(empty);
  const th = columns.map((col) => {
    const cls = col.align === 'right' ? 'num' : '';
    if (!col.sort || !onSort) return h('th', { class: cls }, col.label);
    const active = sort?.key === col.key;
    return h('th', {
      class: cls,
      style: { cursor: 'pointer' },
      onClick: () => onSort(col.key),
    }, `${col.label}${active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}`);
  });
  const body = rows.map((row, i) => {
    const key = rowKey ? rowKey(row, i) : i;
    return h('tr', {
      class: [onRowClick ? 'is-click' : '', selectedKey === key ? 'is-on' : ''].filter(Boolean).join(' '),
      onClick: onRowClick ? () => onRowClick(row) : undefined,
    }, columns.map((col) => {
      const raw = col.render ? col.render(row[col.key], row) : row[col.key];
      const content = raw === undefined || raw === null || raw === '' ? '—' : raw;
      return h('td', { class: col.align === 'right' ? 'num' : '' }, content);
    }));
  });
  return h('div.table-wrap', h('table.data', h('thead', h('tr', th)), h('tbody', body)));
}

export function productPicker({ products, value, onChange, error }) {
  const box = h('div.picker');
  const fieldEl = input({
    value: value || '',
    placeholder: 'Buscar por SKU o nombre',
    autocomplete: 'off',
    onInput: debounce((e) => drawList(e.target.value), 80),
    onFocus: (e) => drawList(e.target.value),
  });
  const list = h('div.picker-list', { hidden: true });
  function drawList(q) {
    const needle = normalizeText(q);
    const hits = products.filter((p) => !needle || normalizeText(`${p.sku} ${p.name}`).includes(needle)).slice(0, 12);
    list.replaceChildren();
    if (!hits.length) {
      list.hidden = true;
      return;
    }
    hits.forEach((p) => {
      list.appendChild(h('button.picker-item', {
        type: 'button',
        onClick: () => {
          fieldEl.value = p.sku;
          list.hidden = true;
          onChange(p);
        },
      }, `${p.sku} · ${p.name}`));
    });
    list.hidden = false;
  }
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) list.hidden = true;
  }, { once: false });
  box.append(field({ label: 'Producto (SKU)', error, children: [fieldEl, list] }));
  return { node: box, input: fieldEl };
}

export function sortRows(rows, sort, getters = {}) {
  if (!sort?.key) return rows;
  const get = getters[sort.key] || ((row) => row[sort.key]);
  const copy = rows.slice();
  copy.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const na = typeof va === 'number';
    const nb = typeof vb === 'number';
    let cmp = 0;
    if (na && nb) cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true });
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  return copy;
}

export function toggleSort(current, key) {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'desc' };
}
