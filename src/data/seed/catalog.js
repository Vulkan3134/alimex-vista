// DATOS MAESTROS FICTICIOS DE DEMOSTRACIÓN.
// Ningún producto, proveedor, persona ni cifra de este archivo es real.

export const DEPARTMENTS = [
  { id: 'DEP-OPE', name: 'Operaciones' },
  { id: 'DEP-MAN', name: 'Mantenimiento' },
  { id: 'DEP-CAL', name: 'Calidad' },
  { id: 'DEP-PRD', name: 'Producción' },
  { id: 'DEP-LOG', name: 'Logística y Despacho' },
  { id: 'DEP-ADM', name: 'Administración' },
  { id: 'DEP-SSO', name: 'Seguridad y Salud Ocupacional' },
  { id: 'DEP-TI', name: 'Tecnología (TI)' },
];

/** Letra usada en la tabla de productos -> id de departamento. */
export const DEPT_LETTERS = { O: 'DEP-OPE', M: 'DEP-MAN', C: 'DEP-CAL', P: 'DEP-PRD', L: 'DEP-LOG', A: 'DEP-ADM', S: 'DEP-SSO', T: 'DEP-TI' };

export const USERS = [
  { id: 'USR-01', name: 'Iván Vega', role: 'Bodeguero' },
  { id: 'USR-02', name: 'Carlos Pérez (demo)', role: 'Supervisor de bodega' },
  { id: 'USR-03', name: 'Andrea Soto (demo)', role: 'Asistente de logística' },
  { id: 'USR-04', name: 'Jorge Ramírez (demo)', role: 'Operador de bodega' },
];

export const SUPPLIERS = [
  { id: 'PRV-01', name: 'Embalajes Demo S.A.', leadTimeDays: 5 },
  { id: 'PRV-02', name: 'Industrial Demo Ltda.', leadTimeDays: 14 },
  { id: 'PRV-03', name: 'Seguridad Demo SpA', leadTimeDays: 7 },
  { id: 'PRV-04', name: 'Limpieza e Higiene Demo', leadTimeDays: 4 },
  { id: 'PRV-05', name: 'Oficina y Tecnología Demo', leadTimeDays: 6 },
  { id: 'PRV-06', name: 'Químicos y Lubricantes Demo', leadTimeDays: 14 },
  { id: 'PRV-07', name: 'Eléctricos Demo Ltda.', leadTimeDays: 9 },
  { id: 'PRV-08', name: 'Laboratorio Demo SpA', leadTimeDays: 12 },
];

export const CATEGORIES = [
  'Embalaje y empaque',
  'EPP y seguridad',
  'Limpieza e higiene',
  'Repuestos de mantenimiento',
  'Lubricantes y químicos',
  'Eléctricos',
  'Oficina y TI',
  'Calidad y laboratorio',
];

const RESTRICTIONS = { n: 'ninguna', p: 'pesado', f: 'fragil', h: 'peligroso' };

/**
 * Tabla de productos (una fila por SKU).
 * Columnas: sku, nombre, categoría(índice), unidad, costo CLP, mínimo, seguridad, plazo proveedor (días),
 *           múltiplo de compra, compra mínima, proveedor, kg/unidad, litros/unidad, restricción (n/p/f/h),
 *           unidades por retiro, retiros por semana, departamentos (letra+peso),
 *           estado final de la demostración (A agotado, B bajo mínimo, R riesgo de quiebre, P cerca del punto de reposición, N normal),
 *           ubicación principal de picking, ubicaciones de reserva.
 */
const ROWS = [
  ['SKU-001', 'Caja de cartón 40×30×30 cm', 0, 'un', 850, 250, 300, 5, 100, 500, 'PRV-01', 0.35, 36, 'n', 50, 10, 'L6,O3,P1', 'P', 'P01-E02-N01', ['P02-E06-N01', 'P02-E05-N01']],
  ['SKU-002', 'Cinta de embalaje transparente 48 mm', 0, 'rollo', 1490, 60, 80, 5, 36, 72, 'PRV-01', 0.25, 0.45, 'n', 12, 7, 'L5,O3,P2', 'N', 'P01-E01-N03', []],
  ['SKU-003', 'Film stretch 500 mm × 300 m', 0, 'rollo', 9900, 18, 24, 7, 6, 24, 'PRV-01', 2.4, 4.5, 'n', 5, 8, 'L7,O3', 'R', 'P01-E04-N02', ['P02-E05-N01']],
  ['SKU-004', 'Etiquetas térmicas 100×150 mm', 0, 'rollo', 6800, 12, 18, 6, 12, 24, 'PRV-01', 0.4, 0.6, 'n', 4, 5, 'L5,P3,O2', 'N', 'P01-E06-N03', []],
  ['SKU-005', 'Bolsa plástica 60×90 cm (paquete de 100)', 0, 'paquete', 4200, 10, 15, 5, 10, 0, 'PRV-01', 1.1, 3, 'n', 5, 4, 'P5,O3,L2', 'N', 'P02-E01-N03', []],
  ['SKU-006', 'Pallet de madera 1,2 × 1,0 m', 0, 'un', 11500, 20, 30, 10, 20, 40, 'PRV-01', 18, 180, 'p', 6, 1.5, 'L6,O3,P1', 'N', 'P02-E06-N02', []],

  ['SKU-007', 'Guantes de nitrilo talla M (caja de 100)', 1, 'caja', 7900, 40, 50, 7, 10, 0, 'PRV-03', 0.9, 2, 'n', 10, 12, 'P5,C2,O2,M1', 'B', 'P01-E01-N02', ['P01-E05-N04']],
  ['SKU-008', 'Mascarilla desechable (caja de 50)', 1, 'caja', 3500, 30, 40, 7, 20, 40, 'PRV-03', 0.4, 1.5, 'n', 6, 6, 'P4,C2,O2,S2', 'A', 'P01-E02-N02', []],
  ['SKU-009', 'Casco de seguridad blanco', 1, 'un', 6900, 8, 10, 10, 0, 0, 'PRV-03', 0.4, 4, 'n', 2, 3, 'S4,M3,O2,P1', 'N', 'P02-E02-N03', []],
  ['SKU-010', 'Lentes de seguridad claros', 1, 'un', 2300, 20, 24, 7, 12, 0, 'PRV-03', 0.05, 0.2, 'n', 5, 4, 'S3,M3,P2,O2', 'N', 'P02-E02-N02', []],
  ['SKU-011', 'Calzado de seguridad talla 42', 1, 'par', 38900, 4, 4, 14, 0, 0, 'PRV-03', 1.4, 8, 'n', 1, 2, 'S5,P3,M2', 'A', 'P02-E04-N02', []],
  ['SKU-012', 'Tapones auditivos (caja de 200 pares)', 1, 'caja', 12900, 5, 6, 7, 2, 0, 'PRV-03', 0.8, 2, 'n', 2, 3, 'S5,P4,M1', 'N', 'P02-E03-N03', []],

  ['SKU-013', 'Detergente industrial 20 L', 2, 'bidón', 27500, 8, 8, 4, 0, 0, 'PRV-04', 21, 20, 'p', 2, 6, 'O5,P4,A1', 'N', 'P02-E01-N01', []],
  ['SKU-014', 'Desinfectante de superficies 5 L', 2, 'bidón', 11900, 8, 10, 4, 4, 0, 'PRV-04', 5.2, 5, 'n', 2, 4, 'O4,P3,C2,A1', 'B', 'P01-E05-N01', []],
  ['SKU-015', 'Papel higiénico industrial (pack de 12)', 2, 'pack', 14900, 18, 20, 4, 6, 0, 'PRV-04', 3, 25, 'n', 5, 8, 'A6,O3,P1', 'N', 'P01-E03-N02', ['P03-E05-N01']],
  ['SKU-016', 'Toalla de papel interfoliada (caja)', 2, 'caja', 18500, 6, 8, 4, 0, 0, 'PRV-04', 4, 40, 'n', 2, 3, 'A5,O3,P2', 'N', 'P02-E05-N02', []],
  ['SKU-017', 'Bolsa de basura 80×110 cm (pack de 10)', 2, 'pack', 5900, 12, 20, 4, 10, 0, 'PRV-04', 1.2, 6, 'n', 4, 5, 'O5,P3,A2', 'P', 'P01-E04-N03', []],

  ['SKU-018', 'Rodamiento 6205-2RS', 3, 'un', 4900, 8, 12, 14, 0, 0, 'PRV-02', 0.12, 0.1, 'n', 3, 3, 'M10', 'R', 'P03-E01-N02', []],
  ['SKU-019', 'Correa de transmisión B-52', 3, 'un', 9800, 3, 3, 15, 0, 0, 'PRV-02', 0.4, 1, 'n', 1, 2, 'M10', 'N', 'P03-E02-N02', []],
  ['SKU-020', 'Filtro de aire industrial', 3, 'un', 21500, 3, 4, 12, 0, 0, 'PRV-02', 1.2, 12, 'n', 1, 2, 'M8,P2', 'N', 'P03-E03-N01', []],
  ['SKU-021', 'Sello mecánico 1 pulgada', 3, 'un', 46000, 2, 2, 21, 0, 0, 'PRV-02', 0.3, 0.5, 'n', 1, 1, 'M10', 'A', 'P03-E02-N03', []],

  ['SKU-022', 'Aceite hidráulico ISO 68 (20 L)', 4, 'bidón', 58000, 6, 6, 14, 0, 0, 'PRV-06', 18, 20, 'p', 1, 4, 'M8,P2', 'B', 'P03-E06-N01', []],
  ['SKU-023', 'Grasa multipropósito (cartucho 400 g)', 4, 'un', 3200, 36, 48, 14, 24, 0, 'PRV-06', 0.45, 0.4, 'n', 5, 8, 'M8,P2', 'R', 'P03-E06-N04', []],
  ['SKU-024', 'Solvente dieléctrico (aerosol)', 4, 'un', 5400, 12, 16, 14, 12, 0, 'PRV-06', 0.5, 0.6, 'h', 4, 3, 'M6,P2,C2', 'R', 'P04-E01-N02', []],
  ['SKU-025', 'Desengrasante industrial 20 L', 4, 'bidón', 42000, 4, 5, 10, 0, 0, 'PRV-06', 20, 20, 'h', 1, 3, 'M5,P3,O2', 'N', 'P04-E01-N01', []],

  ['SKU-026', 'Cable eléctrico 2,5 mm² (rollo de 100 m)', 5, 'rollo', 52000, 3, 4, 9, 0, 0, 'PRV-07', 3.2, 8, 'p', 1, 2, 'M10', 'N', 'P03-E04-N01', []],
  ['SKU-027', 'Fusible 10 A (caja de 10)', 5, 'caja', 2800, 10, 10, 9, 0, 0, 'PRV-07', 0.1, 0.2, 'n', 3, 3, 'M8,T2', 'B', 'P03-E04-N02', []],
  ['SKU-028', 'Luminaria LED 18 W', 5, 'un', 7500, 8, 12, 9, 4, 0, 'PRV-07', 0.3, 1.5, 'f', 4, 2, 'M6,O2,A2', 'N', 'P03-E05-N03', []],

  ['SKU-029', 'Resma de papel carta (500 hojas)', 6, 'resma', 4900, 20, 30, 6, 10, 0, 'PRV-05', 2.5, 3.5, 'n', 8, 2, 'A7,L2,T1', 'P', 'P02-E03-N02', ['P03-E01-N01']],
  ['SKU-030', 'Tóner para impresora láser', 6, 'un', 48000, 2, 3, 8, 0, 0, 'PRV-05', 1.5, 6, 'f', 1, 2, 'A6,T3,L1', 'N', 'P02-E06-N03', []],
  ['SKU-031', 'Teclado USB', 6, 'un', 9900, 2, 2, 8, 0, 0, 'PRV-05', 0.6, 4, 'n', 1, 1, 'T6,A4', 'N', 'P01-E02-N03', []],
  ['SKU-032', 'Pila alcalina AA (pack de 4)', 6, 'pack', 2900, 12, 18, 6, 12, 0, 'PRV-05', 0.1, 0.2, 'n', 6, 3, 'A3,L3,O2,T2', 'N', 'P02-E04-N03', []],

  ['SKU-033', 'Placa de cultivo (caja de 20)', 7, 'caja', 24000, 8, 8, 12, 0, 0, 'PRV-08', 0.9, 2, 'f', 2, 2, 'C10', 'B', 'P04-E04-N02', []],
  ['SKU-034', 'Guante de látex estéril (caja de 100)', 7, 'caja', 8800, 6, 8, 12, 0, 0, 'PRV-08', 0.9, 2, 'n', 2, 2, 'C7,P3', 'N', 'P04-E04-N03', []],
  ['SKU-035', 'Reactivo buffer pH 500 mL', 7, 'un', 15500, 3, 3, 14, 0, 0, 'PRV-08', 0.6, 0.5, 'f', 1, 2, 'C10', 'A', 'P04-E05-N02', []],
  ['SKU-036', 'Termómetro digital calibrable', 7, 'un', 29000, 2, 2, 14, 0, 0, 'PRV-08', 0.1, 0.3, 'f', 1, 0.7, 'C6,P2,O2', 'N', 'P04-E05-N03', []],
];

/** Reservas ficticias (cantidades comprometidas). */
export const COMMITMENTS = [
  { sku: 'SKU-001', qty: 60, ref: 'RES-LOG-003', note: 'Despachos programados (ficticio)' },
  { sku: 'SKU-007', qty: 10, ref: 'RES-PRD-007', note: 'Turno de producción especial (ficticio)' },
  { sku: 'SKU-018', qty: 3, ref: 'RES-MAN-014', note: 'Mantención preventiva línea 2 (ficticio)' },
  { sku: 'SKU-026', qty: 1, ref: 'RES-MAN-021', note: 'Proyecto eléctrico (ficticio)' },
  { sku: 'SKU-029', qty: 12, ref: 'RES-ADM-002', note: 'Campaña de impresión (ficticio)' },
];

/** Órdenes ficticias aún por recibir: [sku, cantidad pedida, cantidad ya recibida, días hasta la fecha esperada]. */
export const PENDING = [
  ['SKU-001', 1000, 0, 4],
  ['SKU-007', 500, 200, 2],
  ['SKU-008', 600, 0, 3],
  ['SKU-017', 100, 0, 2],
  ['SKU-021', 6, 0, 9],
  ['SKU-022', 24, 0, 5],
  ['SKU-023', 144, 0, 6],
];

/** Pasillos x estanterías x niveles del almacén ficticio. */
export const LAYOUT = { aisles: 4, racks: 6, levels: 4 };
export const LEVEL_CAPACITY = { 1: 1200, 2: 800, 3: 600, 4: 400 };

function parseDepts(text) {
  return text.split(',').map((part) => ({ departmentId: DEPT_LETTERS[part[0]], weight: Number(part.slice(1)) }));
}

/** Especificaciones completas de los productos (incluye la información para generar el historial). */
export const PRODUCT_SPECS = ROWS.map((r) => {
  const depts = parseDepts(r[16]);
  const top = depts.reduce((a, b) => (b.weight > a.weight ? b : a));
  return {
    sku: r[0],
    name: r[1],
    category: CATEGORIES[r[2]],
    unit: r[3],
    unitCost: r[4],
    minStock: r[5],
    safetyStock: r[6],
    leadTimeDays: r[7],
    purchaseMultiple: r[8] || 1,
    minOrderQty: r[9],
    supplierId: r[10],
    weightKg: r[11],
    volumeL: r[12],
    restriction: RESTRICTIONS[r[13]],
    perEvent: r[14],
    eventsPerWeek: r[15],
    depts,
    departmentId: top.departmentId,
    finalState: r[17],
    primary: r[18],
    reserves: r[19],
  };
});
