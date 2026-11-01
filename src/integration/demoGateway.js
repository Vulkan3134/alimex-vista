// Adaptador de demostración: responde con los datos locales ficticios.
// No simula una conexión exitosa con Dynamics: el estado permanece "sin conexión".
import { INTEGRATION_STATUS } from './contracts.js';

/**
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @returns {import('./erpGateway.js').ErpGateway}
 */
export function createDemoGateway(store) {
  const state = () => store.getState();

  return {
    status: () => ({ ...INTEGRATION_STATUS }),

    async readProducts() {
      return state().products.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        unitCost: p.unitCost,
        active: p.active,
        source: 'demo',
      }));
    },

    async readOfficialStock() {
      const totals = new Map();
      for (const r of state().stock) totals.set(r.sku, (totals.get(r.sku) || 0) + r.qty);
      return [...totals.entries()].map(([sku, qty]) => ({ sku, qty, source: 'demo' }));
    },

    async readSuppliers() {
      return state().suppliers.map((s) => ({ ...s, source: 'demo' }));
    },

    async readOpenOrders() {
      return state().pendingReceipts.map((r) => ({
        id: r.id,
        sku: r.sku,
        supplierId: r.supplierId,
        qtyOrdered: r.qtyOrdered,
        qtyReceived: r.qtyReceived,
        qtyOpen: r.qtyOrdered - r.qtyReceived,
        expectedDate: r.expectedDate,
        source: 'demo',
      }));
    },

    async pushMovements() {
      return {
        accepted: 0,
        rejected: [{ reason: 'No hay integración activa con Dynamics. Los movimientos quedan solo en esta plataforma de demostración.' }],
      };
    },

    async createPurchaseDrafts() {
      return {
        created: 0,
        errors: [{ reason: 'Las solicitudes de compra no se generan en esta etapa. Solo se muestran recomendaciones de reposición.' }],
      };
    },
  };
}
