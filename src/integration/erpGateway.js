// Puerto (interfaz) hacia un ERP. Un conector real deberá implementar estos métodos
// usando únicamente APIs, conectores o servicios oficiales y autorizados.
// No se accede a la base de datos interna de Dynamics.

/**
 * @typedef {Object} ErpGateway
 * @property {() => {connected:boolean, mode:string, label:string, detail:string}} status
 * @property {() => Promise<object[]>} readProducts
 * @property {() => Promise<object[]>} readOfficialStock
 * @property {() => Promise<object[]>} readSuppliers
 * @property {() => Promise<object[]>} readOpenOrders
 * @property {(movements: object[]) => Promise<{accepted:number, rejected:object[]}>} pushMovements
 * @property {(drafts: object[]) => Promise<{created:number, errors:object[]}>} createPurchaseDrafts
 */

export const GATEWAY_METHODS = Object.freeze([
  { id: 'readProducts', name: 'Leer productos', direction: 'Dynamics → plataforma' },
  { id: 'readOfficialStock', name: 'Leer existencias oficiales', direction: 'Dynamics → plataforma' },
  { id: 'readSuppliers', name: 'Consultar proveedores', direction: 'Dynamics → plataforma' },
  { id: 'readOpenOrders', name: 'Consultar órdenes y recepciones pendientes', direction: 'Dynamics → plataforma' },
  { id: 'pushMovements', name: 'Sincronizar movimientos de bodega', direction: 'plataforma → Dynamics' },
  { id: 'createPurchaseDrafts', name: 'Crear borradores de solicitud de compra', direction: 'plataforma → Dynamics (con aprobación)' },
]);
