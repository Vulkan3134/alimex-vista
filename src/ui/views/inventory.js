import { h, replace } from '../../core/dom.js';
import { fmtDays, fmtInt, fmtPct } from '../../core/format.js';
import { ABC_CRITERIA } from '../../domain/abc.js';
import { HANDLING_RESTRICTIONS } from '../../data/schema.js';
import { abcBadge, badge, dataTable, field, input, pageHeader, select, stockNum } from '../components/common.js';

function heatClass(cell, mode) {
  if (!cell) return 'heat-0';
  if (mode === 'abc' && cell.cls) return `heat-${cell.cls}`;
  const n = cell.value || 0;
  if (n >= 0.8) return 'heat-4';
  if (n >= 0.55) return 'heat-3';
  if (n >= 0.3) return 'heat-2';
  if (n > 0) return 'heat-1';
  return 'heat-0';
}

function shortCode(code) {
  return code.replace('P0', 'P').replace('-E0', '-E').replace('-N0', '-N');
}

function applyMapQuery(ui, mapa) {
  if (mapa === 'pareto' || mapa === 'abc') ui.heat = 'abc';
  else if (mapa === 'actividad' || mapa === 'ocupacion') ui.heat = mapa;
}

export function createInventoryView(ctx) {
  const ui = {
    search: '',
    category: '',
    department: '',
    location: '',
    abcClass: '',
    status: '',
    selectedSku: '',
    selectedLocation: '',
    heat: 'abc',
    criterion: '',
    paretoOpen: false,
    scrollPareto: false,
    routeToken: '',
  };

  function openPareto() {
    if (!ui.paretoOpen) ui.scrollPareto = true;
    ui.paretoOpen = true;
  }

  function closePareto() {
    ui.paretoOpen = false;
    ui.scrollPareto = false;
  }

  function togglePareto() {
    if (ui.paretoOpen) closePareto();
    else openPareto();
  }

  function render(container, match) {
    const routeToken = `${match?.path || ''}|${JSON.stringify(match?.query || {})}`;
    if (routeToken !== ui.routeToken) {
      ui.routeToken = routeToken;
      if (match?.query?.sku) {
        ui.selectedSku = match.query.sku;
        openPareto();
      }
      if (match?.query?.ubicacion) ui.selectedLocation = match.query.ubicacion;
      if (match?.query?.estado) ui.status = match.query.estado;
      if (match?.query?.categoria) ui.category = match.query.categoria;
      if (match?.query?.departamento) ui.department = match.query.departamento;
      applyMapQuery(ui, match?.query?.mapa);
    }

    const state = ctx.store.getState();
    const criterion = ui.criterion || state.settings.abc.criterion;
    const rows = ctx.inventory.inventoryRows({
      search: ui.search,
      category: ui.category,
      departmentId: ui.department,
      location: ui.location,
      abcClass: ui.abcClass,
      status: ui.status,
      criterion,
    });
    const abc = ctx.inventory.abc(criterion);
    const selected = ui.selectedSku ? ctx.inventory.productDetail(ui.selectedSku) : null;
    const abcMeta = ABC_CRITERIA.find((c) => c.id === criterion);
    const skuAbc = selected ? abc.items.get(selected.product.sku) : null;
    const skuClass = skuAbc?.cls || 'C';
    const hitLocs = new Set((selected?.locations || []).map((l) => l.location));
    const qtyByLoc = new Map((selected?.locations || []).map((l) => [l.location, l.qty]));

    let locDetail = null;
    let skuHere = null;
    let misplaced = [];
    const aisleBlocks = [];

    const showPareto = Boolean(selected && ui.paretoOpen);

    if (selected && (!ui.selectedLocation || !hitLocs.has(ui.selectedLocation)) && selected.locations[0]) {
      ui.selectedLocation = selected.locations[0].location;
    }

    if (showPareto) {
      const dims = ctx.inventory.layoutDimensions();
      skuHere = selected.locations.find((l) => l.location === ui.selectedLocation) || null;
      locDetail = skuHere ? ctx.inventory.locationDetail(skuHere.location) : null;
      misplaced = ctx.inventory.slotting(criterion)
        .filter((r) => r.sku === selected.product.sku && ((r.cls === 'A' && r.gain >= 10) || r.violatesRestriction));
      for (let a = 1; a <= dims.aisles; a++) {
        const racks = [];
        for (let r = 1; r <= dims.racks; r++) {
          const levels = [];
          for (let n = 1; n <= dims.levels; n++) {
            const code = `P${String(a).padStart(2, '0')}-E${String(r).padStart(2, '0')}-N${String(n).padStart(2, '0')}`;
            const hit = hitLocs.has(code);
            const qty = qtyByLoc.get(code) || 0;
            levels.push(h('button.slot', {
              type: 'button',
              disabled: !hit,
              class: hit
                ? [
                  'is-hit',
                  ui.selectedLocation === code ? 'is-on' : '',
                  heatClass({ cls: skuClass }, 'abc'),
                  `has-cls-${skuClass}`,
                ].filter(Boolean).join(' ')
                : 'is-dim',
              title: hit
                ? `${code} · ${selected.product.sku} · ${fmtInt(qty)} ud. · Clase ${skuClass}`
                : `${code} · no corresponde a ${selected.product.sku}`,
              onClick: hit ? () => { ui.selectedLocation = code; render(container, match); } : undefined,
            },
            h('span.code', shortCode(code)),
            hit
              ? h('span.slot-meta', `${fmtInt(qty)}`, h('b.slot-cls', skuClass))
              : h('span.slot-meta', '—'),
            ));
          }
          racks.push(h('div.rack', levels));
        }
        aisleBlocks.push(h('div.aisle', h('div.aisle-title', `Pasillo ${a}`), h('div.racks', racks)));
      }
    }

    replace(container,
      pageHeader(
        'Inventario y layout de bodega',
        'Toque un SKU para abrir el Pareto de sus ubicaciones. Toque otra vez el mismo SKU —o Cerrar— para ocultarlo.',
      ),
      h(showPareto ? 'div.split' : 'div',
        h('section.card',
          h('h2', 'Panel de inventario'),
          h('div.filters',
            field({ label: 'Buscar SKU o nombre', className: 'grow', children: input({
              value: ui.search,
              placeholder: 'Ej.: SKU-001 o guantes',
              onInput: (e) => { ui.search = e.target.value; render(container, match); },
            }) }),
            field({
              label: 'Categoría',
              children: select({ value: ui.category, onChange: (e) => { ui.category = e.target.value; render(container, match); } },
                [{ value: '', label: 'Todas' }, ...ctx.inventory.categories().map((c) => ({ value: c, label: c }))]),
            }),
            field({
              label: 'Departamento',
              children: select({ value: ui.department, onChange: (e) => { ui.department = e.target.value; render(container, match); } },
                [{ value: '', label: 'Todos' }, ...state.departments.map((d) => ({ value: d.id, label: d.name }))]),
            }),
            field({
              label: 'Ubicación (prefijo)',
              children: input({ value: ui.location, placeholder: 'P01 o P01-E02', onInput: (e) => { ui.location = e.target.value.toUpperCase(); render(container, match); } }),
            }),
            field({
              label: 'Clase Pareto',
              children: select({ value: ui.abcClass, onChange: (e) => { ui.abcClass = e.target.value; render(container, match); } },
                [{ value: '', label: 'Todas' }, { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]),
            }),
            field({
              label: 'Estado',
              children: select({ value: ui.status, onChange: (e) => { ui.status = e.target.value; render(container, match); } },
                [{ value: '', label: 'Todos' }, { value: 'critico', label: 'Crítico' }, { value: 'atencion', label: 'Atención' }, { value: 'precaucion', label: 'Precaución' }, { value: 'normal', label: 'Normal' }]),
            }),
          ),
          h('p.muted.small', `Criterio Pareto activo: ${abcMeta?.label || 'valor'}. El valor económico y la frecuencia de retiro se analizan por separado; el criterio se elige aquí o en Configuración.`),
          dataTable({
            selectedKey: ui.selectedSku,
            rowKey: (r) => r.sku,
            onRowClick: (row) => {
              if (ui.selectedSku === row.sku) {
                togglePareto();
              } else {
                ui.selectedSku = row.sku;
                if (row.locations[0]) ui.selectedLocation = row.locations[0].location;
                openPareto();
              }
              render(container, match);
            },
            empty: 'Ningún producto coincide con los filtros.',
            columns: [
              { key: 'sku', label: 'SKU', render: (v) => h('span.sku', v) },
              { key: 'name', label: 'Producto' },
              { key: 'category', label: 'Categoría' },
              { key: 'departmentName', label: 'Departamento' },
              { key: 'total', label: 'Stock total', align: 'right', render: (v) => stockNum(v, fmtInt(v)) },
              { key: 'available', label: 'Disponible', align: 'right', render: (v, r) => (r.total <= 0 ? stockNum(0, fmtInt(v)) : fmtInt(v)) },
              { key: 'minStock', label: 'Mínimo', align: 'right', render: (v) => fmtInt(v) },
              { key: 'abcClass', label: 'Pareto', render: (v) => abcBadge(v) },
              { key: 'locations', label: 'Ubicaciones', render: (v) => v.length ? v.map((x) => `${x.location} (${fmtInt(x.qty)})`).join(', ') : stockNum(0, 'Sin existencias') },
              { key: 'levelLabel', label: 'Estado', render: (_, r) => badge(r.level, r.levelLabel) },
            ],
            rows,
          }),
          selected ? h('div.loc-panel', { style: { marginTop: '12px' } },
            h('h3', `${selected.product.sku} · ${selected.product.name}`),
            h('p',
              badge(selected.alert.level, selected.alert.levelLabel),
              ' Pareto ',
              abcBadge(abc.items.get(selected.product.sku)?.cls || 'C'),
              ` · Cobertura: ${fmtDays(selected.alert.coverageDays)}. Restricción: ${HANDLING_RESTRICTIONS[selected.product.handling.restriction]}.`,
            ),
            h('p.muted.small', selected.locations.length
              ? `Está en ${selected.locations.map((l) => `${l.location} (${fmtInt(l.qty)} · ${l.tier.label})`).join('; ')}.`
              : 'Este producto no tiene existencias en ninguna ubicación.'),
            h('div.btn-row',
              h('button.btn.btn-primary', {
                type: 'button',
                'aria-expanded': String(ui.paretoOpen),
                onClick: () => { togglePareto(); render(container, match); },
              }, ui.paretoOpen ? 'Cerrar Pareto ▴' : 'Ver Pareto de ubicaciones ▾'),
              h('button.btn', { type: 'button', onClick: () => ctx.navigate(`/producto/${selected.product.sku}`) }, 'Ver ficha'),
              h('button.btn', { type: 'button', onClick: () => ctx.navigate('/movimientos', { sku: selected.product.sku }) }, 'Registrar movimiento'),
            ),
          ) : h('p.muted.small', 'Toque un SKU para abrir el Pareto de sus ubicaciones. Toque otra vez para cerrarlo.'),
        ),
        showPareto ? h('section.card.layout',
          h('div.card-head',
            h('h2', `Pareto de ${selected.product.sku}`),
            h('button.btn', {
              type: 'button',
              onClick: () => { closePareto(); render(container, match); },
            }, 'Cerrar'),
          ),
          h('div.filters',
            field({
              label: 'Criterio Pareto de este SKU',
              children: select({
                value: criterion,
                onChange: (e) => { ui.criterion = e.target.value; render(container, match); },
              }, ABC_CRITERIA.map((c) => ({ value: c.id, label: c.label }))),
            }),
          ),
          h('div.pareto-legend',
            h(`span.pareto-chip.is-${skuClass}`, h('b', skuClass), `${selected.product.sku} · Clase ${skuClass}`),
            ...selected.locations.map((l) => h('span.pareto-chip', `${l.location} · ${fmtInt(l.qty)} ud.`)),
            selected.locations.length ? null : h('span.pareto-chip.is-empty', h('b', '—'), 'Sin existencias'),
          ),
          h('p.muted.small', skuAbc?.noMovement
            ? `${selected.product.sku} no tuvo movimiento en el período: queda en clase C. En el plano solo se marcan sus ubicaciones.`
            : `${selected.product.sku} es clase ${skuClass} por ${abcMeta?.label || criterion}: puesto ${fmtInt(skuAbc?.rank)} · ${fmtPct(skuAbc?.share)} del total. ${abcMeta?.explain || ''} En los pasillos solo se destacan las ${fmtInt(selected.locations.length)} posiciones de este SKU.`),
          misplaced.length ? h('div.slotting-box',
            h('h3', `${selected.product.sku} está lejos de una posición accesible`),
            h('p.muted.small', 'Recomendación solo para este SKU: no mueve existencias. Un A debería estar cerca del pasillo 1 y a altura cómoda.'),
            dataTable({
              columns: [
                { key: 'currentLocation', label: 'Hoy' },
                { key: 'recommendedLocation', label: 'Sugerida' },
              ],
              rows: misplaced,
            }),
          ) : null,
          h('div.aisles', aisleBlocks),
          locDetail && skuHere ? h('div.loc-panel',
            h('h3', locDetail.location.code, abcBadge(skuClass)),
            h('p', `${selected.product.sku}: ${fmtInt(skuHere.qty)} ${selected.product.unit}. Accesibilidad: ${skuHere.tier.label} (${fmtInt(skuHere.accessScore)}).`),
            h('p.muted.small', `Esta posición se destaca porque aquí está ${selected.product.sku} (clase ${skuClass}). El resto del plano queda atenuado a propósito.`),
            h('div.btn-row', { style: { marginTop: '8px' } },
              h('button.btn', { type: 'button', onClick: () => ctx.navigate('/movimientos', { modo: 'picking', tipo: 'SALIDA', u: locDetail.location.code, sku: selected.product.sku }) }, 'Salida por picking'),
              h('button.btn', { type: 'button', onClick: () => ctx.navigate('/movimientos', { modo: 'picking', tipo: 'ENTRADA', u: locDetail.location.code, sku: selected.product.sku }) }, 'Ingreso por picking'),
              h('button.btn', { type: 'button', onClick: () => ctx.navigate('/movimientos', { from: locDetail.location.code, sku: selected.product.sku, tipo: 'SALIDA' }) }, 'Formulario de salida'),
            ),
          ) : h('p.muted.small', selected.locations.length
            ? 'Toque una posición destacada para ver cuánto de este SKU hay ahí.'
            : 'Este SKU no tiene existencias: no hay posiciones que destacar.'),
        ) : null,
      ),
    );

    if (ui.scrollPareto) {
      ui.scrollPareto = false;
      requestAnimationFrame(() => {
        container.querySelector('.layout')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  return { render };
}
