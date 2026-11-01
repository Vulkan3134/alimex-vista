// Formato de números, fechas y textos para español de Chile (separador de miles ".", decimal ",").
import { pad2 } from './dates.js';

const intFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const decimalFormatters = new Map();

function decimalFormatter(digits) {
  if (!decimalFormatters.has(digits)) {
    decimalFormatters.set(digits, new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: digits }));
  }
  return decimalFormatters.get(digits);
}

/**
 * Unidades de un SKU: si el cálculo da decimal, se sube al entero siguiente
 * (4,1 y 4,9 → 5). No se deja media unidad.
 */
export function ceilUnits(n) {
  if (n === null || n === undefined || Number.isNaN(n) || n <= 0) return 0;
  if (!Number.isFinite(n)) return n;
  return Math.ceil(n - 1e-10);
}

/** 1380 -> "1.380" */
export function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return intFormatter.format(Math.round(n));
}

/** Cantidad de un SKU, siempre entera y redondeada hacia arriba. */
export function fmtUnits(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '∞';
  return fmtInt(ceilUnits(n));
}

/** 3.24 -> "3,2" (hasta `digits` decimales) */
export function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return '∞';
  return decimalFormatter(digits).format(n);
}

/** 12.5 -> "12,5 %" */
export function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${fmtNum(n, digits)} %`;
}

/** 15990 -> "$15.990" (pesos chilenos, ficticios) */
export function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `$${intFormatter.format(Math.round(n))}`;
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

/** "31-10-2026" */
export function fmtDate(value) {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** "14:35" */
export function fmtTime(value) {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "31-10-2026 14:35" */
export function fmtDateTime(value) {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

/** Días de cobertura en lenguaje claro. */
export function fmtDays(days) {
  if (days === null || days === undefined || Number.isNaN(days)) return '—';
  if (!Number.isFinite(days)) return 'Sin consumo';
  if (days <= 0) return '0 días';
  if (days < 1) return 'menos de 1 día';
  const rounded = Math.round(days);
  return `${fmtInt(rounded)} ${rounded === 1 ? 'día' : 'días'}`;
}

/** plural(1, 'producto', 'productos') -> "producto" */
export function plural(n, singular, pluralForm) {
  return Math.abs(n) === 1 ? singular : pluralForm;
}

/** "3 productos" / "1 producto" */
export function countOf(n, singular, pluralForm) {
  return `${fmtInt(n)} ${plural(n, singular, pluralForm)}`;
}

/** Texto en minúsculas y sin tildes, para búsquedas. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Une elementos en español: "A, B y C". */
export function joinList(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

/** Primera letra en mayúscula. */
export function capitalize(text) {
  const t = String(text ?? '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
