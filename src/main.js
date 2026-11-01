import { APP } from './config.js';
import { now } from './core/clock.js';
import { createLocalStorageAdapter } from './data/storage.js';
import { createStore } from './data/store.js';
import { createInventoryService } from './services/inventoryService.js';
import { createMovementService } from './services/movementService.js';
import { createProductService } from './services/productService.js';
import { createExportService } from './services/exportService.js';
import { createReportService } from './services/reportService.js';
import { createOfflineQueue } from './services/offlineQueue.js';
import { createDemoGateway } from './integration/demoGateway.js';
import { createRouter } from './ui/router.js';
import { createShell } from './ui/shell.js';
import { createDashboardView } from './ui/views/dashboard.js';
import { createInventoryView } from './ui/views/inventory.js';
import { createMovementsView } from './ui/views/movements.js';
import { createHistoryView } from './ui/views/history.js';
import { createReportsView } from './ui/views/reports.js';
import { createSettingsView } from './ui/views/settings.js';
import { createProductView } from './ui/views/product.js';

const adapter = createLocalStorageAdapter();
const store = createStore(adapter, { now });
store.init();

const clock = { now };
const inventory = createInventoryService(store, clock);
const movements = createMovementService(store, clock);
const products = createProductService(store, clock);
const exporter = createExportService(store);
const reports = createReportService(inventory, store);
const offline = createOfflineQueue(store, clock);
const erp = createDemoGateway(store);

const ctx = {
  store,
  inventory,
  movements,
  products,
  reports,
  export: exporter,
  offline,
  erp,
  now,
  navigate: () => {},
  toast: () => {},
  confirm: async () => false,
};

const root = document.getElementById('app');
const shell = createShell();
const user = store.getState().users.find((u) => u.id === store.getState().settings.currentUserId);
const chrome = shell.mount(root, { userLabel: user ? `${user.name} · ${user.role}` : '' });
ctx.toast = (message, kind) => shell.toast(message, kind);
ctx.confirm = (opts) => shell.confirm(opts);

const router = createRouter([
  { id: 'dashboard', path: '/dashboard', factory: () => createDashboardView(ctx) },
  { id: 'inventario', path: '/inventario', factory: () => createInventoryView(ctx) },
  { id: 'ranking', path: '/ranking', factory: () => ({
    render(_container, match) {
      ctx.navigate('/dashboard', { seccion: 'ranking', ...(match?.query || {}) });
    },
  }) },
  { id: 'movimientos', path: '/movimientos', factory: () => createMovementsView(ctx) },
  { id: 'historial', path: '/historial', factory: () => createHistoryView(ctx) },
  { id: 'reportes', path: '/reportes', factory: () => createReportsView(ctx) },
  { id: 'configuracion', path: '/configuracion', factory: () => createSettingsView(ctx) },
  { id: 'movil', path: '/movil', factory: () => ({
    render(_container, match) {
      ctx.navigate('/movimientos', { modo: 'picking', ...(match?.query || {}) });
    },
  }) },
  { id: 'producto', path: '/producto/:sku', factory: () => createProductView(ctx) },
]);
ctx.navigate = (path, query) => router.navigate(path, query);

router.start(chrome.outlet, (match) => {
  if (match.id === 'movil') {
    ctx.navigate('/movimientos', { modo: 'picking', ...(match.query || {}) });
    return;
  }
  if (match.id === 'ranking') {
    ctx.navigate('/dashboard', { seccion: 'ranking', ...(match.query || {}) });
    return;
  }
  chrome.setRoute(match.id === 'producto' ? 'inventario' : match.id);
  const current = store.getState().users.find((u) => u.id === store.getState().settings.currentUserId);
  chrome.setUser(current ? `${current.name} · ${current.role}` : '');
  document.title = `${match.def.id === 'dashboard' ? APP.name : chrome.outlet.querySelector('h1')?.textContent || APP.name} — demostración`;
});

store.subscribe(() => router.refresh());
store.onStorageError(() => shell.toast('No se pudo guardar en este navegador. El almacenamiento local puede estar lleno.', 'error'));

addEventListener('online', () => {
  const pending = offline.pendingCount();
  if (!pending) return;
  const res = offline.sync();
  if (res.synced || res.rejected) {
    shell.toast(`Sincronización: ${res.synced} aceptados, ${res.rejected} rechazados por stock insuficiente u otro error.`, res.rejected ? 'error' : 'ok');
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url)).catch(() => {
    /* El prototipo funciona igual sin PWA. */
  });
}
