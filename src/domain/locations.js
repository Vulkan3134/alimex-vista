// Ubicaciones físicas: códigos, accesibilidad, ocupación, mapa de calor y propuesta de reubicación.
import { buildIndex } from './stock.js';

const CODE_RE = /^P(\d{2})-E(\d{2})-N(\d{2})$/;
const DAY_MS = 86400000;

/** P01-E02-N03 -> { aisle: 1, rack: 2, level: 3 } (o null si el código no es válido) */
export function parseLocationCode(code) {
  const m = CODE_RE.exec(String(code || '').trim().toUpperCase());
  return m ? { aisle: Number(m[1]), rack: Number(m[2]), level: Number(m[3]) } : null;
}

const two = (n) => String(n).padStart(2, '0');

/** (1, 2, 3) -> "P01-E02-N03" */
export function buildLocationCode(aisle, rack, level) {
  return `P${two(aisle)}-E${two(rack)}-N${two(level)}`;
}

/** Normaliza lo que escribe o escanea el usuario a un código de ubicación. Devuelve null si no es válido. */
export function normalizeLocationCode(text) {
  const raw = String(text || '').trim().toUpperCase();
  const found = /P\d{2}-E\d{2}-N\d{2}/.exec(raw);
  return found ? found[0] : null;
}

const LEVEL_PENALTY = { 1: 6, 2: 0, 3: 4, 4: 18 };

/**
 * Índice de accesibilidad (0 a 100). Considera cercanía al muelle de despacho
 * (pasillo 1 es el más cercano) y la ergonomía del nivel (nivel 2 = altura cómoda).
 */
export function accessScore(loc) {
  const penalty = (loc.aisle - 1) * 10 + (loc.rack - 1) * 3 + (LEVEL_PENALTY[loc.level] ?? 18);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export const ACCESS_TIERS = [
  { id: 'alta', label: 'Alta accesibilidad', min: 85 },
  { id: 'media', label: 'Accesibilidad media', min: 65 },
  { id: 'baja', label: 'Accesibilidad baja', min: 0 },
];

export function accessTier(score) {
  return ACCESS_TIERS.find((t) => score >= t.min) || ACCESS_TIERS[ACCESS_TIERS.length - 1];
}

/** Dimensiones del almacén según las ubicaciones registradas. */
export function layoutDimensions(locations) {
  let aisles = 0;
  let racks = 0;
  let levels = 0;
  for (const l of locations) {
    aisles = Math.max(aisles, l.aisle);
    racks = Math.max(racks, l.rack);
    levels = Math.max(levels, l.level);
  }
  return { aisles, racks, levels };
}

/** Ocupación de ubicaciones y de capacidad. */
export function occupancy(state) {
  const idx = buildIndex(state);
  const active = state.locations.filter((l) => l.active);
  let occupied = 0;
  let usedUnits = 0;
  let capacityUnits = 0;
  for (const l of active) {
    capacityUnits += l.capacityUnits;
    const skus = idx.stockByLocation.get(l.code);
    if (skus && skus.size) {
      occupied += 1;
      for (const q of skus.values()) usedUnits += q;
    }
  }
  const total = active.length;
  return {
    total,
    occupied,
    free: total - occupied,
    pct: total ? (occupied / total) * 100 : 0,
    usedUnits,
    capacityUnits,
    capacityPct: capacityUnits ? (usedUnits / capacityUnits) * 100 : 0,
  };
}

/** Detalle de una ubicación: SKU almacenados, cantidades y uso de capacidad. */
export function locationDetail(state, code) {
  const idx = buildIndex(state);
  const loc = idx.locationByCode.get(code);
  if (!loc) return null;
  const skus = [...(idx.stockByLocation.get(code)?.entries() || [])]
    .map(([sku, qty]) => ({ sku, name: idx.productBySku.get(sku)?.name || sku, qty }))
    .sort((a, b) => b.qty - a.qty || (a.sku < b.sku ? -1 : 1));
  const usedUnits = skus.reduce((sum, s) => sum + s.qty, 0);
  const score = accessScore(loc);
  return {
    location: loc,
    skus,
    usedUnits,
    capacityUnits: loc.capacityUnits,
    capacityPct: loc.capacityUnits ? (usedUnits / loc.capacityUnits) * 100 : 0,
    accessScore: score,
    tier: accessTier(score),
  };
}

/**
 * Actividad de picking por ubicación: retiros (salidas) cuyo origen es la ubicación,
 * durante los últimos `days` días.
 * @returns {Map<string, {picks:number, units:number}>}
 */
export function pickActivity(state, now, days = 30) {
  const idx = buildIndex(state);
  const start = now.getTime() - days * DAY_MS;
  const result = new Map();
  for (const { m, ts } of idx.entries) {
    if (m.type !== 'SALIDA' || ts < start || ts > now.getTime() || !m.from) continue;
    const cur = result.get(m.from) || { picks: 0, units: 0 };
    cur.picks += 1;
    cur.units += m.qty;
    result.set(m.from, cur);
  }
  return result;
}

/**
 * Mejor clase ABC presente en cada ubicación (A > B > C).
 * @param {Map<string, {cls: string}>} abcMap clasificación por SKU
 * @returns {Map<string, 'A'|'B'|'C'>}
 */
export function bestClassByLocation(state, abcMap) {
  const idx = buildIndex(state);
  const rank = { A: 0, B: 1, C: 2 };
  const result = new Map();
  for (const [code, skus] of idx.stockByLocation) {
    let best = null;
    for (const sku of skus.keys()) {
      const cls = abcMap.get(sku)?.cls;
      if (cls && (best === null || rank[cls] < rank[best])) best = cls;
    }
    if (best) result.set(code, best);
  }
  return result;
}

/** Niveles y pasillos permitidos según la restricción de manipulación. */
export function allowedForRestriction(restriction, dims) {
  switch (restriction) {
    case 'pesado': return (loc) => loc.level <= 2;
    case 'fragil': return (loc) => loc.level === 2 || loc.level === 3;
    case 'peligroso': return (loc) => loc.aisle === dims.aisles && loc.level <= 2;
    default: return () => true;
  }
}

/** ¿La ubicación respeta la restricción de manipulación del producto? */
export function respectsRestriction(product, loc, dims) {
  return allowedForRestriction(product.handling.restriction, dims)(loc);
}

/**
 * Propuesta de reubicación: los productos más importantes (según el criterio ABC activo)
 * deberían ocupar las posiciones más accesibles, respetando las restricciones de manipulación.
 * Es solo una recomendación; no mueve existencias.
 * @param {import('../data/schema.js').AppState} state
 * @param {Map<string, {cls: string, metric: number}>} abcMap
 */
export function slottingPlan(state, abcMap) {
  const idx = buildIndex(state);
  const dims = layoutDimensions(state.locations);
  const candidates = state.locations
    .filter((l) => l.active)
    .map((l) => ({ loc: l, score: accessScore(l) }))
    .sort((a, b) => b.score - a.score || (a.loc.code < b.loc.code ? -1 : 1));

  const taken = new Set();
  const rank = { A: 0, B: 1, C: 2 };
  const stocked = state.products
    .filter((p) => p.active && idx.stockBySku.has(p.sku))
    .sort((a, b) => {
      const ca = rank[abcMap.get(a.sku)?.cls ?? 'C'];
      const cb = rank[abcMap.get(b.sku)?.cls ?? 'C'];
      return ca - cb || (abcMap.get(b.sku)?.metric ?? 0) - (abcMap.get(a.sku)?.metric ?? 0) || (a.sku < b.sku ? -1 : 1);
    });

  const rows = [];
  for (const p of stocked) {
    const ok = allowedForRestriction(p.handling.restriction, dims);
    const target = candidates.find((c) => !taken.has(c.loc.code) && ok(c.loc));
    if (target) taken.add(target.loc.code);

    const where = [...idx.stockBySku.get(p.sku).entries()].sort((a, b) => b[1] - a[1]);
    const mainCode = where[0][0];
    const mainLoc = idx.locationByCode.get(mainCode);
    const currentScore = mainLoc ? accessScore(mainLoc) : 0;
    const violates = where.some(([code]) => {
      const loc = idx.locationByCode.get(code);
      return loc && !respectsRestriction(p, loc, dims);
    });
    rows.push({
      sku: p.sku,
      name: p.name,
      cls: abcMap.get(p.sku)?.cls ?? 'C',
      restriction: p.handling.restriction,
      currentLocation: mainCode,
      currentScore,
      recommendedLocation: target ? target.loc.code : null,
      recommendedScore: target ? target.score : null,
      gain: target ? target.score - currentScore : 0,
      violatesRestriction: violates,
    });
  }
  return rows;
}
