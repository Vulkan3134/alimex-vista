import { h, replace } from '../../core/dom.js';
import { HANDLING_RESTRICTIONS } from '../../data/schema.js';
import { ABC_CRITERIA } from '../../domain/abc.js';
import { fmtDateTime, fmtDays, fmtInt, fmtMoney, fmtNum, fmtUnits } from '../../core/format.js';
import { abcBadge, badge, dataTable, pageHeader, stockNum } from '../components/common.js';
import { barChart } from '../charts/svgCharts.js';

function fact(label, value, hint) {
  return h('div.fact',
    h('span.fact-k', label),
    h('span.fact-v', value),
    hint ? h('span.fact-h', hint) : null,
  );
}

export function createProductView(ctx) {
  function render(container, match) {
    const sku = match?.params?.sku;
    const detail = sku ? ctx.inventory.productDetail(sku) : null;
    if (!detail) {
      replace(container, pageHeader('Producto no encontrado', 'El SKU indicado no existe en el catálogo de demostración.'), h('button.btn', { type: 'button', onClick: () => ctx.navigate('/inventario') }, 'Volver al inventario'));
      return;
    }
    const p = detail.product;
    const a = detail.alert;
    const unit = p.unit;
    replace(container,
      pageHeader(`${p.sku} · ${p.name}`, `${p.category}. Datos ficticios de demostración.`),
      h('section.card.ficha',
        h('div.ficha-top',
          h('h2', 'Estado de inventario'),
          h('div.ficha-badges', badge(a.level, a.levelLabel), abcBadge(detail.abc.valor?.cls || 'C')),
        ),
        a.reasons?.[0] ? h('p.ficha-note', a.reasons[0]) : null,
        h('div.facts',
          fact('Stock total', stockNum(detail.total, `${fmtInt(detail.total)} ${unit}`)),
          fact('Disponible', detail.total <= 0 ? stockNum(0, `${fmtInt(detail.available)} ${unit}`) : `${fmtInt(detail.available)} ${unit}`),
          fact('Comprometido', `${fmtInt(detail.committed)} ${unit}`),
          fact('Por recibir', `${fmtInt(detail.pending)} ${unit}`),
          fact('Mínimo', `${fmtInt(p.params.minStock)} ${unit}`),
          fact('Punto de reposición', `${fmtInt(p.params.reorderPoint)} ${unit}`),
          fact('Seguridad', `${fmtInt(p.params.safetyStock)} ${unit}`),
          fact('Consumo diario', `${fmtUnits(a.avgDaily)} ${unit}`),
          fact('Cobertura', fmtDays(a.coverageDays)),
          fact('Plazo proveedor', `${fmtInt(p.params.leadTimeDays)} días`),
          fact('Sugerido a reponer', a.suggestedQty ? `${fmtInt(a.suggestedQty)} ${unit}` : 'Nada ahora'),
        ),
        h('div.btn-row',
          h('button.btn.btn-primary', { type: 'button', onClick: () => ctx.navigate('/movimientos', { sku: p.sku }) }, 'Registrar movimiento'),
          h('button.btn', { type: 'button', onClick: () => ctx.navigate('/inventario', { sku: p.sku, mapa: 'abc' }) }, 'Ver en el plano'),
          h('button.btn', { type: 'button', onClick: () => ctx.navigate('/configuracion') }, 'Editar parámetros'),
        ),
      ),
      h('div.grid.detail-grid',
        h('section.card',
          h('h2', 'Datos del producto'),
          h('div.facts',
            fact('Departamento', detail.department?.name || '—'),
            fact('Proveedor', detail.supplier?.name || '—'),
            fact('Costo unitario', fmtMoney(p.unitCost)),
            fact('Unidad', unit),
            fact('Peso', `${fmtNum(p.handling.weightKg, 2)} kg`),
            fact('Volumen', `${fmtNum(p.handling.volumeL, 2)} L`),
            fact('Restricción', HANDLING_RESTRICTIONS[p.handling.restriction]),
          ),
        ),
        h('section.card',
          h('h2', 'Clasificación ABC'),
          dataTable({
            columns: [
              { key: 'label', label: 'Criterio' },
              { key: 'cls', label: 'Clase', render: (v) => abcBadge(v) },
              { key: 'metric', label: 'Indicador', render: (v) => fmtNum(v, 1) },
            ],
            rows: ABC_CRITERIA.map((c) => ({
              label: c.label,
              cls: detail.abc[c.id]?.cls || 'C',
              metric: detail.abc[c.id]?.metric || 0,
            })),
          }),
          h('p.muted.small', 'El valor económico y la frecuencia de retiro no se mezclan: un producto puede ser A en uno y C en el otro.'),
        ),
      ),
      h('section.card',
        h('h2', 'Ubicaciones'),
        dataTable({
          empty: 'Sin existencias.',
          onRowClick: (row) => ctx.navigate('/inventario', { ubicacion: row.location, sku: p.sku, mapa: 'abc' }),
          columns: [
            { key: 'location', label: 'Ubicación' },
            { key: 'qty', label: 'Cantidad', align: 'right', render: (v) => fmtInt(v) },
            { key: 'tier', label: 'Accesibilidad', render: (v) => v.label },
            { key: 'accessScore', label: 'Índice', align: 'right', render: (v) => fmtInt(v) },
          ],
          rows: detail.locations,
        }),
      ),
      h('div.grid.charts',
        h('section.card', barChart('Salidas de los últimos meses', detail.monthly.map((m) => ({ label: m.label, value: m.units })))),
        h('section.card',
          h('h2', 'Movimientos recientes'),
          dataTable({
            columns: [
              { key: 'at', label: 'Fecha', render: (v) => fmtDateTime(v) },
              { key: 'type', label: 'Tipo' },
              { key: 'qty', label: 'Cantidad', align: 'right', render: (v) => fmtInt(v) },
              { key: 'from', label: 'Origen' },
              { key: 'to', label: 'Destino' },
            ],
            rows: detail.recent,
          }),
        ),
      ),
    );
  }
  return { render };
}
