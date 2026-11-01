// Gráficos SVG propios. Sin librerías. Funcionan sin internet.
import { h, s } from '../../core/dom.js';
import { fmtInt, fmtNum } from '../../core/format.js';

const PALETTE = ['#2b6cb0', '#c05621', '#276749', '#805ad5', '#b7791f', '#2c7a7b', '#9b2c2c', '#2a4365'];
const TONES = { critico: '#b42318', atencion: '#c05621', precaucion: '#b7791f', normal: '#276749' };

function wrap(title, node, legend) {
  return h('div.chart', h('h3', title), node, legend ? h('div.legend', legend) : null);
}

function text(x, y, value, props = {}) {
  return s('text', {
    x, y,
    fill: '#5c6b7a',
    'font-size': '11',
    'font-family': 'Segoe UI, system-ui, sans-serif',
    ...props,
  }, value);
}

/**
 * Compara, por cada SKU, el valor actual con el umbral de la fórmula (mínimo, demanda del plazo, etc.).
 * @param {{label:string, actual:number, target:number, hint?:string, actualText?:string, targetText?:string}[]} items
 */
export function compareBarChart(title, items, {
  maxItems = 8,
  actualLabel = 'Actual',
  targetLabel = 'Umbral',
  actualColor = '#c05621',
  targetColor = '#2b6cb0',
} = {}) {
  const data = (items || []).filter(Boolean).slice(0, maxItems);
  if (!data.length) return wrap(title, h('p.empty', 'No hay datos para este gráfico.'));
  const max = Math.max(1, ...data.flatMap((i) => [Number(i.actual) || 0, Number(i.target) || 0]));
  const rowH = 48;
  const left = 168;
  const width = 680;
  const barH = 12;
  const height = 12 + data.length * rowH;
  const barW = (v) => Math.max(v > 0 ? 3 : 0, ((width - left - 88) * Math.max(0, v)) / max);
  const shortLabel = (label) => (String(label).length > 26 ? `${String(label).slice(0, 25)}…` : label);
  const rows = data.map((item, i) => {
    const y = 8 + i * rowH;
    const actual = Number(item.actual) || 0;
    const target = Number(item.target) || 0;
    const aText = item.actualText || fmtInt(actual);
    const tText = item.targetText || fmtInt(target);
    return [
      text(left - 8, y + 20, shortLabel(item.label), { 'text-anchor': 'end', fill: '#1a2433', 'font-weight': '650' }, s('title', item.hint || item.label)),
      s('rect', { x: left, y, width: barW(actual), height: barH, rx: 3, fill: actualColor }, s('title', `${actualLabel}: ${aText}`)),
      text(left + barW(actual) + 6, y + 10, aText, { fill: actualColor, 'font-size': '10' }),
      s('rect', { x: left, y: y + 18, width: barW(target), height: barH, rx: 3, fill: targetColor }, s('title', `${targetLabel}: ${tText}`)),
      text(left + barW(target) + 6, y + 28, tText, { fill: targetColor, 'font-size': '10' }),
    ];
  });
  const legend = [
    h('span', h('i.swatch', { style: { background: actualColor } }), actualLabel),
    h('span', h('i.swatch', { style: { background: targetColor } }), targetLabel),
  ];
  return wrap(title, s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title }, rows), legend);
}

export function barChart(title, items, { maxItems = 8, onSelect } = {}) {
  const data = items.filter((i) => i && (i.value || i.value === 0)).slice(0, maxItems);
  if (!data.length) return wrap(title, h('p.empty', 'No hay datos para este gráfico.'));
  const max = Math.max(1, ...data.map((i) => i.value));
  const rowH = 28;
  const left = 168;
  const width = 640;
  const height = 20 + data.length * rowH;
  const shortLabel = (label) => (String(label).length > 26 ? `${String(label).slice(0, 25)}…` : label);
  const bars = data.map((item, i) => {
    const y = 10 + i * rowH;
    const w = ((width - left - 56) * item.value) / max;
    const tip = item.hint || (onSelect ? `Ver SKU de ${item.label}` : item.label);
    const kids = [
      s('rect', {
        class: 'chart-hit-bg',
        x: 0,
        y: y - 4,
        width,
        height: 24,
        fill: item.selected ? '#e8f1fa' : 'transparent',
        rx: 4,
      }),
      text(left - 8, y + 12, shortLabel(item.label), { 'text-anchor': 'end' }),
      s('rect', { x: left, y, width: Math.max(2, w), height: 16, rx: 3, fill: item.color || PALETTE[i % PALETTE.length] }, s('title', tip)),
      text(left + w + 6, y + 12, fmtInt(item.value)),
    ];
    if (!onSelect) return kids;
    return s('g', {
      class: item.selected ? 'chart-hit is-on' : 'chart-hit',
      role: 'button',
      tabindex: '0',
      style: { cursor: 'pointer' },
      onClick: () => onSelect(item),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      },
    }, kids);
  });
  return wrap(title, s('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title }, bars));
}

export function lineChart(title, items, { series } = {}) {
  const labels = items || [];
  const lines = series || [{ label: title, values: labels.map((i) => i.value), color: PALETTE[0] }];
  if (!labels.length) return wrap(title, h('p.empty', 'No hay datos para este gráfico.'));
  const all = lines.flatMap((l) => l.values);
  const max = Math.max(1, ...all);
  const w = 560;
  const hgt = 220;
  const pad = { l: 42, r: 12, t: 16, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = hgt - pad.t - pad.b;
  const n = labels.length;
  const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yAt = (v) => pad.t + innerH - (v / max) * innerH;
  const grid = [0, 0.5, 1].map((p) => {
    const y = pad.t + innerH * (1 - p);
    return [
      s('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: '#e4e9ef', 'stroke-width': 1 }),
      text(pad.l - 6, y + 4, fmtInt(max * p), { 'text-anchor': 'end' }),
    ];
  });
  const paths = lines.map((line, li) => {
    const d = line.values.map((v, i) => `${i ? 'L' : 'M'}${xAt(i)},${yAt(v)}`).join(' ');
    return s('path', { d, fill: 'none', stroke: line.color || PALETTE[li % PALETTE.length], 'stroke-width': 2 });
  });
  const ticks = labels.map((item, i) => text(xAt(i), hgt - 10, item.label, { 'text-anchor': 'middle' }));
  const legend = lines.length > 1
    ? lines.map((l, i) => h('span', h('i.swatch', { style: { background: l.color || PALETTE[i % PALETTE.length] } }), l.label))
    : null;
  return wrap(title, s('svg', { viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': title }, grid, paths, ticks), legend);
}

export function donutChart(title, items, { centerCaption = '' } = {}) {
  const data = items.filter((i) => i && i.value > 0);
  const total = data.reduce((s, i) => s + i.value, 0);
  if (!total) return wrap(title, h('p.empty', 'No hay datos para este gráfico.'));
  const cx = 120;
  const cy = 120;
  const r = 86;
  const ir = 54;
  const gap = data.length > 1 ? 0.045 : 0;
  let angle = -Math.PI / 2;
  const slices = [];
  const callouts = [];
  data.forEach((item, i) => {
    const share = item.value / total;
    const sweep = Math.max(0, share * Math.PI * 2 - gap);
    const a0 = angle + gap / 2;
    const a2 = a0 + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const color = TONES[item.tone] || item.color || PALETTE[i % PALETTE.length];
    const p1 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    const p3 = [cx + ir * Math.cos(a2), cy + ir * Math.sin(a2)];
    const p4 = [cx + ir * Math.cos(a0), cy + ir * Math.sin(a0)];
    const d = `M${p1[0]},${p1[1]} A${r},${r} 0 ${large} 1 ${p2[0]},${p2[1]} L${p3[0]},${p3[1]} A${ir},${ir} 0 ${large} 0 ${p4[0]},${p4[1]} Z`;
    slices.push(s('path', { d, fill: color }, s('title', `${item.label}: ${fmtInt(item.value)} (${fmtNum(share * 100, 0)} %)`)));
    if (share >= 0.08) {
      const mid = (a0 + a2) / 2;
      const lx = cx + ((r + ir) / 2) * Math.cos(mid);
      const ly = cy + ((r + ir) / 2) * Math.sin(mid);
      callouts.push(text(lx, ly + 4, `${fmtNum(share * 100, 0)}%`, {
        'text-anchor': 'middle',
        fill: '#fff',
        'font-size': '11',
        'font-weight': '700',
      }));
    }
    angle += share * Math.PI * 2;
  });
  const ring = s('svg', {
    viewBox: '0 0 240 240',
    role: 'img',
    'aria-label': `${title}. Total ${fmtInt(total)} ${centerCaption}`.trim(),
  },
    s('circle', { cx, cy, r: r + 8, fill: '#f4f7fb' }),
    slices,
    s('circle', { cx, cy, r: ir - 2, fill: '#fff' }),
    text(cx, cy - (centerCaption ? 4 : 0), fmtInt(total), {
      'text-anchor': 'middle',
      'font-size': '28',
      fill: '#1a2433',
      'font-weight': '800',
    }),
    centerCaption ? text(cx, cy + 16, centerCaption, {
      'text-anchor': 'middle',
      'font-size': '11',
      fill: '#5c6b7a',
      'font-weight': '650',
    }) : null,
    callouts,
  );
  const breakdown = h('div.donut-legend',
    data.map((item, i) => {
      const share = item.value / total;
      const color = TONES[item.tone] || item.color || PALETTE[i % PALETTE.length];
      return h('div.donut-row',
        h('i.donut-swatch', { style: { background: color } }),
        h('div.donut-copy',
          h('strong', item.label),
          item.hint ? h('span.muted.small', item.hint) : null,
        ),
        h('div.donut-nums',
          h('b', item.valueLabel || fmtInt(item.value)),
          item.valueLabel ? null : h('span.muted.small', `${fmtNum(share * 100, 0)} %`),
        ),
        h('div.donut-track', h('i', { style: { width: `${Math.max(4, share * 100)}%`, background: color } })),
      );
    }),
  );
  return wrap(title, h('div.donut-wrap', ring, breakdown));
}

export function groupedBarChart(title, months, series, { onSelect } = {}) {
  if (!months?.length || !series?.length) return wrap(title, h('p.empty', 'No hay datos para este gráfico.'));
  const w = 600;
  const hgt = 240;
  const pad = { l: 40, r: 12, t: 16, b: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = hgt - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupW = innerW / months.length;
  const barW = Math.max(4, (groupW - 12) / series.length);
  const bars = [];
  months.forEach((m, mi) => {
    series.forEach((ser, si) => {
      const v = ser.values[mi] || 0;
      const bh = (v / max) * innerH;
      const x = pad.l + mi * groupW + 6 + si * barW;
      const y = pad.t + innerH - bh;
      bars.push(s('rect', {
        class: onSelect ? 'chart-hit' : '',
        x,
        y,
        width: barW - 2,
        height: Math.max(1, bh),
        fill: ser.color || PALETTE[si % PALETTE.length],
        rx: 2,
        style: onSelect ? { cursor: 'pointer' } : undefined,
        onClick: onSelect ? () => onSelect(ser) : undefined,
      }, s('title', onSelect ? `Ver SKU de ${ser.label}` : ser.label)));
    });
  });
  const ticks = months.map((m, i) => text(pad.l + i * groupW + groupW / 2, hgt - 12, m.label, { 'text-anchor': 'middle' }));
  const axis = s('line', { x1: pad.l, x2: w - pad.r, y1: pad.t + innerH, y2: pad.t + innerH, stroke: '#d5dde6' });
  const legend = series.map((ser, i) => h('span', {
    class: [onSelect ? 'chart-hit' : '', ser.selected ? 'is-on' : ''].filter(Boolean).join(' '),
    style: onSelect ? { cursor: 'pointer' } : undefined,
    onClick: onSelect ? () => onSelect(ser) : undefined,
  }, h('i.swatch', { style: { background: ser.color || PALETTE[i % PALETTE.length] } }), ser.label));
  return wrap(title, s('svg', { viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': title }, axis, bars, ticks), legend);
}

export function renderChart(chart) {
  if (!chart) return null;
  if (chart.type === 'bar') return barChart(chart.title, chart.items);
  if (chart.type === 'compare') return compareBarChart(chart.title, chart.items, chart);
  if (chart.type === 'line') return lineChart(chart.title, chart.items, { series: chart.series });
  if (chart.type === 'donut') return donutChart(chart.title, chart.items, chart);
  if (chart.type === 'grouped') return groupedBarChart(chart.title, chart.months, chart.series);
  return h('p.muted', 'Gráfico no disponible.');
}
