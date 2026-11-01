// Mini framework de pruebas que se ejecuta en el navegador (no requiere Node).
const registry = [];
let currentGroup = '';

export function group(name, fn) {
  const previous = currentGroup;
  currentGroup = name;
  fn();
  currentGroup = previous;
}

export function test(name, fn) {
  registry.push({ name: currentGroup ? `${currentGroup} › ${name}` : name, fn });
}

export function assert(condition, message = 'La condición es falsa') {
  if (!condition) throw new Error(message);
}

export function eq(actual, expected, message = 'Los valores no coinciden') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: esperado ${b}, obtenido ${a}`);
}

export function near(actual, expected, epsilon = 1e-6, message = 'Los valores no son cercanos') {
  if (!(Math.abs(actual - expected) <= epsilon)) throw new Error(`${message}: esperado ${expected}, obtenido ${actual}`);
}

export function throws(fn, message = 'Se esperaba una excepción') {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

export async function runAll(output) {
  const lines = [];
  let passed = 0;
  const failures = [];
  const started = performance.now();
  for (const t of registry) {
    const t0 = performance.now();
    try {
      await t.fn();
      passed += 1;
      lines.push(`OK     ${t.name} (${Math.round(performance.now() - t0)} ms)`);
    } catch (error) {
      failures.push({ name: t.name, message: String(error?.message || error) });
      lines.push(`FALLA  ${t.name}\n         ${String(error?.message || error)}`);
    }
  }
  const summary = `RESUMEN: ${passed} pasaron, ${failures.length} fallaron, ${registry.length} en total (${Math.round(performance.now() - started)} ms)`;
  lines.push('', summary);
  if (output) output.textContent = lines.join('\n');
  globalThis.__TEST_RESULTS__ = { passed, failed: failures.length, total: registry.length, failures, summary };
  return globalThis.__TEST_RESULTS__;
}
