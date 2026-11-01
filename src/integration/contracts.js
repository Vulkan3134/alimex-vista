// Contratos de la futura integración con un ERP (Microsoft Dynamics u otro).
// Separación de dominios: cada uno tendrá su propia fuente oficial.
// Esta plataforma NUNCA accederá a la base de datos interna de Dynamics.

export const INTEGRATION_DOMAINS = Object.freeze([
  {
    id: 'productos',
    name: 'Datos maestros de productos',
    futureSource: 'Dynamics (lectura)',
    now: 'Catálogo ficticio de demostración',
    purpose: 'SKU, nombre, categoría, unidad, proveedor y parámetros de reposición.',
  },
  {
    id: 'existencias',
    name: 'Existencias oficiales',
    futureSource: 'Dynamics (lectura)',
    now: 'Existencias ficticias calculadas en esta plataforma',
    purpose: 'Cantidad oficial por SKU, para contrastar con el conteo físico de bodega.',
  },
  {
    id: 'ubicaciones',
    name: 'Ubicaciones físicas',
    futureSource: 'Esta plataforma',
    now: 'Layout ficticio de la bodega de demostración',
    purpose: 'Pasillos, estanterías, niveles y contenido de cada posición.',
  },
  {
    id: 'movimientos',
    name: 'Movimientos operacionales',
    futureSource: 'Esta plataforma → sincronización hacia Dynamics',
    now: 'Registro local (demostración)',
    purpose: 'Entradas, salidas, traslados y devoluciones realizados en bodega.',
  },
  {
    id: 'reposicion',
    name: 'Recomendaciones de reposición',
    futureSource: 'Esta plataforma (cálculo)',
    now: 'Sugerencias locales; no generan compras',
    purpose: 'Cantidad sugerida a reponer. No es una orden de compra.',
  },
  {
    id: 'compras',
    name: 'Solicitudes de compra',
    futureSource: 'Dynamics, solo borradores y con aprobación humana',
    now: 'No se generan. Solo se muestran recomendaciones.',
    purpose: 'Si la versión y los permisos lo permiten, se podrían crear borradores. Nunca pedidos automáticos a proveedores.',
  },
]);

export const INTEGRATION_STATUS = Object.freeze({
  connected: false,
  mode: 'demo',
  label: 'Sin conexión',
  detail: 'No hay integración activa con Microsoft Dynamics. Los datos que se muestran son ficticios y se usan solo para demostrar el funcionamiento.',
});
