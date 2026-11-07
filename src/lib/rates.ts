import * as XLSX from 'xlsx';
import { CONFIG } from '../config';
import { MONTHS } from './format';
import { getSampleRows } from './sample';
import { norm } from './search';

/* ═══════════════════════════ Types ═══════════════════════════ */

export type RateValue = number | string | null;

export interface RawRow {
  company: string;
  product: string;
  model: string;
  cash: RateValue;
  installment: RateValue; // 10-installment rate (legacy column name)
  installment15: RateValue;
  fix: RateValue;
  remarks: string;
  month: number; // 1-12, 0 = unknown
  year: number; // 0 = unknown
}

export interface RateRow extends RawRow {
  id: number;
  companyKey: string;
  productKey: string;
  /** year * 100 + month, 0 = unknown */
  period: number;
  /** show 3rd "Fix Rate" box (e.g. HAIER) */
  hasFix: boolean;
  nCompany: string;
  nProduct: string;
  nModel: string;
  nRemarks: string;
}

export type DataSource = 'remote' | 'cache' | 'sample';

export interface RatesData {
  rows: RateRow[];
  raw: RawRow[];
  source: DataSource;
  fileName: string;
  fetchedAt: number;
  lastModified: string | null;
  notice: string | null;
}

/* ═══════════════════════ Cell helpers ═══════════════════════ */

function cleanText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function parseRate(v: unknown): RateValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = cleanText(v);
  if (!s || /^[-–—_.\s]*$/.test(s) || /^(n\/?a|nil|none|0)$/i.test(s)) return null;
  const cleaned = s.replace(/rs\.?|pkr|\/-|,|\s/gi, '');
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const n = parseFloat(cleaned);
    return n > 0 ? n : null;
  }
  return s; // keep text such as "Call", "Out of stock"
}

// NOTE: no regex look-behind (older iPhones don't support it)
const MONTH_RE =
  /(?:^|[^a-z])(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(?![a-z])/;
const YEAR_RE = /(?:^|\D)((?:19|20)\d{2})(?!\d)/;
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthFromName(name: string): number {
  return MONTH_KEYS.indexOf(name.slice(0, 3)) + 1;
}

function fromSerial(n: number): { m: number; y: number } {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return { m: d.getUTCMonth() + 1, y: d.getUTCFullYear() };
}

function normYear(n: number): number {
  return n < 100 ? 2000 + n : n;
}

/** Month cell: "March", "Mar", 3, "03/2026", "Mar-26", "March 2026", Excel date… */
function parseMonthCell(v: unknown): { m: number; y: number } {
  if (v === null || v === undefined || v === '') return { m: 0, y: 0 };
  if (v instanceof Date) return { m: v.getMonth() + 1, y: v.getFullYear() };
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 1 && v <= 12) return { m: v, y: 0 };
    if (Number.isInteger(v) && v >= 1900 && v <= 2200) return { m: 0, y: v };
    if (v > 20000 && v < 80000) return fromSerial(v);
    return { m: 0, y: 0 };
  }
  const s = cleanText(v).toLowerCase();
  let m = 0;
  let y = 0;
  const mm = s.match(MONTH_RE);
  if (mm) m = monthFromName(mm[1]);
  const yy = s.match(YEAR_RE);
  if (yy) y = parseInt(yy[1], 10);
  if (!m) {
    let a = s.match(/^(\d{1,2})\s*[/\-.\s]\s*(\d{4}|\d{2})$/); // 03/2026, 3-26
    if (a) {
      m = +a[1];
      if (!y) y = normYear(+a[2]);
    } else if ((a = s.match(/^(\d{4})\s*[/\-.\s]\s*(\d{1,2})$/))) {
      y = +a[1]; // 2026-03
      m = +a[2];
    } else if ((a = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})$/))) {
      m = +a[2]; // dd/mm/yyyy
      y = normYear(+a[3]);
    } else if ((a = s.match(/^(\d{1,2})$/))) {
      m = +a[1];
    }
  }
  if (m && !y && mm) {
    const y2 = s.match(/(?:^|\D)(\d{2})$/); // "mar-26"
    if (y2) y = 2000 + +y2[1];
  }
  if (m < 1 || m > 12) m = 0;
  return { m, y };
}

function parseYearCell(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    if (v >= 1900 && v <= 2200) return Math.trunc(v);
    if (v >= 0 && v < 100) return 2000 + Math.trunc(v);
    if (v > 20000 && v < 80000) return fromSerial(v).y;
    return 0;
  }
  const s = cleanText(v);
  const a = s.match(YEAR_RE);
  if (a) return +a[1];
  const b = s.match(/^'?(\d{2})$/);
  if (b) return 2000 + +b[1];
  return 0;
}

function periodFromText(text: string): { m: number; y: number } {
  const s = text.toLowerCase();
  const mm = s.match(MONTH_RE);
  const yy = s.match(YEAR_RE);
  return { m: mm ? monthFromName(mm[1]) : 0, y: yy ? +yy[1] : 0 };
}

function guessYear(month: number): number {
  const now = new Date();
  const y = now.getFullYear();
  return month - (now.getMonth() + 1) > 6 ? y - 1 : y;
}

/* ═══════════════════════ Header detection ═══════════════════════ */

type Field = 'company' | 'product' | 'model' | 'cash' | 'installment' | 'installment15' | 'fix' | 'remarks' | 'month' | 'year' | 'monthyear';
type Cols = Partial<Record<Field, number[]>>;

function classifyHeader(value: unknown): { field: Field; weak: boolean } | null {
  const h = norm(value);
  if (!h || h.length > 40) return null;
  if (/^(sr|sno|srno|serial|serialno|no|num|number|s|id|sn)$/.test(h)) return null;
  if (/remark|note|comment/.test(h)) return { field: 'remarks', weak: false };
  if (h.includes('fix')) return { field: 'fix', weak: false };
  if (/15.*(inst|qist)|(inst|qist).*15|fifteen.*(inst|qist)/.test(h)) return { field: 'installment15', weak: false };
  if (/10.*(inst|qist)|(inst|qist).*10|ten.*(inst|qist)/.test(h)) return { field: 'installment', weak: false };
  if (/inst|qist|lease|credit/.test(h)) return { field: 'installment', weak: false };
  if (h.includes('cash')) return { field: 'cash', weak: false };
  if (h.includes('model') || /^(sku|code|itemcode|modelcode|article|articleno)$/.test(h)) return { field: 'model', weak: false };
  if (/company|brand|make|manufacturer/.test(h)) return { field: 'company', weak: false };
  if (/product|category|item|type|appliance/.test(h)) return { field: 'product', weak: false };
  if (h.includes('month') && h.includes('year')) return { field: 'monthyear', weak: false };
  if (/month|period|date/.test(h)) return { field: 'month', weak: false };
  if (h.includes('year') || h === 'yr') return { field: 'year', weak: false };
  if (/^(price|prices|rate|rates|rs|pkr|amount|mrp|retail|retailprice|saleprice)$/.test(h)) return { field: 'cash', weak: true };
  if (/^(particulars|particular|description|desc|name|itemdescription|details)$/.test(h)) return { field: 'model', weak: true };
  return null;
}

function detectHeader(rows: unknown[][]): { index: number; cols: Cols } | null {
  const limit = Math.min(rows.length, 30);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const cols: Cols = {};
    const weak: Array<[Field, number]> = [];
    for (let c = 0; c < row.length; c++) {
      const res = classifyHeader(row[c]);
      if (!res) continue;
      if (res.weak) {
        weak.push([res.field, c]);
        continue;
      }
      const list = cols[res.field];
      if (list) list.push(c);
      else cols[res.field] = [c];
    }
    for (const [f, c] of weak) if (!cols[f]) cols[f] = [c];
    if ((cols.model || cols.product) && (cols.cash || cols.installment || cols.fix)) return { index: r, cols };
  }
  return null;
}

const HEADER_WORDS: Partial<Record<Field, string[]>> = {
  company: ['company', 'companyname', 'brand', 'brandname', 'make'],
  product: ['product', 'products', 'productname', 'category', 'item', 'items', 'type'],
  model: ['model', 'models', 'modelno', 'modelnumber', 'modelname', 'particulars', 'description'],
};

function isHeaderWord(value: string, field: Field): boolean {
  const words = HEADER_WORDS[field];
  return !!value && !!words && words.includes(norm(value));
}

/* ═══════════════════════ Sheet parsing ═══════════════════════ */

function parseSheet(rows: unknown[][], sheetName: string): RawRow[] {
  const head = detectHeader(rows);
  if (!head) return [];
  const { index, cols } = head;

  // Default month/year for the sheet: from the sheet name or a title row above the headings
  let def = periodFromText(sheetName);
  for (let r = 0; r < index && !(def.m && def.y); r++) {
    const p = periodFromText((rows[r] || []).map(cleanText).join(' '));
    def = { m: def.m || p.m, y: def.y || p.y };
  }

  const name = sheetName.trim();
  const sheetCompany =
    !cols.company && name && !/^sheet\s*\d*$/i.test(name) && !periodFromText(name).m ? name : '';

  const cell = (row: unknown[], field: Field): unknown => {
    const c = cols[field];
    return c ? row[c[0]] : null;
  };

  const out: RawRow[] = [];
  let company = sheetCompany;
  let product = '';
  let month = def.m;
  let year = def.y;

  for (let r = index + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;

    const companyCell = cleanText(cell(row, 'company'));
    const productCell = cleanText(cell(row, 'product'));
    const model = cleanText(cell(row, 'model'));

    // skip repeated heading rows
    if (isHeaderWord(model, 'model') || isHeaderWord(companyCell, 'company') || isHeaderWord(productCell, 'product')) continue;

    // fill-down (merged cells / written once at the top)
    if (companyCell) company = companyCell;
    if (productCell) product = productCell;

    const mo = parseMonthCell(cell(row, 'month'));
    const my = parseMonthCell(cell(row, 'monthyear'));
    const yr = parseYearCell(cell(row, 'year'));
    const m = mo.m || my.m;
    const y = yr || mo.y || my.y;
    if (m) month = m;
    if (y) year = y;

    const cash = parseRate(cell(row, 'cash'));
    const installment = parseRate(cell(row, 'installment'));
    const installment15 = parseRate(cell(row, 'installment15'));
    const fix = parseRate(cell(row, 'fix'));
    const remarks = (cols.remarks || [])
      .map((c) => cleanText(row[c]))
      .filter(Boolean)
      .join(' · ');

    if (!model && !productCell) continue;
    if (cash === null && installment === null && installment15 === null && fix === null && !remarks) continue;

    out.push({
      company,
      product,
      model,
      cash,
      installment,
      installment15,
      fix,
      remarks,
      month,
      year: month && !year ? guessYear(month) : year,
    });
  }
  return out;
}

export function parseWorkbook(buffer: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true });
  const out: RawRow[] = [];
  wb.SheetNames.forEach((name, i) => {
    if (wb.Workbook?.Sheets?.[i]?.Hidden) return; // hidden sheets are ignored
    const ws = wb.Sheets[name];
    if (!ws) return;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
    for (const r of parseSheet(rows, name)) out.push(r);
  });
  return out;
}

/* ═══════════════════════ Rows & periods ═══════════════════════ */

export function buildRows(raw: RawRow[]): RateRow[] {
  const fixKeys = CONFIG.fixRateCompanies.map((c) => norm(c)).filter(Boolean);
  const companyName = new Map<string, string>();
  const productName = new Map<string, string>();
  const rows: RateRow[] = [];

  raw.forEach((r, i) => {
    const company = cleanText(r.company);
    const product = cleanText(r.product);
    const nCompany = norm(company);
    const nProduct = norm(product);
    if (nCompany && !companyName.has(nCompany)) companyName.set(nCompany, company);
    if (nProduct && !productName.has(nProduct)) productName.set(nProduct, product);
    const month = Number(r.month) || 0;
    const year = Number(r.year) || 0;
    const model = cleanText(r.model);
    const remarks = cleanText(r.remarks);

    rows.push({
      company: nCompany ? companyName.get(nCompany) ?? company : '',
      product: nProduct ? productName.get(nProduct) ?? product : '',
      model,
      cash: r.cash ?? null,
      installment: r.installment ?? null,
      installment15: r.installment15 ?? null,
      fix: r.fix ?? null,
      remarks,
      month,
      year,
      id: i,
      companyKey: nCompany || '_none',
      productKey: nProduct || '_none',
      period: year ? year * 100 + month : 0,
      hasFix: fixKeys.some((k) => nCompany.includes(k)),
      nCompany,
      nProduct,
      nModel: norm(model),
      nRemarks: norm(remarks),
    });
  });
  return rows;
}

function rowKey(r: RateRow): string {
  return `${r.companyKey}|${r.nModel || 'p:' + r.productKey}`;
}

/** For every model keep only its most recent month (older months stay available via the month chip). */
export function latestOnly(rows: RateRow[]): RateRow[] {
  const best = new Map<string, number>();
  for (const r of rows) {
    const k = rowKey(r);
    const cur = best.get(k);
    if (cur === undefined || r.period > cur) best.set(k, r.period);
  }
  return rows.filter((r) => r.period === best.get(rowKey(r)));
}

export function periodsOf(rows: RateRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) if (r.period) set.add(r.period);
  return Array.from(set).sort((a, b) => b - a);
}

/* ═══════════════════════ Loading ═══════════════════════ */

const CACHE_KEY = 'qge_rates_cache_v1';

function makeData(
  raw: RawRow[],
  source: DataSource,
  fileName: string,
  lastModified: string | null,
  notice: string | null,
  fetchedAt = Date.now(),
): RatesData {
  return { rows: buildRows(raw), raw, source, fileName, fetchedAt, lastModified, notice };
}

function writeCache(d: RatesData): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ raw: d.raw, fileName: d.fileName, fetchedAt: d.fetchedAt, lastModified: d.lastModified }),
    );
  } catch {
    /* storage full / blocked */
  }
}

function readCache(): RatesData | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (!s) return null;
    const c = JSON.parse(s) as { raw?: RawRow[]; fileName?: string; fetchedAt?: number; lastModified?: string | null };
    if (!Array.isArray(c.raw) || !c.raw.length) return null;
    return makeData(c.raw, 'cache', c.fileName || 'rates.xlsx', c.lastModified ?? null, null, c.fetchedAt || Date.now());
  } catch {
    return null;
  }
}

/** Detects an HTML page returned instead of the Excel file (e.g. a host's fallback page). */
function isHtmlPage(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i++;
  if (bytes[i] !== 0x3c) return false; // doesn't start with "<"
  const text = new TextDecoder().decode(bytes).toLowerCase();
  return text.includes('id="root"') || text.includes('<script');
}

async function fetchRates(): Promise<RatesData> {
  let offline = false;
  let problem: string | null = null;

  for (const file of CONFIG.ratesFiles) {
    let res: Response;
    try {
      const url = new URL(file, window.location.href);
      url.searchParams.set('v', Date.now().toString(36)); // always get the newest upload
      res = await fetch(url.toString(), { cache: 'no-store' });
    } catch {
      offline = true;
      continue;
    }
    if (!res.ok) continue;
    if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html')) continue;

    let buffer: ArrayBuffer;
    try {
      buffer = await res.arrayBuffer();
    } catch {
      offline = true;
      continue;
    }
    if (!buffer.byteLength || isHtmlPage(buffer)) continue;

    let raw: RawRow[] = [];
    try {
      raw = parseWorkbook(buffer);
    } catch {
      problem = `"${file}" could not be opened. Please upload a valid Excel file.`;
      break;
    }
    if (!raw.length) {
      problem = `"${file}" was found but no rates could be read. Row 1 must have headings like Company, Product, Model, Cash Rate, Installment Rate.`;
      break;
    }
    const data = makeData(raw, 'remote', file, res.headers.get('last-modified'), null);
    writeCache(data);
    return data;
  }

  if (offline || problem) {
    const cached = readCache();
    if (cached) return { ...cached, notice: problem };
    if (problem) throw new Error(problem);
    if (window.location.protocol === 'file:') {
      return makeData(
        getSampleRows(),
        'sample',
        'sample',
        null,
        'This page was opened directly from the computer, so the browser cannot read rates.xlsx. Upload index.html + rates.xlsx to GitHub Pages to see real rates.',
      );
    }
    throw new Error('Could not connect. Please check your internet connection and try again.');
  }

  // No rates file uploaded yet → demo data
  return makeData(getSampleRows(), 'sample', 'sample', null, null);
}

let inflight: { promise: Promise<RatesData>; at: number } | null = null;

/** Loads rates (re-uses a request started in the last minute unless `force`). */
export function loadRates(force = false): Promise<RatesData> {
  const now = Date.now();
  if (!force && inflight && now - inflight.at < 60000) return inflight.promise;
  const promise = fetchRates();
  const entry = { promise, at: now };
  inflight = entry;
  promise.catch(() => {
    if (inflight === entry) inflight = null;
  });
  return promise;
}

/* ═══════════════════════ Excel template ═══════════════════════ */

export function downloadTemplate(raw: RawRow[]): void {
  const header = ['Company', 'Product', 'Model', 'Cash Rate', '10 Installment', '15 Installment', 'Fix Rate', 'Remarks', 'Month', 'Year'];
  const body = raw.map((r) => [
    r.company,
    r.product,
    r.model,
    r.cash ?? '',
    r.installment ?? '',
    r.installment15 ?? '',
    r.fix ?? '',
    r.remarks,
    r.month ? MONTHS[r.month - 1] : '',
    r.year || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 30 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 34 },
    { wch: 11 },
    { wch: 8 },
  ];
  for (let r = 1; r <= body.length; r++) {
    for (let c = 3; c <= 6; c++) {
      const ref = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (ref && ref.t === 'n') ref.z = '#,##0';
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rates');
  XLSX.writeFile(wb, 'rates.xlsx');
}
