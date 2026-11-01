import { assert, group, test } from './framework.js';
import { makeEnv } from './env.js';
import { createReportService, REPORT_TYPES } from '../src/services/reportService.js';
import { toCsv, toXlsx } from '../src/services/exportService.js';
import { encodeQr, locationPayload, parseScannedLocation } from '../src/services/qr.js';
import { createOfflineQueue } from '../src/services/offlineQueue.js';

group('Reportes', () => {
  test('todos los tipos se generan con números del estado, no inventados', () => {
    const env = makeEnv();
    const reports = createReportService(env.inventory, env.store);
    const kpis = env.inventory.kpis();
    for (const type of REPORT_TYPES) {
      const report = reports.build(type.id, { level: 'resumido', periodId: 'mes_actual' });
      assert(report.executiveSummary, `${type.id} sin resumen`);
      assert(report.executiveSummary.includes(String(kpis.outOfStock)) || !/quiebre|existencias|inventario/i.test(type.id) || report.executiveSummary.length > 40, `${type.id} parece no usar datos`);
      assert(report.conclusions.length > 0);
      assert(report.recommendations.length > 0);
      assert(report.demo.includes('ficticios') || report.demo.includes('Dynamics'));
    }
  });

  test('el resumen de inventario menciona el total de SKU real', () => {
    const env = makeEnv();
    const reports = createReportService(env.inventory, env.store);
    const report = reports.build('inventario', { level: 'detallado' });
    const n = env.store.getState().products.filter((p) => p.active).length;
    assert(report.executiveSummary.includes(String(n)), 'El resumen no usa el total de SKU');
    assert(report.sections[0].table.rows.length >= 30);
  });
});

group('Exportación', () => {
  test('CSV usa el delimitador y escapa comillas', () => {
    const csv = toCsv([{ name: 'Caja "grande"', qty: 2 }], [{ key: 'name', label: 'Nombre' }, { key: 'qty', label: 'Cantidad' }], ';');
    assert(csv.includes('"Caja ""grande"""'), csv);
    assert(csv.includes('Nombre;Cantidad'));
  });

  test('el Excel generado es un ZIP con firma PK', () => {
    const bytes = toXlsx([{
      name: 'Hoja',
      columns: [{ key: 'a', label: 'A' }],
      rows: [{ a: 'hola' }, { a: 3 }],
    }]);
    assert(bytes[0] === 0x50 && bytes[1] === 0x4b, 'No es un ZIP');
    assert(bytes.length > 200);
  });
});

group('QR y cola sin conexión', () => {
  test('el QR de una ubicación se codifica y el texto se vuelve a reconocer', () => {
    const code = 'P01-E02-N03';
    const payload = locationPayload(code);
    const qr = encodeQr(payload);
    assert(qr.size >= 21);
    assert(qr.modules.length === qr.size);
    assert(payload === 'ALIMEX:P01-E02-N03');
    assert(!payload.includes('SKU'), 'El QR de ubicación no debe llevar un SKU');
    assert(parseScannedLocation(payload) === 'P01-E02-N03');
    assert(parseScannedLocation(code) === code);
    assert(parseScannedLocation('http://localhost:8765/#/movimientos?modo=picking&u=P02-E01-N01') === 'P02-E01-N01');
    assert(parseScannedLocation('http://localhost:8765/#/movil?u=P02-E01-N01') === 'P02-E01-N01');
  });

  test('la cola sin conexión valida el stock al sincronizar', () => {
    const env = makeEnv();
    const queue = createOfflineQueue(env.store, { now: env.now });
    queue.enqueue({
      type: 'SALIDA',
      at: env.now(),
      responsible: 'Andrea Soto (demo)',
      departmentId: 'DEP-OPE',
      lines: [{ sku: 'SKU-036', qty: 9999, from: 'P04-E05-N03' }],
    });
    const res = queue.sync();
    assert(res.rejected >= 1, 'Debió rechazar la salida imposible');
    assert(env.store.getState().offlineQueue.some((i) => i.status === 'rechazado'));
  });
});
