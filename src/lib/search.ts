import type { RateRow } from './rates';

/**
 * Normalise text for matching: lowercase and remove everything that is not a
 * letter or number — spaces, "-", "_", "/", ".", brackets etc. are ignored.
 * "HRF-368 IFRA" → "hrf368ifra"
 */
export function norm(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function tokenize(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of query.split(/[\s,;+|]+/)) {
    const t = norm(part);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Common words salesmen type → what usually appears in the product column */
const ALIASES: Record<string, string[]> = {
  fridge: ['refrigerator', 'refrigrator', 'fridge'],
  frig: ['refrigerator'],
  refrigerator: ['fridge'],
  ac: ['airconditioner', 'splitac', 'inverterac', 'windowac'],
  aircon: ['airconditioner', 'ac'],
  tv: ['led', 'lcd', 'television', 'smarttv'],
  led: ['tv', 'television'],
  lcd: ['led', 'tv'],
  television: ['led', 'tv'],
  washer: ['washingmachine', 'washing'],
  washing: ['washingmachine'],
  oven: ['microwave'],
  microwave: ['oven'],
  freezer: ['deepfreezer'],
  dispenser: ['waterdispenser'],
  mobile: ['phone', 'smartphone', 'cellphone'],
  phone: ['mobile', 'smartphone'],
  cooler: ['aircooler'],
  bike: ['motorcycle', 'motorbike'],
  motorcycle: ['bike'],
};

/**
 * Smallest edit distance between `p` and ANY substring of `t`
 * (insert / delete / replace / swap of two neighbouring characters).
 * Returns maxD + 1 as soon as the distance is known to be larger than maxD.
 */
export function fuzzyDistance(p: string, t: string, maxD: number): number {
  const m = p.length;
  const n = t.length;
  if (!m) return 0;
  if (!n) return m;
  if (m - maxD > n) return maxD + 1;

  let prev2 = new Int32Array(n + 1);
  let prev = new Int32Array(n + 1); // row 0 → all zeros (match may start anywhere)
  let cur = new Int32Array(n + 1);
  let prevMin = 0;

  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = i;
    const pc = p.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const tc = t.charCodeAt(j - 1);
      let v = prev[j - 1] + (pc === tc ? 0 : 1);
      const del = prev[j] + 1;
      if (del < v) v = del;
      const ins = cur[j - 1] + 1;
      if (ins < v) v = ins;
      if (i > 1 && j > 1 && pc === t.charCodeAt(j - 2) && p.charCodeAt(i - 2) === tc) {
        const tr = prev2[j - 2] + 1;
        if (tr < v) v = tr;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxD && prevMin > maxD) return maxD + 1;
    prevMin = rowMin;
    const tmp = prev2;
    prev2 = prev;
    prev = cur;
    cur = tmp;
  }

  let best = prev[0];
  for (let j = 1; j <= n; j++) if (prev[j] < best) best = prev[j];
  return best;
}

interface TokenScore {
  score: number;
  exact: boolean;
}

function scoreToken(t: string, r: RateRow): TokenScore | null {
  const m = r.nModel;
  let best = 0;

  if (m) {
    const at = m.indexOf(t);
    if (at === 0) best = m.length === t.length ? 150 : 125;
    else if (at > 0) best = 100;
  }
  if (best < 80 && r.nCompany) {
    if (r.nCompany === t) best = Math.max(best, 80);
    else if (r.nCompany.startsWith(t)) best = Math.max(best, 70);
    else if (r.nCompany.includes(t)) best = Math.max(best, 55);
  }
  if (best < 60 && r.nProduct) {
    if (r.nProduct.startsWith(t)) best = Math.max(best, 60);
    else if (r.nProduct.includes(t)) best = Math.max(best, 45);
  }
  if (!best) {
    const alias = ALIASES[t];
    if (alias && alias.some((a) => r.nProduct.includes(a) || m.includes(a))) best = 50;
  }
  if (!best && r.nRemarks.includes(t)) best = 15;
  if (best) return { score: best, exact: true };

  // ── similar (typo-tolerant) matching ──
  const maxD = t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0;
  if (!maxD) return null;
  if (m) {
    const d = fuzzyDistance(t, m, maxD);
    if (d <= maxD) return { score: 40 - d * 12, exact: false };
  }
  const dc = fuzzyDistance(t, r.nCompany, maxD);
  if (dc <= maxD) return { score: 30 - dc * 10, exact: false };
  const dp = fuzzyDistance(t, r.nProduct, maxD);
  if (dp <= maxD) return { score: 26 - dp * 10, exact: false };
  if (m && r.nCompany) {
    const d = fuzzyDistance(t, r.nCompany + m, maxD);
    if (d <= maxD) return { score: 30 - d * 10, exact: false };
  }
  return null;
}

export interface Hit {
  row: RateRow;
  score: number;
  /** false → "similar model" (typo tolerant) match */
  exact: boolean;
}

export function searchRows(rows: RateRow[], tokens: string[]): Hit[] {
  if (!tokens.length) return rows.map((row) => ({ row, score: 0, exact: true }));
  const joined = tokens.join('');
  const hits: Hit[] = [];

  for (const row of rows) {
    let score = 0;
    let exact = true;
    let ok = true;
    for (const t of tokens) {
      const s = scoreToken(t, row);
      if (!s) {
        ok = false;
        break;
      }
      score += s.score;
      if (!s.exact) exact = false;
    }
    if (!ok && tokens.length > 1) {
      // e.g. "hrf 386" → try "hrf386" as one piece
      const s = scoreToken(joined, row);
      if (s) {
        ok = true;
        score = s.score;
        exact = s.exact;
      }
    }
    if (!ok) continue;
    if (tokens.length > 1 && row.nModel.includes(joined)) score += 60;
    hits.push({ row, score, exact });
  }

  hits.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.row.id - b.row.id);
  return hits;
}

/** Character ranges of `text` to highlight for the typed tokens (separators ignored). */
export function highlightRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (!text || !tokens.length) return [];
  const map: number[] = [];
  let n = '';
  for (let i = 0; i < text.length; i++) {
    const c = norm(text[i]);
    for (let k = 0; k < c.length; k++) {
      n += c[k];
      map.push(i);
    }
  }
  const needles = [tokens.join(''), ...tokens].filter(
    (t, i, arr) => t.length >= (i === 0 ? 1 : 2) && arr.indexOf(t) === i,
  );
  const ranges: Array<[number, number]> = [];
  for (const t of needles) {
    const at = n.indexOf(t);
    if (at < 0) continue;
    ranges.push([map[at], map[at + t.length - 1] + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
