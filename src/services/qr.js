// Generador de códigos QR (versión 1 a 6, corrección M) y lectura de códigos de ubicación.
// Los QR identifican UBICACIONES de bodega, no cajas ni productos.
import { s } from '../core/dom.js';
import { normalizeLocationCode } from '../domain/locations.js';

const PREFIX = 'ALIMEX:';

export function locationPayload(code) {
  return `${PREFIX}${code}`;
}

/** Extrae un código de ubicación desde un texto escaneado o escrito. */
export function parseScannedLocation(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fromPrefix = raw.toUpperCase().startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  const direct = normalizeLocationCode(fromPrefix);
  if (direct) return direct;
  try {
    const url = new URL(raw, 'http://local');
    const q = url.searchParams.get('u') || url.searchParams.get('ubicacion') || url.searchParams.get('location');
    if (q) return normalizeLocationCode(q);
  } catch {
    /* no es una URL */
  }
  const hash = raw.split('#')[1] || '';
  const qPos = hash.indexOf('u=');
  if (qPos >= 0) return normalizeLocationCode(decodeURIComponent(hash.slice(qPos + 2).split('&')[0]));
  return normalizeLocationCode(raw);
}

// --- QR: GF(256) y Reed-Solomon ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(nsym) {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsEncode(data, nsym) {
  const gen = rsGenerator(nsym);
  const res = data.concat(new Array(nsym).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (!coef) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

/** Capacidad y bloques para corrección M (versiones 1–6). */
const VERSIONS = [
  null,
  { ver: 1, size: 21, data: 16, ec: 10, groups: [[1, 16, 10]], align: [] },
  { ver: 2, size: 25, data: 28, ec: 16, groups: [[1, 28, 16]], align: [18] },
  { ver: 3, size: 29, data: 44, ec: 26, groups: [[1, 44, 26]], align: [22] },
  { ver: 4, size: 33, data: 64, ec: 36, groups: [[2, 32, 18]], align: [26] },
  { ver: 5, size: 37, data: 86, ec: 48, groups: [[2, 43, 24]], align: [30] },
  { ver: 6, size: 41, data: 108, ec: 64, groups: [[4, 27, 16]], align: [34] },
];

function bitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
    bytes.push(v);
  }
  return bytes;
}

function encodeData(text, version) {
  const bytes = [...new TextEncoder().encode(text)];
  const spec = VERSIONS[version];
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capacity = spec.data * 8;
  const remain = capacity - bits.length;
  if (remain < 0) return null;
  push(0, Math.min(4, remain));
  while (bits.length % 8) bits.push(0);
  const data = bitsToBytes(bits);
  const pads = [0xec, 0x11];
  let p = 0;
  while (data.length < spec.data) data.push(pads[p++ % 2]);
  return data;
}

function chooseVersion(text) {
  for (let v = 1; v <= 6; v++) {
    if (encodeData(text, v)) return v;
  }
  return 0;
}

function interleave(data, spec) {
  const blocks = [];
  let offset = 0;
  for (const [count, k, ec] of spec.groups) {
    for (let i = 0; i < count; i++) {
      const block = data.slice(offset, offset + k);
      offset += k;
      blocks.push({ data: block, ec: rsEncode(block, ec) });
    }
  }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.data.length));
  const maxE = Math.max(...blocks.map((b) => b.ec.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < maxE; i++) for (const b of blocks) if (i < b.ec.length) out.push(b.ec[i]);
  return out;
}

function placeFinders(mod, reserved, size) {
  const draw = (x, y) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = y + r;
        const cc = x + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6
          && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          mod[rr][cc] = on;
          reserved[rr][cc] = 1;
        } else {
          reserved[rr][cc] = 1;
        }
      }
    }
  };
  draw(0, 0);
  draw(size - 7, 0);
  draw(0, size - 7);
}

function placeAlign(mod, reserved, size, positions) {
  for (const p of positions) {
    const x = p - 2;
    const y = p - 2;
    let overlap = false;
    for (let r = 0; r < 5 && !overlap; r++) {
      for (let c = 0; c < 5; c++) if (reserved[y + r][x + c] === 1 && (r < 1 || r > 3 || c < 1 || c > 3)) overlap = true;
    }
    if (overlap) continue;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        mod[y + r][x + c] = r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2);
        reserved[y + r][x + c] = 1;
      }
    }
  }
}

function placeTiming(mod, reserved, size) {
  for (let i = 8; i < size - 8; i++) {
    mod[6][i] = i % 2 === 0;
    mod[i][6] = i % 2 === 0;
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }
}

function reserveFormat(reserved, size) {
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = 1;
    reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }
  reserved[8][8] = 1;
}

function maskFn(id) {
  return [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][id];
}

function placeData(mod, reserved, size, bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let bit = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (c < 0 || reserved[row][c]) continue;
        mod[row][c] = bits[bit] === 1;
        bit += 1;
      }
    }
    upward = !upward;
  }
}

function applyMask(mod, reserved, size, id) {
  const fn = maskFn(id);
  const out = mod.map((row) => row.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && fn(r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}

function bchFormat(eccMask) {
  let bits = eccMask << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (bits & (1 << i)) bits ^= gen << (i - 10);
  return (eccMask << 10 | bits) ^ 0x5412;
}

function placeFormat(mod, size, maskId) {
  const bits = bchFormat(maskId); // ECC M = 00, so eccMask = maskId
  const get = (i) => ((bits >> (14 - i)) & 1) === 1;
  const coordsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const coordsB = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  coordsA.forEach(([r, c], i) => { mod[r][c] = get(i); });
  coordsB.forEach(([r, c], i) => { mod[r][c] = get(i); });
  mod[size - 8][8] = true;
}

function scoreMask(mod, size) {
  let score = 0;
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (mod[r][c] === mod[r][c - 1]) run += 1;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (mod[r][c] === mod[r - 1][c]) run += 1;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = mod[r][c];
      if (mod[r][c + 1] === v && mod[r + 1][c] === v && mod[r + 1][c + 1] === v) score += 3;
    }
  }
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (mod[r][c]) dark += 1;
  const pct = (dark * 100) / (size * size);
  score += Math.abs(Math.floor(pct / 5) - 10) * 10;
  return score;
}

/**
 * Codifica un texto en una matriz QR.
 * @returns {{size:number, modules:boolean[][], version:number, text:string}}
 */
export function encodeQr(text) {
  const payload = String(text || '');
  const version = chooseVersion(payload);
  if (!version) throw new Error('El texto es demasiado largo para el generador de QR del prototipo.');
  const spec = VERSIONS[version];
  const data = encodeData(payload, version);
  const codewords = interleave(data, spec);
  const size = spec.size;
  const reserved = Array.from({ length: size }, () => new Array(size).fill(0));
  const base = Array.from({ length: size }, () => new Array(size).fill(false));
  placeFinders(base, reserved, size);
  placeAlign(base, reserved, size, spec.align);
  placeTiming(base, reserved, size);
  reserveFormat(reserved, size);
  placeData(base, reserved, size, codewords);

  let best = null;
  let bestScore = Infinity;
  let bestId = 0;
  for (let id = 0; id < 8; id++) {
    const masked = applyMask(base, reserved, size, id);
    placeFormat(masked, size, id);
    const sc = scoreMask(masked, size);
    if (sc < bestScore) {
      bestScore = sc;
      best = masked;
      bestId = id;
    }
  }
  return { size, modules: best, version, mask: bestId, text: payload };
}

/** Dibuja el QR como elemento SVG (sin innerHTML). */
export function qrSvg(text, { moduleSize = 6, margin = 4, title = '' } = {}) {
  const { size, modules, version } = encodeQr(text);
  const dim = (size + margin * 2) * moduleSize;
  const rects = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r][c]) continue;
      rects.push(s('rect', {
        x: (c + margin) * moduleSize,
        y: (r + margin) * moduleSize,
        width: moduleSize,
        height: moduleSize,
        fill: '#111',
      }));
    }
  }
  return s('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${dim} ${dim}`,
    width: dim,
    height: dim,
    role: 'img',
    'aria-label': title || `Código QR: ${text}`,
  }, s('rect', { width: dim, height: dim, fill: '#fff' }), rects, s('title', title || `QR v${version}`));
}

export function canDetectBarcode() {
  return typeof globalThis.BarcodeDetector === 'function';
}

/**
 * Intenta leer un QR desde un video usando BarcodeDetector (si el navegador lo permite).
 * @returns {Promise<string|null>}
 */
export async function detectFromVideo(video) {
  if (!canDetectBarcode()) return null;
  const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
  const codes = await detector.detect(video);
  return codes[0]?.rawValue || null;
}
