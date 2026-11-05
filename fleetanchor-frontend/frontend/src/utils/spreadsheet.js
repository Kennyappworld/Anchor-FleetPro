// Reading and writing import spreadsheets.
//
// Replaces the "xlsx" (SheetJS) npm package, whose npm release has known
// security holes (prototype pollution and ReDoS when opening crafted files) and
// no fixed version on npm. read-excel-file / write-excel-file are maintained and
// have no open advisories. Old binary .xls files are not supported: save them as
// .xlsx or .csv first.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const pad = (n) => String(n).padStart(2, '0');
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  return String(v);
};

// Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Reads an .xlsx or .csv file into rows of text cells.
 * `prefer` picks a sheet by name (regex), falling back to the first sheet.
 */
export async function readRows(file, prefer) {
  if (!file) return [];
  if (file.size > MAX_BYTES) throw new Error('File is larger than 5 MB');
  const name = file.name.toLowerCase();
  let rows;
  if (name.endsWith('.csv')) {
    rows = parseCsv((await file.text()).replace(/^﻿/, ''));
  } else if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    const sheet = (prefer && sheets.find((s) => prefer.test(s.sheet))) || sheets[0];
    rows = sheet ? sheet.data : [];
  } else {
    throw new Error('Use an .xlsx or .csv file (save older .xls files as .xlsx first)');
  }
  if (rows.length > MAX_ROWS) throw new Error(`Import at most ${MAX_ROWS.toLocaleString()} rows at a time`);
  return rows.map((r) => (r || []).map(cellText));
}

/** Downloads a one-sheet .xlsx template. */
export async function downloadSheet(rows, { sheet = 'Sheet1', fileName, width = 22 } = {}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = rows.map((r) => r.map((value) => ({ value: value === undefined || value === null ? '' : String(value), type: String })));
  await writeXlsxFile(data, { sheet, columns: rows[0].map(() => ({ width })) }).toFile(fileName);
}
