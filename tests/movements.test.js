import { assert, eq, group, test } from './framework.js';
import { NOW, exitOp, makeEnv } from './env.js';
import { buildIndex, getQtyAt, getTotal } from '../src/domain/stock.js';
import { evaluateAll } from '../src/domain/alerts.js';
import { buildRanking } from '../src/domain/ranking.js';
import { resolvePeriod } from '../src/core/dates.js';

group('Movimientos', () => {
  test('una salida válida descuenta stock y no permite inventario negativo', () => {
    const env = makeEnv();
    const idx = buildIndex(env.store.getState());
    const sku = 'SKU-002';
    const loc = [...idx.stockBySku.get(sku).keys()][0];
    const before = getQtyAt(idx, sku, loc);
    const qty = Math.min(2, before);
    const result = env.movements.register(exitOp({
      lines: [{ sku, qty, from: loc }],
    }));
    assert(result.ok, result.errors?.[0]?.message || 'debió registrar');
    const after = buildIndex(env.store.getState());
    eq(getQtyAt(after, sku, loc), before - qty);
    const denied = env.movements.register(exitOp({
      document: 'REQ-TEST-2',
      lines: [{ sku, qty: getQtyAt(after, sku, loc) + 5, from: loc }],
    }));
    assert(!denied.ok, 'No debió permitir stock insuficiente');
    eq(getQtyAt(buildIndex(env.store.getState()), sku, loc), before - qty);
  });

  test('una operación de varias líneas es atómica: si una falla, no se registra ninguna', () => {
    const env = makeEnv();
    const idx = buildIndex(env.store.getState());
    const sku = 'SKU-002';
    const loc = [...idx.stockBySku.get(sku).keys()][0];
    const before = env.store.getState().stock.map((r) => `${r.sku}|${r.location}|${r.qty}`).join(';');
    const result = env.movements.register(exitOp({
      lines: [
        { sku, qty: 1, from: loc },
        { sku: 'SKU-NO-EXISTE', qty: 1, from: loc },
      ],
    }));
    assert(!result.ok);
    const after = env.store.getState().stock.map((r) => `${r.sku}|${r.location}|${r.qty}`).join(';');
    eq(after, before, 'El stock no debió cambiar');
  });

  test('una entrada aumenta el stock de la ubicación de destino', () => {
    const env = makeEnv();
    const loc = 'P01-E01-N01';
    const sku = 'SKU-031';
    const before = getTotal(buildIndex(env.store.getState()), sku);
    const result = env.movements.register({
      type: 'ENTRADA',
      at: new Date(NOW.getTime() - 1000),
      responsible: 'Iván Vega',
      document: 'GR-TEST-1',
      lines: [{ sku, qty: 4, to: loc }],
    });
    assert(result.ok, result.errors?.[0]?.message || 'entrada');
    eq(getTotal(buildIndex(env.store.getState()), sku), before + 4);
  });

  test('un traslado mueve unidades entre ubicaciones sin cambiar el total', () => {
    const env = makeEnv();
    const sku = 'SKU-002';
    const idx = buildIndex(env.store.getState());
    const from = [...idx.stockBySku.get(sku).keys()][0];
    const to = 'P04-E06-N04';
    const total = getTotal(idx, sku);
    const result = env.movements.register({
      type: 'TRASLADO',
      at: new Date(NOW.getTime() - 1000),
      responsible: 'Carlos Pérez (demo)',
      document: 'TRA-TEST-1',
      lines: [{ sku, qty: 1, from, to }],
    });
    assert(result.ok, result.errors?.[0]?.message || 'traslado');
    const after = buildIndex(env.store.getState());
    eq(getTotal(after, sku), total);
    assert(getQtyAt(after, sku, to) >= 1);
  });

  test('el historial es de solo agregar: los movimientos previos no cambian', () => {
    const env = makeEnv();
    const first = env.store.getState().movements[0];
    const snapshot = JSON.stringify(first);
    const idx = buildIndex(env.store.getState());
    const sku = 'SKU-002';
    const loc = [...idx.stockBySku.get(sku).keys()][0];
    env.movements.register(exitOp({ lines: [{ sku, qty: 1, from: loc }] }));
    eq(JSON.stringify(env.store.getState().movements[0]), snapshot);
  });
});

group('Actualización automática entre módulos', () => {
  test('una salida actualiza alertas, KPI y ranking desde el mismo estado', () => {
    const env = makeEnv();
    const sku = 'SKU-002';
    const period = resolvePeriod('mes_actual', NOW);
    const beforeRank = buildRanking(env.store.getState(), { period }).rows.find((r) => r.sku === sku)?.units || 0;
    const beforeKpi = env.inventory.kpis();
    const idx = buildIndex(env.store.getState());
    const loc = [...idx.stockBySku.get(sku).keys()][0];
    const qty = Math.min(3, getQtyAt(idx, sku, loc));
    assert(env.movements.register(exitOp({ departmentId: 'DEP-ADM', lines: [{ sku, qty, from: loc }] })).ok);
    const afterRank = buildRanking(env.store.getState(), { period }).rows.find((r) => r.sku === sku);
    assert(afterRank.units === beforeRank + qty, 'El ranking no sumó la salida');
    const alerts = evaluateAll(env.store.getState(), NOW);
    assert(alerts.some((a) => a.sku === sku));
    const afterKpi = env.inventory.kpis();
    eq(afterKpi.monthExitUnits, beforeKpi.monthExitUnits + qty);
  });
});
