import { h, replace } from '../../core/dom.js';
import { HANDLING_RESTRICTIONS } from '../../data/schema.js';
import { ABC_CRITERIA } from '../../domain/abc.js';
import { fmtDateTime, fmtDays, fmtInt, fmtMoney, fmtNum, fmtUnits } from '../../core/format.js';
import { abcBadge, badge, dataTable, pageHeader } from '../components/common.js';
import { barChart } from '../charts/svgCharts.js';

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
    replace(container,
      pageHeader(`${p.sku} · ${p.name}`, `${p.category}. Datos ficticios de demostración.`),
      h('div.grid.detail-grid',
        h('section.card',
          h('h2', 'Estado de inventario'),
          h('p', badge(a.level, a.levelLabel), ' ', a.reasons.join(' ')),
          h('p', `Stock total: ${fmtInt(detail.total)} ${p.unit}. Disponible: ${fmtInt(detail.available)}. Comprometido: ${fmtInt(detail.committed)}. Por recibir: ${fmtInt(detail.pending)}.`),
          h('p', `Mínimo: ${fmtInt(p.params.minStock)}. Punto de reposición: ${fmtInt(p.params.reorderPoint)}. Seguridad: ${fmtInt(p.params.safetyStock)}.`),
          h('p', `Consumo promedio: ${fmtUnits(a.avgDaily)} ${p.unit} al día. Cobertura: ${fmtDays(a.coverageDays)}. El proveedor tarda ${fmtInt(p.params.leadTimeDays)} días.`),
          h('p', a.suggestedQty
            ? `Cantidad sugerida a reponer: ${fmtInt(a.suggestedQty)} ${p.unit}. No se genera una solicitud de compra.`
            : 'No se sugiere reponer en este momento.'),
          h('p.muted.small', a.replenishment.steps.join(' ')),
          h('div.btn-row',
            h('button.btn.btn-primary', { type: 'button', onClick: () => ctx.navigate('/movimientos', { sku: p.sku }) }, 'Registrar movimiento'),
            h('button.btn', { type: 'button', onClick: () => ctx.navigate('/inventario', { sku: p.sku, mapa: 'abc' }) }, 'Ver en el plano Pareto'),
            h('button.btn', { type: 'button', onClick: () => ctx.navigate('/configuracion') }, 'Editar parámetros'),
          ),
        ),
        h('section.card',
          h('h2', 'Datos maestros (ficticios)'),
          h('p', `Departamento habitual: ${detail.department?.name || '—'}. Proveedor: ${detail.supplier?.name || '—'}.`),
          h('p', `Costo unitario de demostración: ${fmtMoney(p.unitCost)}. Unidad: ${p.unit}.`),
          h('p', `Peso ${fmtNum(p.handling.weightKg, 2)} kg · Volumen ${fmtNum(p.handling.volumeL, 2)} L · ${HANDLING_RESTRICTIONS[p.handling.restriction]}.`),
          h('h3', 'Clasificación ABC por criterio'),
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
