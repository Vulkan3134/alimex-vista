// Identidad de la plataforma y textos de estado de demostración.
// No existe conexión con Microsoft Dynamics ni con ninguna base de datos real.

export const APP = Object.freeze({
  name: 'Alimex Logística',
  shortName: 'Alimex',
  subtitle: 'Gestión de inventario y optimización logística',
  version: '1.0.0-demo',
  company: 'Alimex (demostración)',
  demo: true,
  demoLabel: 'DEMOSTRACIÓN',
  demoBanner: 'Datos completamente ficticios de demostración. No existe conexión con Microsoft Dynamics ni con una base de datos real.',
  demoShort: 'Datos ficticios · sin conexión a Dynamics',
  storageNote: 'Los datos se guardan en este navegador y permanecen entre sesiones.',
});

export const ROUTES = Object.freeze([
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', hint: 'Estado general de la bodega' },
  { id: 'inventario', path: '/inventario', label: 'Inventario y layout', hint: 'Existencias; Pareto al abrir un SKU' },
  { id: 'ranking', path: '/ranking', label: 'Ranking de salidas', hint: 'Productos con mayor retiro' },
  { id: 'movimientos', path: '/movimientos', label: 'Entradas y salidas', hint: 'Formulario y picking por QR' },
  { id: 'historial', path: '/historial', label: 'Historial', hint: 'Trazabilidad de movimientos' },
  { id: 'reportes', path: '/reportes', label: 'Reportes', hint: 'Informes para presentar' },
  { id: 'configuracion', path: '/configuracion', label: 'Configuración', hint: 'Productos y parámetros' },
]);
