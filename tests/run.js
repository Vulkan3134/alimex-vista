// Punto de entrada de las pruebas. Cada archivo registra sus pruebas al importarse.
import { runAll } from './framework.js';

const output = document.getElementById('resultado');
const files = ['./seed.test.js', './movements.test.js', './ranking.test.js', './reports.test.js'];

try {
  for (const file of files) await import(file);
  await runAll(output);
} catch (error) {
  output.textContent = `ERROR AL CARGAR LAS PRUEBAS: ${error?.stack || error}`;
  globalThis.__TEST_RESULTS__ = { passed: 0, failed: 1, total: 1, failures: [{ name: 'carga', message: String(error?.stack || error) }], summary: 'ERROR DE CARGA' };
}
