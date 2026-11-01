// Esquema del estado compartido y constantes del negocio.
// Todos los módulos leen del mismo estado; solo movementService modifica existencias.

export const SCHEMA_VERSION = 1;

/** Tipos de movimiento. Cada uno se registra como movimiento independiente. */
export const MOVEMENT_TYPES = Object.freeze({
  ENTRADA: 'ENTRADA',
  SALIDA: 'SALIDA',
  TRASLADO: 'TRASLADO',
  DEVOLUCION: 'DEVOLUCION',
});

export const MOVEMENT_LABELS = Object.freeze({
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  TRASLADO: 'Traslado',
  DEVOLUCION: 'Devolución',
});

export const MOVEMENT_ORDER = ['ENTRADA', 'SALIDA', 'TRASLADO', 'DEVOLUCION'];

export const HANDLING_RESTRICTIONS = Object.freeze({
  ninguna: 'Sin restricción',
  pesado: 'Pesado (solo niveles bajos)',
  fragil: 'Frágil (niveles medios)',
  peligroso: 'Peligroso (zona asignada)',
});

/** Orígenes posibles de un movimiento. */
export const MOVEMENT_SOURCES = Object.freeze({
  DEMO: 'Datos de demostración',
  ESCRITORIO: 'Escritorio',
  MOVIL: 'Móvil',
  MOVIL_SIN_CONEXION: 'Móvil (sincronizado)',
});

/**
 * @typedef {Object} ProductParams
 * @property {number} minStock Stock mínimo
 * @property {number} reorderPoint Punto de reposición
 * @property {number} safetyStock Stock de seguridad
 * @property {number} leadTimeDays Tiempo de reposición del proveedor (días)
 * @property {'auto'|'manual'} consumptionMode Consumo diario calculado desde el historial o fijado a mano
 * @property {number} manualDailyConsumption Consumo diario manual (unidades enteras por día; si hay decimal se sube al siguiente)
 * @property {number} purchaseMultiple Múltiplo de compra del proveedor (1 = sin múltiplo)
 * @property {number} minOrderQty Cantidad mínima de compra del proveedor (0 = sin mínimo)
 * @property {string|null} supplierId
 */

/**
 * @typedef {Object} Handling
 * @property {number} weightKg Peso por unidad (kg)
 * @property {number} volumeL Volumen por unidad (litros)
 * @property {'ninguna'|'pesado'|'fragil'|'peligroso'} restriction Restricción de manipulación
 */

/**
 * @typedef {Object} Product  (dato maestro: en el futuro lo entregaría el ERP)
 * @property {string} sku
 * @property {string} name
 * @property {string} category
 * @property {string|null} departmentId Departamento asociado habitual (si corresponde)
 * @property {string} unit
 * @property {number} unitCost Costo unitario ficticio en pesos chilenos
 * @property {boolean} active
 * @property {ProductParams} params
 * @property {Handling} handling
 */

/**
 * @typedef {Object} Location  (ubicación física: la gestiona esta plataforma)
 * @property {string} code Ej.: P01-E02-N03 (pasillo, estantería, nivel)
 * @property {number} aisle
 * @property {number} rack
 * @property {number} level
 * @property {number} capacityUnits Capacidad referencial en unidades
 * @property {boolean} active
 */

/**
 * @typedef {Object} StockRecord  (existencia física de un SKU en una ubicación)
 * @property {string} sku
 * @property {string} location
 * @property {number} qty
 */

/**
 * @typedef {Object} Movement  (registro de solo agregar; nunca se edita ni se elimina)
 * @property {string} id MOV-000001
 * @property {string} operationId OP-000001 (agrupa las líneas de una misma operación)
 * @property {'ENTRADA'|'SALIDA'|'TRASLADO'|'DEVOLUCION'} type
 * @property {string} sku
 * @property {number} qty
 * @property {string|null} from Ubicación de origen
 * @property {string|null} to Ubicación de destino
 * @property {string|null} departmentId Departamento solicitante (o que devuelve)
 * @property {string} responsible
 * @property {string} document Documento o referencia
 * @property {string} notes
 * @property {string} at Fecha y hora del movimiento (ISO)
 * @property {string} createdAt Fecha y hora en que se registró en el sistema (ISO)
 * @property {string} source Origen del registro
 * @property {string} [receiptId] Recepción pendiente asociada (solo entradas)
 */

/**
 * @typedef {Object} PendingReceipt  (orden de compra ficticia por recibir; en el futuro vendría del ERP)
 * @property {string} id
 * @property {string} sku
 * @property {string} supplierId
 * @property {number} qtyOrdered
 * @property {number} qtyReceived
 * @property {string} expectedDate
 */

/**
 * @typedef {Object} AppState
 * @property {{schemaVersion:number, seedVersion:string, demo:boolean, createdAt:string, movementSeq:number, operationSeq:number}} meta
 * @property {number} rev Se incrementa en cada cambio (permite invalidar cálculos en caché)
 * @property {Object} settings
 * @property {{id:string, name:string, role:string}[]} users
 * @property {{id:string, name:string}[]} departments
 * @property {{id:string, name:string, leadTimeDays:number}[]} suppliers
 * @property {Product[]} products
 * @property {Location[]} locations
 * @property {StockRecord[]} stock
 * @property {{sku:string, qty:number, ref:string, note:string}[]} commitments
 * @property {PendingReceipt[]} pendingReceipts
 * @property {Movement[]} movements
 * @property {Object[]} offlineQueue
 * @property {{id:string, at:string, user:string, action:string, target:string, detail:string}[]} audit
 */

export const DEFAULT_SETTINGS = Object.freeze({
  currentUserId: 'USR-01',
  alerts: Object.freeze({
    nearReorderMarginPct: 20,
    consumptionWindowDays: 90,
  }),
  abc: Object.freeze({
    criterion: 'valor',
    thresholdA: 80,
    thresholdB: 95,
    windowDays: 180,
  }),
  csvDelimiter: ';',
});
