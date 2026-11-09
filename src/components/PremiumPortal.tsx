import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BarChart3, Bookmark, Building2, CalendarDays, ChevronDown, Clock3, Copy,
  Download, FileSpreadsheet, Heart, LayoutDashboard, MessageCircle, Package,
  RefreshCw, Search, SlidersHorizontal, Sparkles, Star, Upload, X, Zap
} from "lucide-react";
import { CONFIG } from "../config";
import { buildRows, downloadTemplate, latestOnly, loadRates, parseWorkbook, periodsOf, type RateRow, type RawRow, type RatesData, type RateValue } from "../lib/rates";
import { formatAmount, periodLabel } from "../lib/format";
import { searchRows, tokenize } from "../lib/search";

type View = "all" | "saved";
type SortMode = "relevance" | "low" | "high" | "az";
type SourceMode = "remote" | "cache" | "sample" | "local";
const UPLOAD_KEY = "qge_premium_workbook_v1";
const FAVORITES_KEY = "qge_premium_favorites_v1";

function favoriteKey(row: RateRow) {
  return row.companyKey + "|" + (row.nModel || "p:" + row.productKey);
}
function displayRate(value: RateValue) {
  if (typeof value === "number") return CONFIG.currency + " " + formatAmount(value);
  return typeof value === "string" && value.trim() ? value : "—";
}
function shareText(row: RateRow) {
  const lines = [
    "QAISER GROUP OF ELECTRONICS",
    row.company + (row.product ? " • " + row.product : ""),
    row.model || row.product,
    "Cash: " + displayRate(row.cash),
    "10 Installment: " + displayRate(row.installment),
  ];
  if (row.installment15 !== null && row.installment15 !== undefined) lines.push("15 Installment: " + displayRate(row.installment15));
  if (row.hasFix && row.fix !== null && row.fix !== undefined) lines.push("Fix Rate: " + displayRate(row.fix));
  if (row.remarks) lines.push("Note: " + row.remarks);
  lines.push("Shared via QGE Premium");
  return lines.join("\n");
}

export default function PremiumPortal() {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [source, setSource] = useState<SourceMode>("sample");
  const [fileName, setFileName] = useState("Loading rates…");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [period, setPeriod] = useState("latest");
  const [sort, setSort] = useState<SortMode>("relevance");
  const [view, setView] = useState<View>("all");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as string[]; } catch { return []; }
  });
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const applyData = (data: RatesData) => {
    setRows(data.rows);
    setRawRows(data.raw);
    setSource(data.source);
    setFileName(data.fileName);
    setUpdatedAt(data.lastModified || new Date(data.fetchedAt).toLocaleString());
    setError("");
  };

  const refreshRates = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const next = await loadRates(true);
      applyData(next);
      if (manual) notify(next.source === "sample" ? "Preview data loaded — upload your live workbook" : "Rates refreshed");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load rates.";
      setError(message);
      if (manual) notify(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stored = localStorage.getItem(UPLOAD_KEY);
        if (stored) {
          const raw = JSON.parse(stored) as RawRow[];
          if (Array.isArray(raw) && raw.length) {
            if (active) {
              setRows(buildRows(raw));
              setRawRows(raw);
              setSource("local");
              setFileName("Browser upload");
              setUpdatedAt(new Date().toLocaleString());
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        localStorage.removeItem(UPLOAD_KEY);
      }
      try {
        const data = await loadRates();
        if (active) applyData(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load rates.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void start();
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); }, [favorites]);

  const periods = useMemo(() => periodsOf(rows), [rows]);
  const latestPeriod = periods[0] || 0;
  const periodRows = useMemo(
    () => period === "latest" ? latestOnly(rows) : rows.filter(r => String(r.period) === period),
    [rows, period]
  );
  const companies = useMemo(
    () => Array.from(new Set(periodRows.map(r => r.company).filter(Boolean))).sort((a,b) => a.localeCompare(b)),
    [periodRows]
  );
  const products = useMemo(
    () => Array.from(new Set(periodRows.filter(r => !company || r.companyKey === company).map(r => r.product).filter(Boolean))).sort((a,b) => a.localeCompare(b)),
    [periodRows, company]
  );
  const filtered = useMemo(
    () => periodRows.filter(r =>
      (!company || r.companyKey === company) &&
      (!product || r.productKey === product) &&
      (view !== "saved" || favorites.includes(favoriteKey(r)))
    ),
    [periodRows, company, product, view, favorites]
  );
  const tokens = useMemo(() => tokenize(query), [query]);
  const searchHits = useMemo(() => searchRows(filtered, tokens), [filtered, tokens]);
  const visibleRows = useMemo(() => {
    const found = searchHits.map(hit => hit.row);
    if (sort === "low") return found.slice().sort((a,b) => priceOf(a) - priceOf(b));
    if (sort === "high") return found.slice().sort((a,b) => priceOf(b) - priceOf(a));
    if (sort === "az") return found.slice().sort((a,b) => (a.model || a.product).localeCompare(b.model || b.product));
    return found;
  }, [searchHits, sort]);

  function priceOf(row: RateRow) {
    return typeof row.cash === "number" ? row.cash : typeof row.installment === "number" ? row.installment : typeof row.fix === "number" ? row.fix : 0;
  }
  const brandCount = companies.length;
  const productCount = useMemo(() => new Set(periodRows.map(r => r.productKey)).size, [periodRows]);
  const favoriteCount = favorites.length;

  function toggleFavorite(row: RateRow) {
    const key = favoriteKey(row);
    setFavorites(current => current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
  }
  async function copyRate(row: RateRow) {
    try {
      await navigator.clipboard.writeText(shareText(row));
      notify("Rate copied — ready to paste in WhatsApp");
    } catch {
      notify("Clipboard unavailable on this browser");
    }
  }
  function shareWhatsApp(row: RateRow) {
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText(row)), "_blank", "noopener,noreferrer");
  }
  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = parseWorkbook(await file.arrayBuffer());
      if (!raw.length) throw new Error("No rates were found. Check the Excel column headings.");
      localStorage.setItem(UPLOAD_KEY, JSON.stringify(raw));
      setRows(buildRows(raw));
      setRawRows(raw);
      setSource("local");
      setFileName(file.name);
      setUpdatedAt(new Date().toLocaleString());
      setPeriod("latest");
      setCompany("");
      setProduct("");
      setQuery("");
      setView("all");
      notify("Workbook imported and saved on this device");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not read this workbook");
    } finally {
      event.target.value = "";
    }
  }
  function resetFilters() {
    setQuery("");
    setCompany("");
    setProduct("");
    setPeriod("latest");
    setView("all");
    setSort("relevance");
  }

  const liveLabel = source === "sample" ? "Preview data" : source === "local" ? "Browser upload" : source === "cache" ? "Saved copy" : "Live workbook";
  const periodLabelText = period === "latest" ? (latestPeriod ? periodLabel(latestPeriod) : "Latest rates") : periodLabel(Number(period));
  const currencySummary = rows.length.toLocaleString("en-US") + " rate entries";

  return (
    <div className="min-h-screen bg-[#f6f7f9] pb-10">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111827]/95 text-white shadow-lg shadow-slate-900/10 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-red-500 to-red-700 font-display text-sm font-extrabold tracking-tight shadow-lg shadow-red-950/30">QGE</div>
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-extrabold tracking-[.12em]">QGE PREMIUM</div>
              <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400">Qaiser Group of Electronics</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-2 text-[11px] font-semibold text-slate-300 md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" />
            Sales team workspace
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => void refreshRates(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.07] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/15 disabled:opacity-60" title="Refresh rates">
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/><span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={() => fileInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-3.5 text-xs font-extrabold text-white shadow-lg shadow-red-950/25 transition hover:bg-red-500">
              <Upload size={15}/><span className="hidden sm:inline">Upload Excel</span><span className="sm:hidden">Upload</span>
            </button>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={e => void importWorkbook(e)} className="hidden"/>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <section className="relative isolate overflow-hidden rounded-[30px] bg-[#172235] px-6 py-7 text-white shadow-[0_26px_65px_rgba(15,23,42,.16)] sm:px-9 sm:py-9 lg:px-11">
          <div className="soft-grid absolute inset-0 -z-10 opacity-60"/>
          <div className="absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-red-600/25 blur-3xl"/>
          <div className="absolute -bottom-36 right-1/4 -z-10 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"/>
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_.8fr]">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.19em] text-red-200">
                <Sparkles size={13}/> Premium sales workspace
              </div>
              <h1 className="font-display text-[32px] font-extrabold leading-[1.08] tracking-[-.045em] sm:text-[42px] lg:text-[48px]">
                Your rates. <span className="text-red-400">Smarter.</span><br/>Your sales. Faster.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                Find the right model, compare cash and installment prices, and share a clean quote with your customer in seconds.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={() => document.getElementById("rate-search")?.focus()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-slate-900 transition hover:bg-red-50">
                  <Search size={15}/> Find a product
                </button>
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-400"><Zap size={14} className="text-amber-300"/> Built for fast counter service</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:pl-6">
              <Metric icon={<Package size={17}/>} label="Models" value={periodRows.length.toLocaleString("en-US")} note="In selected rate list"/>
              <Metric icon={<Building2 size={17}/>} label="Brands" value={String(brandCount)} note="Available companies"/>
              <Metric icon={<BarChart3 size={17}/>} label="Categories" value={String(productCount)} note="Product types"/>
              <Metric icon={<Heart size={17}/>} label="Favourites" value={String(favoriteCount)} note="Saved on this device"/>
            </div>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileSpreadsheet size={17}/></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-800">
                {liveLabel}
                <span className={"rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider " + (source === "sample" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>{source === "sample" ? "Needs live workbook" : "Ready"}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">{fileName} {updatedAt ? "• Updated " + updatedAt : ""} {source === "local" ? "• Only saved in this browser" : ""}</div>
            </div>
          </div>
          <button onClick={() => rawRows.length ? downloadTemplate(rawRows) : fileInput.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700">
            {rawRows.length ? <Download size={14}/> : <Upload size={14}/>}
            {rawRows.length ? "Download rate sheet" : "Import your rate sheet"}
          </button>
        </div>

        {source === "sample" && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            <b>Preview only:</b> these are sample rates to demonstrate the interface, not your current selling prices. Upload your actual Excel workbook or add <b>rates.xlsx</b> to the repository root before using this portal for sales.
          </div>
        )}
        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <span>{error}</span><button onClick={() => void refreshRates(true)} className="font-extrabold underline">Retry</button>
          </div>
        )}

        <section className="mt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[.2em] text-red-600">Product catalogue</div>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em] text-slate-900">Rate Explorer</h2>
              <p className="mt-1 text-xs text-slate-500">Search by model, brand or product category.</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><Clock3 size={14}/>{periodLabelText}</div>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(250px,1.5fr)_repeat(3,minmax(145px,.7fr))]">
              <label className="relative block">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input id="rate-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search model, company, product…" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10"/>
                {query && <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={15}/></button>}
              </label>
              <SelectBox icon={<Building2 size={15}/>} value={company} onChange={v => {setCompany(v);setProduct("");}} label="Company" options={companies.map(c => ({value: periodRows.find(r=>r.company===c)?.companyKey || "",label:c}))} allLabel="All companies"/>
              <SelectBox icon={<Package size={15}/>} value={product} onChange={setProduct} label="Product" options={products.map(p => ({value: periodRows.find(r=>r.product===p)?.productKey || "",label:p}))} allLabel="All products"/>
              <SelectBox icon={<CalendarDays size={15}/>} value={period} onChange={setPeriod} label="Rate history" options={periods.map(p=>({value:String(p),label:periodLabel(p)}))} allLabel="Latest rates" allValue="latest"/>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setView("all")} className={"inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition " + (view === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}><LayoutDashboard size={14}/>All rates</button>
                <button onClick={() => setView("saved")} className={"inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition " + (view === "saved" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100")}><Bookmark size={14}/>Favourites <span className="tabular-nums opacity-75">{favoriteCount}</span></button>
                <span className="ml-1 hidden text-[11px] font-medium text-slate-400 sm:inline">{visibleRows.length.toLocaleString("en-US")} results • {currencySummary}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] font-extrabold uppercase tracking-wider text-slate-400 sm:inline">Sort</span>
                <div className="relative">
                  <select value={sort} onChange={e=>setSort(e.target.value as SortMode)} className="h-9 appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-3 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-red-400">
                    <option value="relevance">Best match</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="az">Model: A to Z</option>
                  </select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                </div>
                <button onClick={resetFilters} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><SlidersHorizontal size={14}/>Reset</button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-white"/>)}</div>
          ) : visibleRows.length ? (
            <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleRows.map((row, index) => <RateCard key={favoriteKey(row) + "|" + row.period + "|" + index} row={row} saved={favorites.includes(favoriteKey(row))} onFavorite={()=>toggleFavorite(row)} onCopy={()=>void copyRate(row)} onWhatsApp={()=>shareWhatsApp(row)} index={index}/>)}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Search size={24}/></div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-slate-900">{view === "saved" ? "No favourites saved yet" : "No matching products"}</h3>
              <p className="mt-1 text-sm text-slate-500">{view === "saved" ? "Tap the heart on any rate card to save it here." : "Try another model number or clear a filter."}</p>
              <button onClick={resetFilters} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-slate-700">Clear filters</button>
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-slate-200 py-5 text-center text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400 sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} Qaiser Group of Electronics</span>
          <span className="inline-flex items-center gap-1.5"><Star size={12} className="text-red-500"/>QGE Premium Sales Workspace</span>
        </footer>
      </main>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold text-white shadow-2xl">{toast}</div>}
    </div>
  );
}

function Metric({ icon, label, value, note }: {icon:ReactNode;label:string;value:string;note:string}) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-sm">
    <div className="flex items-center justify-between text-slate-300"><span className="text-[10px] font-bold uppercase tracking-[.14em]">{label}</span>{icon}</div>
    <div className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">{value}</div>
    <div className="mt-0.5 text-[10px] text-slate-400">{note}</div>
  </div>;
}

function SelectBox({ icon, value, onChange, label, options, allLabel, allValue = "" }: {icon:ReactNode;value:string;onChange:(value:string)=>void;label:string;options:Array<{value:string;label:string}>;allLabel:string;allValue?:string}) {
  return <label className="relative block">
    <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[.14em] text-slate-400">{icon}{label}</span>
    <select value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-xs font-bold text-slate-700 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-500/10">
      <option value={allValue}>{allLabel}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400"/>
  </label>;
}

function RateCard({row,saved,onFavorite,onCopy,onWhatsApp,index}:{row:RateRow;saved:boolean;onFavorite:()=>void;onCopy:()=>void;onWhatsApp:()=>void;index:number}) {
  const prices = [
    {label:"Cash price",value:row.cash,kind:"cash"},
    {label:"10 installments",value:row.installment,kind:"installment"},
    {label:"15 installments",value:row.installment15,kind:"installment"},
    ...(row.hasFix ? [{label:"Fix rate",value:row.fix,kind:"fix"}] : [])
  ].filter(item=>item.value !== null && item.value !== undefined && item.value !== "");
  return <article className="animate-enter group relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/[.06]" style={{animationDelay:Math.min(index%12,8)*25+"ms"}}>
    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-red-600 via-red-400 to-transparent opacity-0 transition group-hover:opacity-100"/>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-white">{row.company || "General"}</span>
          {row.product && <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{row.product}</span>}
        </div>
        <h3 className="mt-2 break-words font-display text-[16px] font-extrabold leading-snug tracking-[-.02em] text-slate-900">{row.model || row.product || "Product"}</h3>
        {row.period > 0 && <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400"><CalendarDays size={11}/>{periodLabel(row.period)}</div>}
      </div>
      <button onClick={onFavorite} aria-label={saved ? "Remove favourite" : "Add favourite"} title={saved ? "Saved" : "Save favourite"} className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl transition " + (saved ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600")}><Heart size={17} fill={saved ? "currentColor" : "none"}/></button>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      {prices.map(price=><div key={price.label} className={"min-w-0 rounded-xl px-3 py-3 " + (price.kind==="installment" ? "bg-red-50" : price.kind==="fix" ? "bg-slate-900" : "bg-slate-50")}>
        <div className={"text-[9px] font-extrabold uppercase tracking-[.11em] " + (price.kind==="installment" ? "text-red-600" : price.kind==="fix" ? "text-red-300" : "text-slate-400")}>{price.label}</div>
        <div className={"mt-1 break-words text-[14px] font-extrabold tabular-nums tracking-tight " + (price.kind==="installment" ? "text-red-700" : price.kind==="fix" ? "text-white" : "text-slate-900")}>{displayRate(price.value)}</div>
        {price.kind === "installment" && <div className="mt-1.5 text-[8px] font-bold uppercase tracking-[.035em] text-red-500/80">{price.label === "10 installments" ? "10 INSTALLMENT VALUE × 10 = TOTAL" : "15 INSTALLMENT VALUE × 15 = TOTAL"}</div>}
      </div>)}
    </div>
    {row.remarks && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">{row.remarks}</div>}
    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
      <button onClick={onWhatsApp} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-[#168653] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#117348]"><MessageCircle size={14}/>WhatsApp</button>
      <button onClick={onCopy} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"><Copy size={13}/>Copy</button>
    </div>
  </article>;
}
