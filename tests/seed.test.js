import { assert, eq, group, test } from './framework.js';
import { NOW, makeEnv, seedState } from './env.js';
import { buildIndex } from '../src/domain/stock.js';

group('Datos de demostración', () => {
  test('son deterministas: dos generaciones con la misma fecha son idénticas', () => {
    const a = JSON.stringify(seedState());
    const b = JSON.stringify(seedState());
    assert(a === b, 'Las dos generaciones difieren: hay aleatoriedad no controlada');
  });

  test('cumplen el mínimo exigido (30 SKU, varias categorías y departamentos)', () => {
    const s = seedState();
    assert(s.products.length >= 30, `Solo hay ${s.products.length} SKU`);
    assert(new Set(s.products.map((p) => p.category)).size >= 6, 'Pocas categorías');
    assert(s.departments.length >= 6, 'Pocos departamentos');
    assert(s.meta.demo === true, 'El estado debe estar marcado como demostración');
    assert(s.movements.length > 1000, 'Historial demasiado corto');
  });

  test('las referencias entre datos son consistentes', () => {
    const s = seedState();
    const skus = new Set(s.products.map((p) => p.sku));
    const locs = new Set(s.locations.map((l) => l.code));
    const depts = new Set(s.departments.map((d) => d.id));
    const suppliers = new Set(s.suppliers.map((x) => x.id));
    eq(skus.size, s.products.length, 'SKU duplicados');
    eq(locs.size, s.locations.length, 'Ubicaciones duplicadas');
    for (const p of s.products) {
      assert(suppliers.has(p.params.supplierId), `Proveedor inexistente en ${p.sku}`);
      assert(depts.has(p.departmentId), `Departamento inexistente en ${p.sku}`);
      assert(p.params.reorderPoint >= p.params.minStock, `Punto de reposición menor al mínimo en ${p.sku}`);
    }
    for (const r of s.stock) {
      assert(skus.has(r.sku) && locs.has(r.location), `Existencia con referencia inválida ${r.sku}/${r.location}`);
      assert(r.qty > 0 && Number.isInteger(r.qty), `Cantidad inválida en ${r.sku}/${r.location}`);
    }
    const ids = new Set();
    for (const m of s.movements) {
      assert(!ids.has(m.id), `Movimiento duplicado ${m.id}`);
      ids.add(m.id);
      assert(skus.has(m.sku), `SKU inexistente en ${m.id}`);
      assert(Number.isInteger(m.qty) && m.qty > 0, `Cantidad inválida en ${m.id}`);
      if (m.from) assert(locs.has(m.from), `Origen inexistente en ${m.id}`);
      if (m.to) assert(locs.has(m.to), `Destino inexistente en ${m.id}`);
      if (m.type === 'SALIDA') assert(m.from && !m.to && depts.has(m.departmentId), `Salida mal formada ${m.id}`);
      if (m.type === 'ENTRADA') assert(!m.from && m.to, `Entrada mal formada ${m.id}`);
      if (m.type === 'TRASLADO') assert(m.from && m.to && m.from !== m.to, `Traslado mal formado ${m.id}`);
      if (m.type === 'DEVOLUCION') assert(!m.from && m.to && depts.has(m.departmentId), `Devolución mal formada ${m.id}`);
      assert(Date.parse(m.at) <= NOW.getTime(), `Movimiento futuro ${m.id}`);
    }
  });

  test('las existencias coinciden con el historial y nunca hubo inventario negativo', () => {
    const s = seedState();
    const bal = new Map();
    const add = (sku, loc, d, id) => {
      const k = `${sku}|${loc}`;
      const v = (bal.get(k) || 0) + d;
      assert(v >= 0, `Inventario negativo en ${k} tras ${id}`);
      bal.set(k, v);
    };
    const ordered = [...s.movements].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : 1));
    for (const m of ordered) {
      if (m.from) add(m.sku, m.from, -m.qty, m.id);
      if (m.to) add(m.sku, m.to, m.qty, m.id);
    }
    const expected = new Map(s.stock.map((r) => [`${r.sku}|${r.location}`, r.qty]));
    for (const [k, v] of bal) assert((expected.get(k) || 0) === v, `Existencia distinta al historial en ${k}: historial ${v}, estado ${expected.get(k) || 0}`);
    for (const [k, v] of expected) assert((bal.get(k) || 0) === v, `Existencia sin respaldo en el historial: ${k}`);
  });

  test('los identificadores de movimiento son correlativos y coinciden con el contador', () => {
    const s = seedState();
    s.movements.forEach((m, i) => eq(m.id, `MOV-${String(i + 1).padStart(6, '0')}`, 'Correlativo roto'));
    eq(s.meta.movementSeq, s.movements.length);
    eq(s.meta.operationSeq, new Set(s.movements.map((m) => m.operationId)).size);
  });

  test('incluyen agotados, bajo mínimo, riesgo, precaución y normales', () => {
    const { inventory } = makeEnv();
    const alerts = inventory.alerts();
    const by = (level) => alerts.filter((a) => a.level === level).length;
    eq(by('critico'), 4, 'Productos agotados');
    eq(by('atencion'), 5, 'Productos bajo el mínimo');
    assert(by('precaucion') >= 3, `Pocos en precaución: ${by('precaucion')}`);
    assert(by('normal') >= 15, `Pocos normales: ${by('normal')}`);
    assert(alerts.filter((a) => a.atRisk).length >= 2, 'Debe haber productos con riesgo de quiebre');
  });

  test('incluyen alta, media y baja rotación', () => {
    const { inventory } = makeEnv();
    const daily = inventory.alerts().map((a) => a.avgDaily);
    assert(daily.every((d) => Number.isInteger(d)), 'El consumo diario debe ser entero');
    assert(daily.filter((d) => d >= 5).length >= 4, 'Faltan productos de alta rotación');
    assert(daily.filter((d) => d >= 2 && d < 5).length >= 4, 'Faltan productos de media rotación');
    assert(daily.filter((d) => d <= 1).length >= 6, 'Faltan productos de baja rotación');
  });

  test('hay distintos tiempos de reposición y parámetros mínimos', () => {
    const s = seedState();
    assert(new Set(s.products.map((p) => p.params.leadTimeDays)).size >= 6, 'Pocos plazos distintos');
    assert(new Set(s.products.map((p) => p.params.minStock)).size >= 10, 'Pocos mínimos distintos');
  });

  test('algunos SKU están repartidos en varias ubicaciones y algunas ubicaciones tienen varios SKU', () => {
    const { store } = makeEnv();
    const idx = buildIndex(store.getState());
    const multiLoc = [...idx.stockBySku.values()].filter((m) => m.size > 1).length;
    assert(multiLoc >= 3, `Solo ${multiLoc} SKU en varias ubicaciones`);
    const multiSku = [...idx.stockByLocation.values()].filter((m) => m.size > 1).length;
    assert(multiSku >= 1, 'Ninguna ubicación contiene varios SKU');
  });

  test('las ubicaciones asignadas respetan las restricciones de manipulación', () => {
    const { inventory } = makeEnv();
    const bad = inventory.slotting().filter((r) => r.violatesRestriction);
    eq(bad.map((r) => r.sku), [], 'Productos en ubicaciones que violan su restricción');
  });

  test('los quiebres de stock incluyen los SKU que hoy están sin existencias', () => {
    const { inventory } = makeEnv();
    const empty = inventory.alerts().filter((a) => a.level === 'critico').map((a) => a.sku);
    assert(empty.length >= 1, 'La demostración debe tener productos agotados');
    const out = new Set(inventory.stockouts().map((r) => r.sku));
    for (const sku of empty) assert(out.has(sku), `${sku} está sin existencias y no aparece en quiebres`);
  });
});
