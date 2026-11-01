// Cálculos de calendario y períodos (hora local del equipo).

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const pad2 = (n) => String(n).padStart(2, '0');

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Suma meses conservando el día cuando es posible (31 ene + 1 mes = 28/29 feb). */
export function addMonths(d, n) {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

/** Días de calendario entre dos fechas (b - a). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

/** Clave de día local: 2026-10-31 */
export function dayKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Clave de mes local: 2026-10 */
export function monthKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthShortLabel(d) {
  return `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** Convierte "2026-10-31" (campo de fecha) en Date local a las 00:00. Devuelve null si no es válida. */
export function parseDateInput(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

/** Valor para <input type="datetime-local"> (hora local). */
export function toLocalInput(d) {
  return `${dayKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Interpreta el valor de <input type="datetime-local"> como hora local. */
export function fromLocalInput(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(text || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const PERIOD_PRESETS = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'ult_3_meses', label: 'Últimos 3 meses' },
  { id: 'ult_6_meses', label: 'Últimos 6 meses' },
  { id: 'anio_actual', label: 'Año actual' },
  { id: 'personalizado', label: 'Rango personalizado' },
];

function rangeLabel(from, to) {
  const f = (d) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  return `${f(from)} al ${f(to)}`;
}

/**
 * Convierte un período predefinido (o personalizado) en un rango concreto.
 * @param {string} presetId
 * @param {Date} now
 * @param {{from?: string, to?: string}} [custom] fechas "AAAA-MM-DD" para el rango personalizado
 * @returns {{id: string, label: string, from: Date, to: Date, valid: boolean, error?: string}}
 */
export function resolvePeriod(presetId, now, custom = {}) {
  switch (presetId) {
    case 'mes_anterior': {
      const ref = addMonths(now, -1);
      return { id: presetId, label: monthLabel(ref), from: startOfMonth(ref), to: endOfMonth(ref), valid: true };
    }
    case 'ult_3_meses':
    case 'ult_6_meses': {
      const n = presetId === 'ult_3_meses' ? 3 : 6;
      const from = startOfDay(addMonths(now, -n));
      const to = endOfDay(now);
      return { id: presetId, label: `Últimos ${n} meses (${rangeLabel(from, to)})`, from, to, valid: true };
    }
    case 'anio_actual': {
      const from = startOfYear(now);
      const to = endOfDay(now);
      return { id: presetId, label: `Año ${now.getFullYear()} (${rangeLabel(from, to)})`, from, to, valid: true };
    }
    case 'personalizado': {
      const from = parseDateInput(custom.from);
      const toBase = parseDateInput(custom.to);
      if (!from || !toBase) {
        return { id: presetId, label: 'Rango personalizado', from: startOfMonth(now), to: endOfDay(now), valid: false, error: 'Indique la fecha de inicio y la fecha de término.' };
      }
      const to = endOfDay(toBase);
      if (from.getTime() > to.getTime()) {
        return { id: presetId, label: 'Rango personalizado', from, to, valid: false, error: 'La fecha de inicio no puede ser posterior a la fecha de término.' };
      }
      return { id: presetId, label: rangeLabel(from, toBase), from, to, valid: true };
    }
    case 'mes_actual':
    default:
      return { id: 'mes_actual', label: monthLabel(now), from: startOfMonth(now), to: endOfMonth(now), valid: true };
  }
}

/** ¿El instante (ms) cae dentro del período? */
export function inPeriod(ts, period) {
  return ts >= period.from.getTime() && ts <= period.to.getTime();
}
