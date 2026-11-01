// Generación de reportes a partir del estado compartido.
// Los textos se construyen con los números reales: no se inventan resultados.
import { MOVEMENT_LABELS } from '../data/schema.js';
import { ABC_CRITERIA } from '../domain/abc.js';
import { ALERT_LEVELS, ALERT_ORDER } from '../domain/alerts.js';
import { countOf, fmtDate, fmtDateTime, fmtDays, fmtInt, fmtMoney, fmtNum, fmtPct, fmtUnits, joinList, plural } from '../core/format.js';
import { PERIOD_PRESETS, addMonths, monthLabel, resolvePeriod } from '../core/dates.js';
import { APP } from '../config.js';

export const REPORT_TYPES = Object.freeze([
  { id: 'inventario', label: 'Inventario actual', needsPeriod: false, hint: 'Existencias, ubicación y estado de cada producto.' },
  { id: 'salidas', label: 'Salidas de productos', needsPeriod: true, hint: 'Unidades retiradas en el período, con departamento y responsable.' },
  { id: 'ranking', label: 'Ranking de consumo por SKU', needsPeriod: true, hint: 'Productos ordenados por cantidad retirada.' },
  { id: 'departamentos', label: 'Consumo por departamento', needsPeriod: true, hint: 'Qué áreas retiraron más material.' },
  { id: 'quiebres', label: 'Productos con quiebres de stock', needsPeriod: false, hint: 'Artículos sin existencias disponibles.' },
  { id: 'minimo', label: 'Productos bajo stock mínimo', needsPeriod: false, hint: 'Artículos por debajo del mínimo configurado.' },
  { id: 'reposicion', label: 'Recomendaciones de reposición', needsPeriod: false, hint: 'Sugerencias de compra; no son pedidos reales.' },
  { id: 'historial', label: 'Historial de movimientos', needsPeriod: true, hint: 'Trazabilidad completa de entradas, salidas, traslados y devoluciones.' },
  { id: 'ocupacion', label: 'Ocupación de bodega', needsPeriod: false, hint: 'Uso de ubicaciones y capacidad del layout.' },
  { id: 'abc', label: 'Clasificación ABC', needsPeriod: false, hint: 'Importancia de los productos según el criterio elegido.' },
  { id: 'evolucion', label: 'Evolución del consumo', needsPeriod: true, hint: 'Cómo cambiaron las salidas a lo largo del período.' },
  { id: 'comparacion', label: 'Comparación entre períodos', needsPeriod: true, hint: 'Mes actual frente al mes anterior (u otros rangos).' },
]);

const typeLabel = (id) => REPORT_TYPES.find((t) => t.id === id)?.label || id;

function deptName(state, id) {
  return state.departments.find((d) => d.id === id)?.name || 'Sin departamento';
}

function coverageText(days) {
  if (!Number.isFinite(days)) return 'no tiene consumo reciente, por lo que no se puede estimar cuántos días durará';
  if (days <= 0) return 'no tiene existencias disponibles';
  return `tiene existencias para aproximadamente ${fmtDays(days)}`;
}

function topNames(rows, n, nameOf, unitsOf) {
  return rows.slice(0, n).map((r) => `${nameOf(r)} (${fmtInt(unitsOf(r))} unidades)`);
}

function changeText(current, previous, noun) {
  if (previous <= 0 && current <= 0) return `No hubo ${noun} en ninguno de los dos períodos.`;
  if (previous <= 0) return `En el período reciente se registraron ${fmtInt(current)} ${noun}; en el anterior no hubo.`;
  const pct = ((current - previous) / previous) * 100;
  const dir = pct > 1 ? 'aumentaron' : pct < -1 ? 'disminuyeron' : 'se mantuvieron estables';
  const extra = Math.abs(pct) > 1 ? ` (${fmtPct(Math.abs(pct))} ${pct > 0 ? 'más' : 'menos'})` : '';
  return `Las ${noun} ${dir}${extra}: ${fmtInt(previous)} en el período anterior y ${fmtInt(current)} en el reciente.`;
}

/**
 * @param {ReturnType<typeof import('./inventoryService.js').createInventoryService>} inventory
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 */
export function createReportService(inventory, store) {
  function build(type, options = {}) {
    const now = inventory.now();
    const state = store.getState();
    const period = inventory.period(options.periodId || 'mes_actual', options.custom);
    const compare = inventory.period(options.compareId || 'mes_anterior', options.compareCustom);
    const detail = options.level === 'detallado';
    const alerts = inventory.alerts();
    const kpis = inventory.kpis(alerts);
    const generatedAt = now;

    const base = {
      id: type,
      title: typeLabel(type),
      generatedAt,
      generatedLabel: fmtDateTime(generatedAt),
      period,
      compare,
      level: detail ? 'detallado' : 'resumido',
      demo: APP.demoBanner,
      company: APP.company,
      footnotes: [
        APP.demoBanner,
        'Las recomendaciones de reposición no generan solicitudes de compra ni pedidos a proveedores.',
        'Los colores de alerta se acompañan siempre de un texto: Crítico, Atención, Precaución o Normal.',
      ],
    };

    switch (type) {
      case 'inventario': return inventario(base, state, alerts, kpis, detail);
      case 'salidas': return salidas(base, state, period, detail);
      case 'ranking': return ranking(base, period, options.departmentId || null, detail);
      case 'departamentos': return departamentos(base, period, detail);
      case 'quiebres': return quiebres(base, alerts, detail);
      case 'minimo': return minimo(base, alerts, detail);
      case 'reposicion': return reposicion(base, alerts, detail);
      case 'historial': return historial(base, state, period, options, detail);
      case 'ocupacion': return ocupacion(base, state, detail);
      case 'abc': return abc(base, state, options.criterion, detail);
      case 'evolucion': return evolucion(base, period, options, detail);
      case 'comparacion': return comparacion(base, period, compare, detail);
      default: throw new Error(`Tipo de reporte no reconocido: ${type}`);
    }
  }

  function inventario(base, state, alerts, kpis, detail) {
    const rows = inventory.inventoryRows();
    const byLevel = kpis.levelCounts;
    const empty = rows.filter((r) => r.available <= 0).length;
    const summary = `Hoy hay ${countOf(kpis.totalSkus, 'producto registrado', 'productos registrados')} y ${fmtInt(kpis.availableUnits)} unidades disponibles en bodega. `
      + `${countOf(byLevel.critico, 'producto', 'productos')} ${plural(byLevel.critico, 'está', 'están')} sin existencias, `
      + `${fmtInt(byLevel.atencion)} bajo el stock mínimo y ${fmtInt(byLevel.precaucion)} en precaución. `
      + `Las ubicaciones ocupadas son ${fmtInt(kpis.occupiedLocations)} de ${fmtInt(kpis.totalLocations)} (${fmtPct(kpis.occupancyPct)}).`;
    const conclusions = [
      empty ? `Hay ${countOf(empty, 'producto', 'productos')} sin existencias disponibles.` : 'No hay productos agotados en este momento.',
      `El valor referencial del inventario (cifras ficticias) es ${fmtMoney(kpis.inventoryValue)}.`,
      kpis.occupancyPct > 80 ? 'La bodega está bastante ocupada: conviene revisar ubicaciones de baja rotación.' : 'Hay espacio disponible en el layout para recepciones.',
    ];
    const recommendations = [
      byLevel.critico ? 'Priorizar la reposición de los productos sin existencias antes de atender el resto.' : 'Mantener el seguimiento habitual de los productos en precaución.',
      'Verificar que los artículos de mayor salida estén en ubicaciones de fácil acceso.',
    ];
    return {
      ...base,
      periodLabel: `Existencias al ${fmtDate(base.generatedAt)}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Productos (SKU)', value: fmtInt(kpis.totalSkus), hint: 'Códigos activos' },
        { label: 'Unidades disponibles', value: fmtInt(kpis.availableUnits), hint: 'Listas para retirar' },
        { label: 'Sin existencias', value: fmtInt(byLevel.critico), hint: 'No quedó ninguna unidad', tone: byLevel.critico ? 'critico' : null },
        { label: 'Bajo el mínimo', value: fmtInt(byLevel.atencion), hint: 'Todavía hay stock, bajo el mínimo', tone: byLevel.atencion ? 'atencion' : null },
        { label: 'Ocupación de ubicaciones', value: fmtPct(kpis.occupancyPct), hint: `${fmtInt(kpis.occupiedLocations)} de ${fmtInt(kpis.totalLocations)}` },
      ],
      charts: [
        {
          type: 'donut',
          title: 'Cómo está el catálogo',
          centerCaption: 'SKU',
          items: ALERT_ORDER.map((id) => ({
            label: ALERT_LEVELS[id].label,
            hint: ALERT_LEVELS[id].meaning,
            value: byLevel[id] || 0,
            tone: id,
          })),
        },
        {
          type: 'bar',
          title: 'Productos por familia',
          items: inventory.valueByCategory().map((c) => ({ label: c.category, value: c.skus })),
        },
      ],
      sections: [{
        title: detail ? 'Inventario completo' : 'Productos que requieren atención',
        paragraphs: ['La tabla muestra el stock total (todo lo que hay en bodega) y el stock disponible (lo que se puede retirar, descontando lo reservado).'],
        table: {
          columns: [
            { key: 'sku', label: 'Código SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'category', label: 'Categoría' },
            { key: 'total', label: 'Stock total', format: (v) => fmtInt(v) },
            { key: 'available', label: 'Disponible', format: (v) => fmtInt(v) },
            { key: 'minStock', label: 'Mínimo', format: (v) => fmtInt(v) },
            { key: 'abcClass', label: 'Clase ABC' },
            { key: 'locations', label: 'Ubicaciones', format: (v) => (Array.isArray(v) ? v.map((x) => `${x.location} (${fmtInt(x.qty)})`).join(', ') : v) },
            { key: 'levelLabel', label: 'Estado' },
          ],
          rows: (detail ? rows : rows.filter((r) => r.level !== 'normal')).map((r) => ({ ...r, locations: r.locations })),
        },
      }],
      conclusions,
      recommendations,
    };
  }

  function salidas(base, state, period, detail) {
    const totals = inventory.periodTotals(period);
    const rank = inventory.ranking({ period });
    const depts = inventory.departmentTotals(period);
    const top = rank.rows.slice(0, 5);
    const topDept = depts[0];
    const summary = `Durante ${period.label} se registraron ${countOf(totals.salidas.moves, 'movimiento de salida', 'movimientos de salida')}, equivalentes a ${fmtInt(totals.salidas.units)} unidades retiradas. `
      + (topDept ? `El departamento de ${topDept.name} concentró la mayor cantidad de retiros (${fmtPct(topDept.pct)} del total). ` : '')
      + (top[0] ? `El producto con más salida fue ${top[0].name} (${top[0].sku}), con ${fmtInt(top[0].units)} unidades.` : 'No hubo salidas en el período.');
    const moves = state.movements.filter((m) => {
      const ts = Date.parse(m.at);
      return m.type === 'SALIDA' && ts >= period.from.getTime() && ts <= period.to.getTime();
    }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (b.id < a.id ? 1 : -1));
    return {
      ...base,
      periodLabel: period.label,
      executiveSummary: summary,
      kpis: [
        { label: 'Unidades retiradas', value: fmtInt(totals.salidas.units), hint: 'Solo salidas; las devoluciones no suman' },
        { label: 'Movimientos de salida', value: fmtInt(totals.salidas.moves), hint: 'Cantidad de retiros registrados' },
        { label: 'Unidades devueltas', value: fmtInt(totals.devoluciones.units), hint: 'Informativo; no se cuentan como salida' },
        { label: 'Departamentos que retiraron', value: fmtInt(depts.filter((d) => d.units > 0).length), hint: 'Áreas con consumo' },
      ],
      charts: [
        { type: 'bar', title: 'Productos con más unidades retiradas', items: top.map((r) => ({ label: r.sku, value: r.units, hint: r.name })) },
        { type: 'bar', title: 'Salidas por departamento', items: depts.map((d) => ({ label: d.name, value: d.units })) },
      ],
      sections: [
        {
          title: 'Productos más retirados',
          table: {
            columns: [
              { key: 'position', label: 'Puesto' },
              { key: 'sku', label: 'Código SKU' },
              { key: 'name', label: 'Producto' },
              { key: 'units', label: 'Unidades', format: (v) => fmtInt(v) },
              { key: 'movements', label: 'Movimientos', format: (v) => fmtInt(v) },
              { key: 'share', label: 'Participación', format: (v) => fmtPct(v) },
              { key: 'departmentLabel', label: 'Departamento' },
            ],
            rows: detail ? rank.rows : rank.rows.slice(0, 15),
          },
        },
        detail ? {
          title: 'Detalle de cada retiro',
          table: {
            columns: [
              { key: 'at', label: 'Fecha y hora', format: (v) => fmtDateTime(v) },
              { key: 'sku', label: 'SKU' },
              { key: 'name', label: 'Producto', format: (_, r) => state.products.find((p) => p.sku === r.sku)?.name || r.sku },
              { key: 'qty', label: 'Cantidad', format: (v) => fmtInt(v) },
              { key: 'from', label: 'Ubicación' },
              { key: 'departmentId', label: 'Departamento', format: (v) => deptName(state, v) },
              { key: 'responsible', label: 'Responsable' },
              { key: 'document', label: 'Documento' },
            ],
            rows: moves,
          },
        } : null,
      ].filter(Boolean),
      conclusions: [
        totals.salidas.units ? `Se retiraron ${fmtInt(totals.salidas.units)} unidades en ${fmtInt(totals.salidas.moves)} movimientos.` : 'No se registraron salidas en el período.',
        topDept ? `${topDept.name} representó ${fmtPct(topDept.pct)} de las unidades retiradas.` : 'Ningún departamento registró retiros.',
        totals.devoluciones.units ? `Se devolvieron ${fmtInt(totals.devoluciones.units)} unidades. Esas devoluciones no se suman al ranking de salidas.` : 'No hubo devoluciones en el período.',
      ],
      recommendations: [
        top[0] ? `Revisar la reposición y la ubicación de ${top[0].name}: concentra ${fmtPct(top[0].share)} de las salidas.` : 'Cuando existan salidas, este reporte identificará los productos de mayor demanda.',
        'Contrastar el consumo de cada departamento con su planificación de materiales.',
      ],
    };
  }

  function ranking(base, period, departmentId, detail) {
    const rank = inventory.ranking({ period, departmentId });
    const state = store.getState();
    const deptFilter = departmentId ? deptName(state, departmentId) : null;
    const top = rank.rows[0];
    const summary = rank.totalUnits
      ? `En ${period.label}${deptFilter ? `, para ${deptFilter}` : ''}, se retiraron ${fmtInt(rank.totalUnits)} unidades en ${countOf(rank.totalMovements, 'movimiento', 'movimientos')}. `
        + (top ? `El primer lugar es ${top.name} (${top.sku}) con ${fmtInt(top.units)} unidades (${fmtPct(top.share)}). ` : '')
        + (top && top.departments.length > 1 ? `Ese producto fue solicitado por ${joinList(top.departments.map((d) => d.name))}, sin asignarlo a un solo departamento.` : '')
      : `No hubo salidas en ${period.label}${deptFilter ? ` para ${deptFilter}` : ''}.`;
    return {
      ...base,
      periodLabel: deptFilter ? `${period.label} · ${deptFilter}` : period.label,
      executiveSummary: summary,
      kpis: [
        { label: 'Unidades retiradas', value: fmtInt(rank.totalUnits), hint: 'Suma de todas las salidas' },
        { label: 'Movimientos', value: fmtInt(rank.totalMovements), hint: 'Cantidad de retiros' },
        { label: 'SKU con salida', value: fmtInt(rank.rows.length), hint: 'Productos distintos' },
        { label: 'Devoluciones (no suman)', value: fmtInt(rank.returnsUnits), hint: 'Unidades devueltas' },
      ],
      charts: [
        { type: 'bar', title: 'Top 10 de unidades retiradas', items: rank.rows.slice(0, 10).map((r) => ({ label: r.sku, value: r.units, hint: r.name })) },
        { type: 'bar', title: 'Participación por departamento', items: rank.departments.map((d) => ({ label: d.name, value: d.units })) },
      ],
      sections: [{
        title: 'Ranking',
        paragraphs: ['Las unidades retiradas y el número de movimientos se muestran por separado. Si un SKU lo pidieron varias áreas, se indica el desglose.'],
        table: {
          columns: [
            { key: 'position', label: 'Puesto' },
            { key: 'sku', label: 'Código SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'units', label: 'Unidades retiradas', format: (v) => fmtInt(v) },
            { key: 'movements', label: 'N° de movimientos', format: (v) => fmtInt(v) },
            { key: 'share', label: 'Participación', format: (v) => fmtPct(v) },
            { key: 'departmentLabel', label: 'Departamento' },
            { key: 'returnsUnits', label: 'Devueltas', format: (v) => fmtInt(v) },
          ],
          rows: detail ? rank.rows : rank.rows.slice(0, 20),
        },
      }, detail ? {
        title: 'Desglose por departamento (SKU con más de un área)',
        table: {
          columns: [
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'dept', label: 'Departamento' },
            { key: 'units', label: 'Unidades', format: (v) => fmtInt(v) },
            { key: 'pct', label: 'Sobre el SKU', format: (v) => fmtPct(v) },
          ],
          rows: rank.rows.filter((r) => r.departments.length > 1).flatMap((r) => r.departments.map((d) => ({ sku: r.sku, name: r.name, dept: d.name, units: d.units, pct: d.pct }))),
        },
      } : null].filter(Boolean),
      conclusions: [
        rank.rows.length ? `Los tres productos con más salida son: ${joinList(topNames(rank.rows, 3, (r) => r.name, (r) => r.units))}.` : 'Sin datos de salida en el período.',
        rank.departments[0] ? `${rank.departments[0].name} concentra ${fmtPct(rank.departments[0].pct)} de las unidades retiradas.` : 'Sin consumo por departamento.',
      ],
      recommendations: [
        'Usar este ranking para priorizar el abastecimiento y ubicar los productos de mayor demanda en posiciones accesibles.',
        'Si un SKU aparece en varios departamentos, planificar el stock considerando la suma de todas las áreas, no solo una.',
      ],
    };
  }

  function departamentos(base, period, detail) {
    const depts = inventory.departmentTotals(period);
    const monthly = inventory.departmentMonthly(6);
    const top = depts[0];
    const summary = top
      ? `En ${period.label} el departamento de ${top.name} retiró ${fmtInt(top.units)} unidades (${fmtPct(top.pct)} del total), en ${countOf(top.movements, 'movimiento', 'movimientos')}. `
        + (depts[1] ? `Le sigue ${depts[1].name} con ${fmtInt(depts[1].units)} unidades.` : '')
      : `Ningún departamento registró salidas en ${period.label}.`;
    return {
      ...base,
      periodLabel: period.label,
      executiveSummary: summary,
      kpis: depts.slice(0, 4).map((d) => ({ label: d.name, value: fmtInt(d.units), hint: `${fmtPct(d.pct)} · ${fmtInt(d.movements)} movimientos` })),
      charts: [
        { type: 'bar', title: 'Unidades retiradas por departamento', items: depts.map((d) => ({ label: d.name, value: d.units })) },
        { type: 'grouped', title: 'Comparación mensual entre departamentos', months: monthly.months, series: monthly.departments.slice(0, 6).map((d) => ({ label: d.name, values: d.values })) },
      ],
      sections: [{
        title: 'Consumo por departamento',
        table: {
          columns: [
            { key: 'name', label: 'Departamento' },
            { key: 'units', label: 'Unidades retiradas', format: (v) => fmtInt(v) },
            { key: 'movements', label: 'Movimientos', format: (v) => fmtInt(v) },
            { key: 'pct', label: 'Participación', format: (v) => fmtPct(v) },
            { key: 'returns', label: 'Devueltas', format: (v) => fmtInt(v) },
          ],
          rows: depts,
        },
      }, detail ? {
        title: 'Serie mensual (unidades)',
        table: {
          columns: [
            { key: 'name', label: 'Departamento' },
            ...monthly.months.map((m, i) => ({ key: `m${i}`, label: m.label, format: (v) => fmtInt(v) })),
            { key: 'total', label: 'Total', format: (v) => fmtInt(v) },
          ],
          rows: monthly.departments.map((d) => {
            const row = { name: d.name, total: d.total };
            d.values.forEach((v, i) => { row[`m${i}`] = v; });
            return row;
          }),
        },
      } : null].filter(Boolean),
      conclusions: [
        top ? `${top.name} es el principal consumidor del período.` : 'No hay consumo que comparar.',
        depts.length > 1 ? `Los departamentos con consumo son ${joinList(depts.filter((d) => d.units > 0).map((d) => d.name))}.` : 'Solo un área registra retiros, o ninguna.',
      ],
      recommendations: [
        'Revisar con cada jefatura si el retiro coincide con lo planificado.',
        'Los productos compartidos entre áreas deben dimensionarse por la suma de ambos consumos.',
      ],
    };
  }

  function quiebres(base, alerts, detail) {
    const zero = alerts.filter((a) => a.level === 'critico');
    const risk = alerts.filter((a) => a.atRisk);
    const summary = zero.length
      ? `Se identificaron ${countOf(zero.length, 'producto sin existencias', 'productos sin existencias')}: ${joinList(zero.slice(0, 5).map((a) => `${a.name} (${a.sku})`))}${zero.length > 5 ? ' y otros' : ''}. `
        + `Además, ${countOf(risk.length, 'producto tiene', 'productos tienen')} existencias, pero no alcanzarían a cubrir el tiempo que tarda el proveedor.`
      : `No hay productos sin existencias. ${countOf(risk.length, 'producto presenta', 'productos presentan')} riesgo de quedarse sin stock antes de que llegue el proveedor.`;
    const rows = detail ? [...zero, ...alerts.filter((a) => a.atRisk && a.level !== 'critico')] : zero;
    return {
      ...base,
      periodLabel: `Al ${fmtDate(base.generatedAt)}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Sin existencias', value: fmtInt(zero.length), hint: 'No quedó ninguna unidad', tone: zero.length ? 'critico' : null },
        { label: 'Con riesgo de quiebre', value: fmtInt(risk.length), hint: 'La cobertura es menor al plazo del proveedor' },
        { label: 'Sugeridos a reponer (críticos)', value: fmtInt(zero.reduce((s, a) => s + a.suggestedQty, 0)), hint: 'Suma de cantidades sugeridas' },
      ],
      charts: [
        { type: 'bar', title: 'Cobertura (días) de productos en riesgo', items: [...zero, ...risk].filter((a, i, arr) => arr.findIndex((x) => x.sku === a.sku) === i).slice(0, 10).map((a) => ({ label: a.sku, value: Number.isFinite(a.coverageDays) ? a.coverageDays : 0, hint: a.name })) },
      ],
      sections: [{
        title: 'Productos sin existencias o con riesgo',
        paragraphs: ['Un producto “sin existencias” no tiene ninguna unidad en bodega (stock físico 0). Si todavía queda algo, aunque esté bajo el mínimo, no entra aquí. Un producto “en riesgo” todavía tiene stock, pero no alcanza para esperar al proveedor.'],
        table: {
          columns: [
            { key: 'levelLabel', label: 'Estado' },
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'available', label: 'Disponible', format: (v) => fmtInt(v) },
            { key: 'coverageDays', label: 'Cobertura', format: (v) => fmtDays(v) },
            { key: 'leadTimeDays', label: 'Plazo proveedor (días)', format: (v) => fmtInt(v) },
            { key: 'suggestedQty', label: 'Cantidad sugerida', format: (v) => fmtInt(v) },
            { key: 'reasons', label: 'Explicación', format: (v) => (Array.isArray(v) ? v.join(' ') : v) },
          ],
          rows,
        },
      }],
      conclusions: [
        zero.length ? `Los productos sin stock son ${joinList(zero.map((a) => a.sku))}.` : 'No hay quiebres de stock en este momento.',
        risk.length ? `${countOf(risk.length, 'producto adicional está', 'productos adicionales están')} en riesgo de agotarse.` : 'No se detecta riesgo adicional de quiebre por cobertura.',
      ],
      recommendations: zero.length
        ? zero.slice(0, 4).map((a) => `El producto ${a.sku} ${coverageText(a.coverageDays)}. Como el proveedor tarda ${fmtInt(a.leadTimeDays)} días, se recomienda gestionar su reposición${a.suggestedQty ? ` por ${fmtInt(a.suggestedQty)} ${a.unit}` : ''}.`)
        : ['Mantener la revisión periódica de cobertura frente al plazo de cada proveedor.'],
    };
  }

  function minimo(base, alerts, detail) {
    const low = alerts.filter((a) => a.level === 'atencion');
    const summary = low.length
      ? `Hay ${countOf(low.length, 'producto', 'productos')} con stock disponible por debajo del mínimo configurado: ${joinList(low.slice(0, 6).map((a) => a.name))}. Estos artículos todavía tienen existencias, pero ya están fuera del rango de seguridad definido.`
      : 'Ningún producto activo está bajo el stock mínimo. Los que no tienen existencias se informan en el reporte de quiebres.';
    return {
      ...base,
      periodLabel: `Al ${fmtDate(base.generatedAt)}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Bajo el mínimo', value: fmtInt(low.length), hint: 'Estado Atención' },
        { label: 'Unidades faltantes al mínimo', value: fmtInt(low.reduce((s, a) => s + Math.max(0, a.minStock - a.available), 0)), hint: 'Suma de lo que falta para llegar al mínimo' },
      ],
      charts: [
        { type: 'bar', title: 'Disponible vs. mínimo', items: low.slice(0, 12).map((a) => ({ label: a.sku, value: a.available, hint: `mínimo ${a.minStock}` })) },
      ],
      sections: [{
        title: 'Productos bajo el stock mínimo',
        table: {
          columns: [
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'available', label: 'Disponible', format: (v) => fmtInt(v) },
            { key: 'minStock', label: 'Mínimo', format: (v) => fmtInt(v) },
            { key: 'reorderPoint', label: 'Punto de reposición', format: (v) => fmtInt(v) },
            { key: 'avgDaily', label: 'Consumo diario', format: (v) => fmtUnits(v) },
            { key: 'coverageDays', label: 'Cobertura', format: (v) => fmtDays(v) },
            { key: 'suggestedQty', label: 'Sugerido', format: (v) => fmtInt(v) },
          ],
          rows: low,
        },
      }],
      conclusions: [
        low.length ? `El más urgente bajo el mínimo es ${low[0].name}, con ${fmtInt(low[0].available)} ${low[0].unit} disponibles y un mínimo de ${fmtInt(low[0].minStock)}.` : 'No hay productos bajo el mínimo.',
      ],
      recommendations: low.length
        ? ['Reponer primero los que además tienen poca cobertura respecto del plazo del proveedor.', 'Revisar si el mínimo configurado sigue siendo realista para el consumo actual.']
        : ['Conservar los mínimos actuales y volver a revisar este reporte después de cada jornada de salidas.'],
    };
  }

  function reposicion(base, alerts, detail) {
    const need = alerts.filter((a) => a.suggestedQty > 0).sort((a, b) => ALERT_LEVELS[a.level].order - ALERT_LEVELS[b.level].order || b.suggestedQty - a.suggestedQty);
    const summary = need.length
      ? `Se sugiere reponer ${countOf(need.length, 'producto', 'productos')}. La mayor urgencia está en ${joinList(need.filter((a) => a.level === 'critico' || a.level === 'atencion').slice(0, 4).map((a) => a.name) || need.slice(0, 3).map((a) => a.name))}. `
        + 'Estas cifras son recomendaciones de esta plataforma; no se ha creado ninguna solicitud de compra ni se ha enviado un pedido a un proveedor.'
      : 'Con el stock disponible y lo que está pendiente de recibir, no se sugiere reponer ningún producto en este momento.';
    return {
      ...base,
      periodLabel: `Al ${fmtDate(base.generatedAt)}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Productos a reponer', value: fmtInt(need.length), hint: 'Con cantidad sugerida mayor a cero' },
        { label: 'Unidades sugeridas', value: fmtInt(need.reduce((s, a) => s + a.suggestedQty, 0)), hint: 'Suma de recomendaciones' },
        { label: 'Críticos en la lista', value: fmtInt(need.filter((a) => a.level === 'critico').length), hint: 'Sin existencias' },
      ],
      charts: [
        { type: 'bar', title: 'Cantidad sugerida por SKU', items: need.slice(0, 12).map((a) => ({ label: a.sku, value: a.suggestedQty, hint: a.name })) },
      ],
      sections: [{
        title: 'Recomendaciones',
        paragraphs: [
          'La cantidad sugerida considera la demanda durante el tiempo de reposición del proveedor, el stock de seguridad, lo disponible, lo pendiente de recibir, lo comprometido y, si está configurado, el múltiplo o el mínimo de compra.',
          'No se generan órdenes de compra en esta etapa.',
        ],
        table: {
          columns: [
            { key: 'levelLabel', label: 'Prioridad' },
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'available', label: 'Disponible', format: (v) => fmtInt(v) },
            { key: 'pending', label: 'Por recibir', format: (v) => fmtInt(v) },
            { key: 'leadTimeDays', label: 'Plazo (días)', format: (v) => fmtInt(v) },
            { key: 'suggestedQty', label: 'Cantidad sugerida', format: (v) => fmtInt(v) },
            { key: 'unit', label: 'Unidad' },
            { key: 'calc', label: 'Cálculo', format: (_, r) => (detail ? r.replenishment.steps.join(' ') : r.replenishment.steps[r.replenishment.steps.length - 1]) },
          ],
          rows: need,
        },
      }],
      conclusions: [
        need.length ? `La recomendación más urgente es ${need[0].name}: ${fmtInt(need[0].suggestedQty)} ${need[0].unit}.` : 'No hay reposición sugerida.',
        'Una futura integración con Dynamics podría convertir estas recomendaciones en borradores de solicitud, siempre con aprobación humana.',
      ],
      recommendations: [
        'Revisar primero los productos en estado Crítico y Atención.',
        'Confirmar con el proveedor el plazo real antes de ajustar los parámetros.',
        'No enviar pedidos automáticos: esta pantalla solo informa.',
      ],
    };
  }

  function historial(base, state, period, options, detail) {
    const type = options.movementType || null;
    const sku = options.sku || null;
    const rows = state.movements.filter((m) => {
      const ts = Date.parse(m.at);
      if (ts < period.from.getTime() || ts > period.to.getTime()) return false;
      if (type && m.type !== type) return false;
      if (sku && m.sku !== sku) return false;
      if (options.departmentId && m.departmentId !== options.departmentId) return false;
      return true;
    }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (b.id < a.id ? 1 : -1));
    const totals = inventory.periodTotals(period);
    const summary = `En ${period.label} se registraron ${countOf(rows.length, 'movimiento', 'movimientos')}`
      + `${type ? ` de tipo ${MOVEMENT_LABELS[type]}` : ''} `
      + `(${fmtInt(totals.entradas.moves)} entradas, ${fmtInt(totals.salidas.moves)} salidas, ${fmtInt(totals.traslados.moves)} traslados y ${fmtInt(totals.devoluciones.moves)} devoluciones en el período completo). `
      + 'El historial no se modifica: cada registro permanece tal como se confirmó.';
    const shown = detail ? rows : rows.slice(0, 40);
    return {
      ...base,
      periodLabel: period.label,
      executiveSummary: summary,
      kpis: [
        { label: 'Movimientos listados', value: fmtInt(rows.length), hint: 'Según los filtros aplicados' },
        { label: 'Entradas (período)', value: fmtInt(totals.entradas.units), hint: 'Unidades ingresadas' },
        { label: 'Salidas (período)', value: fmtInt(totals.salidas.units), hint: 'Unidades retiradas' },
        { label: 'Traslados (período)', value: fmtInt(totals.traslados.units), hint: 'Unidades movidas entre ubicaciones' },
      ],
      charts: [
        { type: 'donut', title: 'Movimientos por tipo (unidades del período)', centerCaption: 'unidades', items: [
          { label: 'Entradas', hint: 'Ingresos a bodega', value: totals.entradas.units, tone: 'normal' },
          { label: 'Salidas', hint: 'Retiros', value: totals.salidas.units, tone: 'atencion' },
          { label: 'Traslados', hint: 'Entre ubicaciones', value: totals.traslados.units, tone: 'precaucion' },
          { label: 'Devoluciones', hint: 'No suman como salida', value: totals.devoluciones.units, color: '#805ad5' },
        ] },
      ],
      sections: [{
        title: detail ? 'Historial completo del período' : 'Últimos movimientos del período',
        paragraphs: shown.length < rows.length ? [`Se muestran ${fmtInt(shown.length)} de ${fmtInt(rows.length)} movimientos. Use la vista detallada o exporte a Excel para ver todos.`] : [],
        table: {
          columns: [
            { key: 'at', label: 'Fecha y hora', format: (v) => fmtDateTime(v) },
            { key: 'type', label: 'Tipo', format: (v) => MOVEMENT_LABELS[v] || v },
            { key: 'id', label: 'Identificador' },
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto', format: (_, r) => state.products.find((p) => p.sku === r.sku)?.name || r.sku },
            { key: 'qty', label: 'Cantidad', format: (v) => fmtInt(v) },
            { key: 'from', label: 'Origen' },
            { key: 'to', label: 'Destino' },
            { key: 'departmentId', label: 'Departamento', format: (v) => (v ? deptName(state, v) : '—') },
            { key: 'responsible', label: 'Responsable' },
            { key: 'document', label: 'Documento' },
          ],
          rows: shown,
        },
      }],
      conclusions: [
        `El período contiene ${fmtInt(rows.length)} registros que coinciden con los filtros.`,
        'Ningún movimiento anterior se altera al registrar uno nuevo.',
      ],
      recommendations: [
        'Para una revisión contable o de auditoría, exporte el detalle a Excel o CSV.',
        'Si necesita un recuento por producto, use el reporte de ranking o el de salidas.',
      ],
    };
  }

  function ocupacion(base, state, detail) {
    const occ = inventory.occupancy();
    const dims = inventory.layoutDimensions();
    const details = state.locations.filter((l) => l.active).map((l) => inventory.locationDetail(l.code)).filter(Boolean);
    const fullest = [...details].sort((a, b) => b.capacityPct - a.capacityPct).slice(0, 8);
    const empty = details.filter((d) => d.usedUnits === 0).length;
    const summary = `La bodega ficticia tiene ${fmtInt(occ.total)} ubicaciones (${dims.aisles} pasillos, ${dims.racks} estanterías y ${dims.levels} niveles). `
      + `${fmtInt(occ.occupied)} están ocupadas (${fmtPct(occ.pct)}) y ${fmtInt(empty)} están libres. `
      + `Se usa el ${fmtPct(occ.capacityPct)} de la capacidad referencial en unidades.`;
    return {
      ...base,
      periodLabel: `Al ${fmtDate(base.generatedAt)}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Ubicaciones ocupadas', value: `${fmtInt(occ.occupied)} / ${fmtInt(occ.total)}`, hint: fmtPct(occ.pct) },
        { label: 'Ubicaciones libres', value: fmtInt(occ.free), hint: 'Sin existencias' },
        { label: 'Uso de capacidad', value: fmtPct(occ.capacityPct), hint: `${fmtInt(occ.usedUnits)} de ${fmtInt(occ.capacityUnits)} unidades` },
      ],
      charts: [
        { type: 'donut', title: 'Uso de las ubicaciones', centerCaption: 'posiciones', items: [
          { label: 'Ocupadas', hint: 'Hay al menos un SKU', value: occ.occupied, tone: 'atencion' },
          { label: 'Libres', hint: 'Sin existencias', value: occ.free, tone: 'normal' },
        ] },
      ],
      sections: [{
        title: 'Ubicaciones con mayor ocupación',
        table: {
          columns: [
            { key: 'code', label: 'Ubicación', format: (_, r) => r.location.code },
            { key: 'usedUnits', label: 'Unidades', format: (v) => fmtInt(v) },
            { key: 'capacityUnits', label: 'Capacidad', format: (v) => fmtInt(v) },
            { key: 'capacityPct', label: 'Uso', format: (v) => fmtPct(v) },
            { key: 'skus', label: 'Productos', format: (v) => v.map((s) => `${s.sku} (${fmtInt(s.qty)})`).join(', ') || '—' },
            { key: 'tier', label: 'Accesibilidad', format: (v) => v.label },
          ],
          rows: detail ? details.filter((d) => d.usedUnits > 0).sort((a, b) => b.usedUnits - a.usedUnits) : fullest,
        },
      }],
      conclusions: [
        occ.pct > 70 ? 'La mayoría de las posiciones tiene mercancía. Conviene liberar reservas de baja rotación.' : 'Hay holgura de posiciones para nuevas recepciones.',
        fullest[0] ? `La ubicación más cargada es ${fullest[0].location.code}, con ${fmtPct(fullest[0].capacityPct)} de su capacidad referencial.` : 'No hay ubicaciones ocupadas.',
      ],
      recommendations: [
        'Usar el mapa de calor del módulo de inventario para ver la actividad real de picking, que no es lo mismo que la ocupación.',
        'Los productos de mayor demanda deberían estar en las posiciones más accesibles (pasillo 1, nivel 2).',
      ],
    };
  }

  function abc(base, state, criterion, detail) {
    const crit = criterion || state.settings.abc.criterion;
    const data = inventory.abc(crit);
    const meta = ABC_CRITERIA.find((c) => c.id === crit) || ABC_CRITERIA[0];
    const all = inventory.allAbc();
    const summary = `Según el criterio «${meta.label}», ${fmtInt(data.summary.A.count)} productos son clase A (concentran ${fmtPct(data.summary.A.share)} del indicador), `
      + `${fmtInt(data.summary.B.count)} son clase B y ${fmtInt(data.summary.C.count)} son clase C. `
      + `${meta.explain} Este criterio no se mezcla con los demás: el valor económico y la frecuencia de retiro se analizan por separado.`;
    const rows = data.ordered.map((e) => {
      const p = state.products.find((x) => x.sku === e.sku);
      return { ...e, name: p?.name || e.sku, category: p?.category || '' };
    });
    return {
      ...base,
      periodLabel: `Criterio: ${meta.label}`,
      executiveSummary: summary,
      kpis: [
        { label: 'Clase A', value: fmtInt(data.summary.A.count), hint: fmtPct(data.summary.A.share) },
        { label: 'Clase B', value: fmtInt(data.summary.B.count), hint: fmtPct(data.summary.B.share) },
        { label: 'Clase C', value: fmtInt(data.summary.C.count), hint: fmtPct(data.summary.C.share) },
      ],
      charts: [
        { type: 'donut', title: `Participación por clase (${meta.metricLabel})`, centerCaption: '% del criterio', items: [
          { label: 'Clase A', hint: `${fmtInt(data.summary.A.count)} SKU`, value: data.summary.A.share, valueLabel: fmtPct(data.summary.A.share, 0), tone: 'critico' },
          { label: 'Clase B', hint: `${fmtInt(data.summary.B.count)} SKU`, value: data.summary.B.share, valueLabel: fmtPct(data.summary.B.share, 0), tone: 'precaucion' },
          { label: 'Clase C', hint: `${fmtInt(data.summary.C.count)} SKU`, value: data.summary.C.share, valueLabel: fmtPct(data.summary.C.share, 0), color: '#2b6cb0' },
        ] },
      ],
      sections: [{
        title: 'Clasificación',
        paragraphs: [meta.explain],
        table: {
          columns: [
            { key: 'rank', label: 'Orden' },
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'cls', label: 'Clase' },
            { key: 'metric', label: meta.metricLabel, format: (v) => fmtNum(v, 1) },
            { key: 'share', label: 'Participación', format: (v) => fmtPct(v) },
            { key: 'cumulative', label: 'Acumulado', format: (v) => fmtPct(v) },
          ],
          rows: detail ? rows : rows.slice(0, 20),
        },
      }, {
        title: 'Los cuatro criterios, lado a lado (primeros SKU)',
        paragraphs: ['Un mismo producto puede ser A por valor y C por frecuencia. Por eso los criterios no se combinan en una sola letra.'],
        table: {
          columns: [
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'valor', label: 'Por valor' },
            { key: 'frecuencia', label: 'Por frecuencia' },
            { key: 'rotacion', label: 'Por rotación' },
            { key: 'volumen', label: 'Por volumen' },
          ],
          rows: state.products.filter((p) => p.active).slice(0, detail ? 99 : 15).map((p) => ({
            sku: p.sku,
            name: p.name,
            valor: all.valor.items.get(p.sku)?.cls || '—',
            frecuencia: all.frecuencia.items.get(p.sku)?.cls || '—',
            rotacion: all.rotacion.items.get(p.sku)?.cls || '—',
            volumen: all.volumen.items.get(p.sku)?.cls || '—',
          })),
        },
      }],
      conclusions: [
        `La clase A reúne ${fmtInt(data.summary.A.count)} SKU y ${fmtPct(data.summary.A.share)} del indicador «${meta.label}».`,
        'La ubicación física debería priorizar los A de frecuencia de picking en las posiciones más accesibles; los A de valor, en control y resguardo.',
      ],
      recommendations: [
        'No usar un único ABC para todas las decisiones: elija el criterio según la pregunta (dinero, esfuerzo de picking, rotación o volumen).',
        'Revisar en el layout si los productos clase A de frecuencia están cerca del despacho.',
      ],
    };
  }

  function evolucion(base, period, options, detail) {
    const gran = options.granularity || (period.id === 'anio_actual' || period.id === 'ult_6_meses' ? 'mes' : 'semana');
    const series = inventory.consumptionSeries(period, gran, { sku: options.sku || null, departmentId: options.departmentId || null });
    const total = series.reduce((s, b) => s + b.units, 0);
    const peak = series.reduce((a, b) => (b.units > a.units ? b : a), series[0] || { units: 0, label: '—' });
    const summary = `En ${period.label} se retiraron ${fmtInt(total)} unidades`
      + `${options.sku ? ` del producto ${options.sku}` : ''}`
      + `${options.departmentId ? ` por ${deptName(store.getState(), options.departmentId)}` : ''}. `
      + (peak ? `El tramo con más salida fue ${peak.label}, con ${fmtInt(peak.units)} unidades.` : '');
    return {
      ...base,
      periodLabel: period.label,
      executiveSummary: summary,
      kpis: [
        { label: 'Unidades del período', value: fmtInt(total), hint: 'Salidas' },
        { label: 'Tramo más alto', value: peak?.label || '—', hint: peak ? `${fmtInt(peak.units)} unidades` : '' },
        { label: 'Promedio por tramo', value: fmtInt(series.length ? total / series.length : 0), hint: gran },
      ],
      charts: [
        { type: 'line', title: 'Unidades retiradas', items: series.map((b) => ({ label: b.label, value: b.units })) },
      ],
      sections: [{
        title: 'Serie',
        table: {
          columns: [
            { key: 'label', label: 'Tramo' },
            { key: 'units', label: 'Unidades retiradas', format: (v) => fmtInt(v) },
            { key: 'movements', label: 'Movimientos', format: (v) => fmtInt(v) },
            { key: 'returns', label: 'Devueltas', format: (v) => fmtInt(v) },
          ],
          rows: series,
        },
      }],
      conclusions: [
        total ? `El consumo del período suma ${fmtInt(total)} unidades.` : 'No hay consumo en el período.',
        peak && peak.units ? `${peak.label} concentra el mayor retiro.` : 'La serie está vacía o es plana.',
      ],
      recommendations: [
        'Si un tramo se dispara, revisar si hubo un evento puntual (mantención, campaña) antes de subir el stock permanente.',
        'Compare este gráfico con el reporte de comparación entre períodos para ver si el cambio es reciente.',
      ],
    };
  }

  function comparacion(base, period, compare, detail) {
    const a = inventory.periodTotals(period);
    const b = inventory.periodTotals(compare);
    const rankA = inventory.ranking({ period });
    const rankB = inventory.ranking({ period: compare });
    const deptA = inventory.departmentTotals(period);
    const alerts = inventory.alerts();
    const summary = `Se compara ${period.label} con ${compare.label}. `
      + changeText(a.salidas.units, b.salidas.units, 'unidades retiradas')
      + ` Los movimientos de salida pasaron de ${fmtInt(b.salidas.moves)} a ${fmtInt(a.salidas.moves)}. `
      + `Hoy hay ${fmtInt(alerts.filter((x) => x.level === 'critico').length)} productos sin existencias y ${fmtInt(alerts.filter((x) => x.atRisk).length)} con riesgo de quiebre.`;
    const mapB = new Map(rankB.rows.map((r) => [r.sku, r]));
    const delta = rankA.rows.map((r) => {
      const prev = mapB.get(r.sku);
      return { sku: r.sku, name: r.name, current: r.units, previous: prev ? prev.units : 0, delta: r.units - (prev ? prev.units : 0) };
    }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return {
      ...base,
      periodLabel: `${period.label} vs. ${compare.label}`,
      executiveSummary: summary,
      kpis: [
        { label: `Unidades (${period.label})`, value: fmtInt(a.salidas.units), hint: 'Período reciente' },
        { label: `Unidades (${compare.label})`, value: fmtInt(b.salidas.units), hint: 'Período de comparación' },
        { label: 'Diferencia', value: `${a.salidas.units - b.salidas.units >= 0 ? '+' : ''}${fmtInt(a.salidas.units - b.salidas.units)}`, hint: 'Unidades' },
        { label: 'Entradas recientes', value: fmtInt(a.entradas.units), hint: period.label },
      ],
      charts: [
        { type: 'grouped', title: 'Entradas y salidas', months: [{ label: compare.label }, { label: period.label }], series: [
          { label: 'Salidas', values: [b.salidas.units, a.salidas.units] },
          { label: 'Entradas', values: [b.entradas.units, a.entradas.units] },
        ] },
      ],
      sections: [{
        title: 'SKU con mayor cambio de salida',
        table: {
          columns: [
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Producto' },
            { key: 'previous', label: compare.label, format: (v) => fmtInt(v) },
            { key: 'current', label: period.label, format: (v) => fmtInt(v) },
            { key: 'delta', label: 'Diferencia', format: (v) => `${v > 0 ? '+' : ''}${fmtInt(v)}` },
          ],
          rows: (detail ? delta : delta.slice(0, 15)),
        },
      }, {
        title: 'Departamentos en el período reciente',
        table: {
          columns: [
            { key: 'name', label: 'Departamento' },
            { key: 'units', label: 'Unidades', format: (v) => fmtInt(v) },
            { key: 'pct', label: 'Participación', format: (v) => fmtPct(v) },
          ],
          rows: deptA,
        },
      }],
      conclusions: [
        changeText(a.salidas.units, b.salidas.units, 'unidades retiradas'),
        rankA.rows[0] ? `El producto más retirado del período reciente es ${rankA.rows[0].name}.` : 'El período reciente no tiene salidas.',
      ],
      recommendations: [
        'Si el consumo subió de forma sostenida, revise mínimos y puntos de reposición; si fue un evento puntual, no cambie los parámetros de inmediato.',
        'Los productos que aparecen como críticos hoy deben reponerse aunque el período anterior haya sido holgado.',
      ],
    };
  }

  return {
    types: REPORT_TYPES,
    presets: PERIOD_PRESETS,
    build,
    compareDefault: (now) => ({
      recent: resolvePeriod('mes_actual', now),
      previous: resolvePeriod('mes_anterior', now),
      previousAlt: resolvePeriod('mes_anterior', addMonths(now, 0)),
    }),
  };
}
