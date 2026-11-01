// Exportación a CSV, Excel (.xlsx) y descarga de archivos.
// El Excel se genera como ZIP sin compresión (formato Office Open XML), sin librerías.
import { downloadBlob } from '../core/dom.js';
import { dayKey } from '../core/dates.js';
import { APP } from '../config.js';

function escapeCsv(value, delimiter) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {object[]} rows
 * @param {{key:string, label:string, format?: (v:any, row:object) => string}[]} columns
 * @param {string} [delimiter]
 */
export function toCsv(rows, columns, delimiter = ';') {
  const header = columns.map((c) => escapeCsv(c.label, delimiter)).join(delimiter);
  const lines = rows.map((row) => columns.map((c) => {
    const raw = c.format ? c.format(row[c.key], row) : row[c.key];
    return escapeCsv(raw, delimiter);
  }).join(delimiter));
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  return [n & 255, (n >>> 8) & 255];
}

function u32(n) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

function concatBytes(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}

/** ZIP sin compresión (método 0). Suficiente para un .xlsx válido. */
function zipStore(files) {
  const encoder = (name, data) => {
    const nameBytes = encodeUtf8(name);
    const crc = crc32(data);
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), 0x00, 0x00,
      ...nameBytes, ...data,
    ]);
    const central = {
      crc, size: data.length, nameBytes, localSize: local.length,
    };
    return { local, central };
  };

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const built = encoder(file.name, file.data);
    locals.push(built.local);
    const c = built.central;
    centrals.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameBytes.length),
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...u32(offset),
      ...c.nameBytes,
    ]));
    offset += built.local.length;
  }
  const centralDir = concatBytes(centrals);
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
    ...u16(files.length), ...u16(files.length),
    ...u32(centralDir.length), ...u32(offset),
    0x00, 0x00,
  ]);
  return concatBytes([...locals, centralDir, end]);
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(index) {
  let n = index;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * @param {{name:string, columns:{key:string,label:string,format?:Function}[], rows:object[]}[]} sheets
 */
export function toXlsx(sheets) {
  const sheetFiles = [];
  const sheetRefs = [];
  const shared = [];
  const sharedIndex = new Map();
  const intern = (text) => {
    const key = String(text ?? '');
    if (sharedIndex.has(key)) return sharedIndex.get(key);
    const i = shared.length;
    shared.push(key);
    sharedIndex.set(key, i);
    return i;
  };

  sheets.forEach((sheet, i) => {
    const rowsXml = [];
    const headerCells = sheet.columns.map((c, ci) => `<c r="${colName(ci)}1" t="s"><v>${intern(c.label)}</v></c>`).join('');
    rowsXml.push(`<row r="1">${headerCells}</row>`);
    sheet.rows.forEach((row, ri) => {
      const r = ri + 2;
      const cells = sheet.columns.map((c, ci) => {
        const raw = c.format ? c.format(row[c.key], row) : row[c.key];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          return `<c r="${colName(ci)}${r}"><v>${raw}</v></c>`;
        }
        return `<c r="${colName(ci)}${r}" t="s"><v>${intern(raw)}</v></c>`;
      }).join('');
      rowsXml.push(`<row r="${r}">${cells}</row>`);
    });
    const lastCol = colName(Math.max(0, sheet.columns.length - 1));
    const lastRow = sheet.rows.length + 1;
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${rowsXml.join('')}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
    const fileId = i + 1;
    sheetFiles.push({ name: `xl/worksheets/sheet${fileId}.xml`, data: encodeUtf8(xml) });
    sheetRefs.push({ name: sheet.name || `Hoja${fileId}`, id: fileId });
  });

  const sst = shared.map((t) => `<si><t xml:space="preserve">${xmlEscape(t)}</t></si>`).join('');
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${sst}</sst>`;

  const workbookSheets = sheetRefs.map((s) => `<sheet name="${xmlEscape(s.name).slice(0, 31)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('');
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`;

  const wbRels = sheetRefs.map((s) => `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')
    + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rIdSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>';

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheetRefs.map((s) => `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const files = [
    { name: '[Content_Types].xml', data: encodeUtf8(contentTypes) },
    { name: '_rels/.rels', data: encodeUtf8(rootRels) },
    { name: 'xl/workbook.xml', data: encodeUtf8(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}</Relationships>`) },
    { name: 'xl/styles.xml', data: encodeUtf8(stylesXml) },
    { name: 'xl/sharedStrings.xml', data: encodeUtf8(sstXml) },
    ...sheetFiles,
  ];
  return zipStore(files);
}

export function suggestedFilename(base, ext, now = new Date()) {
  const safe = String(base || 'reporte').replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '_').replace(/^_|_$/g, '');
  return `${safe}_${dayKey(now)}.${ext}`;
}

export function createExportService(store) {
  const delimiter = () => store.getState().settings.csvDelimiter || ';';

  return {
    delimiter,
    csv(rows, columns) {
      return toCsv(rows, columns, delimiter());
    },
    xlsx(sheets) {
      return toXlsx(sheets);
    },
    downloadCsv(rows, columns, name) {
      const csv = toCsv(rows, columns, delimiter());
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), suggestedFilename(name, 'csv'));
    },
    downloadXlsx(sheets, name) {
      const bytes = toXlsx(sheets);
      downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), suggestedFilename(name, 'xlsx'));
    },
    downloadText(text, name, mime = 'text/plain;charset=utf-8') {
      downloadBlob(new Blob([text], { type: mime }), name);
    },
    watermark() {
      return `${APP.demoBanner} Generado por ${APP.name} ${APP.version}.`;
    },
  };
}
