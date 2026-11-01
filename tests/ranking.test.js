import { assert, eq, group, test } from './framework.js';
import { NOW, exitOp, makeEnv } from './env.js';
import { buildIndex, getQtyAt } from '../src/domain/stock.js';
import { resolvePeriod } from '../src/core/dates.js';

group('Ranking', () => {
  test('no cuenta devoluciones como salidas positivas', () => {
    const env = makeEnv();
    const period = resolvePeriod('mes_actual', NOW);
    const sku = 'SKU-010';
    const before = env.inventory.ranking({ period }).rows.find((r) => r.sku === sku);
    const idx = buildIndex(env.store.getState());
    const loc = [...(idx.stockBySku.get(sku)?.keys() || [])][0];
    assert(loc, 'SKU-010 debe tener stock');
    const qty = Math.min(2, getQtyAt(idx, sku, loc));
    assert(env.movements.register(exitOp({
      departmentId: 'DEP-SSO',
      lines: [{ sku, qty, from: loc }],
    })).ok);
    assert(env.movements.register({
      type: 'DEVOLUCION',
      at: new Date(NOW.getTime() - 500),
      responsible: 'Iván Vega',
      document: 'DEV-TEST-1',
      departmentId: 'DEP-SSO',
      lines: [{ sku, qty, to: loc }],
    }).ok);
    const after = env.inventory.ranking({ period }).rows.find((r) => r.sku === sku);
    eq(after.units, (before?.units || 0) + qty, 'Las unidades retiradas deben incluir la salida');
    assert(after.returnsUnits >= qty, 'La devolución debe informarse aparte');
    assert(after.netUnits === after.units - after.returnsUnits);
  });

  test('desglosa un SKU pedido por varios departamentos', () => {
    const env = makeEnv();
    const period = resolvePeriod('anio_actual', NOW);
    const rank = env.inventory.ranking({ period });
    const multi = rank.rows.find((r) => r.departments.length > 1);
    assert(multi, 'Debe existir un SKU con más de un departamento en el año');
    const sum = multi.departments.reduce((s, d) => s + d.units, 0);
    eq(sum, multi.units);
    assert(multi.departmentLabel.startsWith('Varios departamentos'));
  });

  test('ordena de mayor a menor cantidad retirada', () => {
    const env = makeEnv();
    const rows = env.inventory.ranking({ period: resolvePeriod('ult_6_meses', NOW) }).rows;
    for (let i = 1; i < rows.length; i++) {
      assert(rows[i - 1].units >= rows[i].units, 'El ranking no está ordenado');
      eq(rows[i].position, i + 1);
    }
  });
});
