"use client";
// Client Intelligence: who is about to book, who is slipping, who is worth saving, and why.
// Everything here is computed from your own visit history. Texts go through the same guarded pipeline as everywhere else.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart } from "recharts";
import { aiFetch } from "@/lib/ai/client";
import BulkSendModal from "@/app/components/bulk-send";
import { DEFAULT_FILTER, matches, liftPerText, type AudienceFilter, type MarkovKey } from "@/lib/campaigns/model";
import { DUE_META, dueStatus, returnRadar, smartLists, summarise, todaySyd, type ClientRow } from "@/lib/clients/insights";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const TIP = { backgroundColor: CARD, border: "1px solid #3A2268", borderRadius: 4, color: "#fff", fontSize: 11 };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" },
  { href: "/merchant/clients", label: "Clients", active: true }, { href: "/merchant/barber", label: "Barbers" },
];
const STATE_NAME: Record<MarkovKey, string> = { X: "Lapsed", R_at_risk: "At risk", R_on_fence: "Due soon", C: "First-timer", R_loyal: "Loyal" };
const TIER_COLOR = { VIP: GOLD, Core: PUR_LL, Regular: MUTED } as const;
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const EXAMPLES = ["VIPs who haven't been in for 6 weeks", "First-timers who never came back", "Regulars who usually come on a Saturday", "Lapsed clients who spent over $300"];

type SortKey = "name" | "visits" | "clv" | "daysSince" | "due" | "odds" | "stake";
const fmtDate = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) : "–");

function Kpi({ label, value, sub, color = "#fff", onClick }: { label: string; value: string; sub: string; color?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-xl p-4 border relative overflow-hidden ${onClick ? "cursor-pointer hover:border-[#3A2268]" : ""}`} style={{ background: CARD, borderColor: BDR }}>
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{label}</div>
      <div className="text-2xl font-bold mt-1.5 tracking-tight" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5 text-slate-500 leading-snug">{sub}</div>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [cfg, setCfg] = useState<{ copy_max: number; body_max: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastSync, setLastSync] = useState(0);

  const [q, setQ] = useState("");
  const [stateF, setStateF] = useState<MarkovKey[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [radarIds, setRadarIds] = useState<{ label: string; ids: string[] } | null>(null);
  const [nl, setNl] = useState<{ f: AudienceFilter; note: string } | null>(null);
  const [ask, setAsk] = useState(""); const [asking, setAsking] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "stake", dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(40);
  const [bulk, setBulk] = useState<ClientRow[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setSyncing(true);
    try {
      const r = await aiFetch("/api/clients/overview"); const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load clients");
      setRows(d.clients); setCfg(d.config); setErr(""); setStale(false); setLastSync(Date.now());
    } catch (e: any) { if (silent) setStale(true); else setErr(e?.message || "Could not load clients"); }
    finally { setLoading(false); setSyncing(false); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(true); }, 60_000);
    const vis = () => { if (!document.hidden) load(true); };
    const key = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener("visibilitychange", vis); window.addEventListener("keydown", key);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("keydown", key); };
  }, [load]);

  const sum = useMemo(() => summarise(rows), [rows]);
  const radar = useMemo(() => returnRadar(rows, 21), [rows]);
  const lists = useMemo(() => smartLists(rows), [rows]);
  const activeList = lists.find((l) => l.id === listId) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase(); const rid = radarIds ? new Set(radarIds.ids) : null;
    const out = rows.filter((r) => (r.visits >= 1 || r.booked)
      && (!s || r.name.toLowerCase().includes(s) || (r.phoneLast4 ?? "").includes(s))
      && (!stateF.length || stateF.includes(r.state)) && (!activeList || activeList.test(r)) && (!rid || rid.has(r.user_id)) && (!nl || matches(r, nl.f)));
    const val = (r: ClientRow): number | string => sort.k === "name" ? r.name.toLowerCase() : sort.k === "visits" ? r.visits : sort.k === "clv" ? r.clv : sort.k === "daysSince" ? r.daysSince : sort.k === "due" ? (r.daysToDue ?? 9999) : sort.k === "odds" ? r.returnOdds : r.at_stake;
    return out.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, q, stateF, activeList, radarIds, nl, sort]);
  useEffect(() => setShown(40), [q, stateF, listId, radarIds, nl, sort]);

  const anyFilter = !!(q || stateF.length || listId || radarIds || nl);
  const clearAll = () => { setQ(""); setStateF([]); setListId(null); setRadarIds(null); setNl(null); setAsk(""); };
  const chosen = useMemo(() => rows.filter((r) => sel.has(r.user_id)), [rows, sel]);
  const reachable = chosen.filter((r) => r.smsOk && !r.cooling && !r.booked);
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap ${cls}`} style={{ color: sort.k === k ? PUR_LL : MUTED }} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}</th>
  );

  async function describe(text: string) {
    if (text.trim().length < 3) return; setAsking(true);
    try {
      const r = await aiFetch("/api/campaigns/audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setListId(null); setRadarIds(null); setStateF([]); setNl({ f: { ...DEFAULT_FILTER, ...d.filter, ids: null }, note: d.summary || "Filter applied." });
    } catch (e: any) { setNl(null); setErr(e?.message || "Could not read that"); setTimeout(() => setErr(""), 3500); }
    setAsking(false);
  }
  function exportCsv() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Status", "Tier", "Visits", "Lifetime value", "Last visit", "Next expected", "Return odds %", "Value at stake"];
    const body = filtered.map((r) => [r.name, DUE_META[dueStatus(r)].label, r.tier, r.visits, r.clv.toFixed(2), r.lastVisit ?? "", r.nextDue ?? "", r.returnOdds, r.at_stake]);
    const blob = new Blob([[head, ...body].map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `alkami-clients-${todaySyd()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  const toBulk = (r: ClientRow) => ({ user_id: r.user_id, name: r.name, phone: "on file", markov_state: r.state, risk_segment: STATE_NAME[r.state], gap_ratio: r.gap_ratio, days_overdue: r.daysSince, intervention_value: liftPerText(r), sms_blocked: !r.smsOk });

  const radarMax = Math.max(1, ...radar.map((r) => r.n));
  const insight = (() => {
    if (!sum.total) return "";
    const bits: string[] = [];
    if (sum.firstVisitRebook !== null) bits.push(`${Math.round(sum.firstVisitRebook * 100)}% of first-timers come back for a second cut${sum.firstVisitRebook < 0.5 ? ". That second visit is your biggest lever." : "."}`);
    bits.push(`Your top 20% of clients bring in ${Math.round(sum.top20Share * 100)}% of lifetime value.`);
    if (lists.find((l) => l.id === "vip")?.n) bits.push(`${lists.find((l) => l.id === "vip")!.n} VIP${lists.find((l) => l.id === "vip")!.n === 1 ? " is" : "s are"} running late.`);
    return bits.join(" ");
  })();

  return (
    <div className="min-h-screen text-white pb-28" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1500px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} /><div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none">Client Intelligence</div></div></div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${t.active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <button onClick={() => load(true)} className="ml-auto flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full border" style={{ borderColor: BDR, color: stale ? GOLD : MUTED }}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncing ? "animate-pulse" : ""}`} style={{ background: stale ? GOLD : GREEN }} />{syncing ? "Updating..." : stale ? "Couldn't refresh" : lastSync ? `Live · ${Math.max(0, Math.round((Date.now() - lastSync) / 1000))}s ago` : "Live"}
          </button>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-8 pt-8 space-y-8">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "#2A0F1A", border: `1px solid ${RED}55`, color: "#FDA4AF" }}>{err}</div>}
        {loading ? <div className="text-sm" style={{ color: MUTED }}>Loading your clients...</div> : (
          <>
            {/* Headline insight + KPIs */}
            <div>
              <div className="text-2xl font-semibold tracking-tight">Know every client before they walk in</div>
              <div className="text-sm mt-1 max-w-3xl" style={{ color: PUR_LL }}>{insight}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi label="Active clients" value={String(sum.active)} sub={`${sum.lapsed} lapsed. Avg ${sum.avgGap || "–"} days between visits`} />
              <Kpi label="Come back after visit 1" value={sum.firstVisitRebook === null ? "–" : `${Math.round(sum.firstVisitRebook * 100)}%`} sub={sum.firstVisitRebook === null ? "Not enough history yet" : `of ${sum.firstVisitSample} first-timers who've had time to`} color={sum.firstVisitRebook !== null && sum.firstVisitRebook < 0.5 ? GOLD : GREEN} onClick={() => { const l = lists.find((x) => x.id === "second"); if (l) { clearAll(); setListId(l.id); } }} />
              <Kpi label="Value at risk" value={$(sum.atRisk)} sub={`${sum.atRiskCount} active clients drifting (churn-weighted)`} color={RED} />
              <Kpi label="Win-back pool" value={$(sum.lapsedValue)} sub={`${sum.lapsed} lapsed clients' lifetime spend`} color={GOLD} onClick={() => { const l = lists.find((x) => x.id === "winback"); if (l) { clearAll(); setListId(l.id); } }} />
              <Kpi label="Due this week" value={String(sum.dueWeek)} sub={`about ${$(sum.dueWeekValue)} if they all book`} color={GREEN} onClick={() => { const l = lists.find((x) => x.id === "due"); if (l) { clearAll(); setListId(l.id); } }} />
              <Kpi label="Top 20% share" value={`${Math.round(sum.top20Share * 100)}%`} sub={`of ${$(sum.totalValue)} lifetime value`} color={PUR_LL} />
            </div>

            {/* Ask */}
            <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
              <div className="flex gap-2">
                <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && describe(ask)} placeholder='Ask your clients anything: "VIPs who haven&apos;t been in for 6 weeks"' className="flex-1 rounded-lg px-4 py-3 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                <button onClick={() => describe(ask)} disabled={asking || ask.trim().length < 3} className="px-5 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: PUR_L }}>{asking ? "Reading..." : "Find"}</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">{EXAMPLES.map((e) => <button key={e} onClick={() => { setAsk(e); describe(e); }} className="text-[11px] px-3 py-1 rounded-full hover:text-white" style={{ background: CARD2, color: MUTED, border: `1px solid ${BDR}` }}>{e}</button>)}</div>
              {nl && <div className="text-xs mt-3" style={{ color: PUR_LL }}>{nl.note} <button className="underline ml-2" onClick={() => setNl(null)}>Clear</button></div>}
            </div>

            {/* Smart lists */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Smart lists (update themselves)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {lists.map((l) => (
                  <button key={l.id} onClick={() => { setNl(null); setRadarIds(null); setListId(listId === l.id ? null : l.id); }} className="text-left rounded-xl p-4 border transition-all" style={{ background: listId === l.id ? `${l.color}18` : CARD, borderColor: listId === l.id ? l.color : BDR }}>
                    <div className="flex items-baseline justify-between"><div className="text-sm font-semibold" style={{ color: l.color }}>{l.name}</div><div className="text-xl font-bold">{l.n}</div></div>
                    <div className="text-[11px] mt-1 text-slate-500 leading-snug">{l.hint}</div>
                    {l.n > 0 && <div className="text-[10px] mt-2" style={{ color: MUTED }}>{$(l.value)} lifetime value</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr_1fr] gap-4">
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="flex items-baseline justify-between mb-1"><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Return radar: who's due back, next 3 weeks</div>{radarIds && <button className="text-[11px] underline" style={{ color: GOLD }} onClick={() => setRadarIds(null)}>Showing {radarIds.label}. Clear</button>}</div>
                <div className="text-[11px] mb-2 text-slate-500">Predicted from each client's own rhythm. Click a bar to see who.</div>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={radar} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: MUTED }} interval={0} angle={-35} textAnchor="end" height={44} axisLine={false} tickLine={false} /><YAxis hide domain={[0, radarMax + 1]} />
                    <Tooltip contentStyle={TIP} cursor={{ fill: "#ffffff08" }} formatter={(v: any, _n, p: any) => [`${v} clients (about ${$(p.payload.value)})`, ""]} labelFormatter={(l) => l === "Due" ? "Due now (rhythm says they should have booked)" : String(l)} />
                    <Bar dataKey="n" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: any) => d?.ids?.length && (setListId(null), setNl(null), setRadarIds({ label: d.label === "Due" ? "due now" : d.label, ids: d.ids }))}>
                      {radar.map((r, i) => <Cell key={i} fill={r.overdue ? GOLD : PUR_L} fillOpacity={radarIds && radarIds.ids.join() !== r.ids.join() ? 0.35 : 0.9} />)}
                    </Bar></BarChart></ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Retention ladder</div>
                <div className="text-[11px] mb-2 text-slate-500">Of every 100 clients, how many reach each visit</div>
                <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sum.ladder} margin={{ left: 0, right: 0, top: 14, bottom: 0 }}>
                  <XAxis dataKey="step" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis hide domain={[0, 100]} />
                  <Tooltip contentStyle={TIP} cursor={{ fill: "#ffffff08" }} formatter={(v: any, _n, p: any) => [`${v}% (${p.payload.n} clients)`, ""]} />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]} label={{ position: "top", fontSize: 10, fill: "#cbd5e1", formatter: (v: any) => `${v}%` }}>{sum.ladder.map((_, i) => <Cell key={i} fill={i === 1 ? GOLD : PUR_L} fillOpacity={0.85} />)}</Bar></BarChart></ResponsiveContainer></div>
              </div>
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Where your value sits</div>
                <div className="text-[11px] mb-2 text-slate-500">Top 10% of clients = {Math.round(sum.top10Share * 100)}% of lifetime value</div>
                <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={sum.pareto.map((p) => ({ ...p, even: p.pct }))} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.5} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="pct" tick={{ fontSize: 9, fill: MUTED }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} /><YAxis hide domain={[0, 100]} />
                  <Tooltip contentStyle={TIP} formatter={(v: any, n: any) => [`${v}%`, n === "share" ? "of lifetime value" : "if everyone were equal"]} labelFormatter={(l) => `Top ${l}% of clients`} />
                  <Area dataKey="share" stroke={GOLD} fill="url(#pg)" strokeWidth={2} /><Line dataKey="even" stroke={MUTED} strokeDasharray="4 4" dot={false} strokeWidth={1} /></ComposedChart></ResponsiveContainer></div>
              </div>
            </div>

            {/* Table */}
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or last 4 digits  ( / )" className="rounded-lg px-4 py-2 text-sm outline-none w-72" style={{ background: CARD, border: `1px solid ${BDR}` }} />
                <div className="flex gap-1.5 flex-wrap">{(["R_loyal", "R_on_fence", "R_at_risk", "X", "C"] as MarkovKey[]).map((s) => { const on = stateF.includes(s); return <button key={s} onClick={() => setStateF((x) => on ? x.filter((y) => y !== s) : [...x, s])} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: on ? PUR_L : BDR, background: on ? `${PUR_L}22` : CARD, color: on ? PUR_LL : "#94A3B8" }}>{STATE_NAME[s]}</button>; })}</div>
                <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: MUTED }}>
                  <span>{filtered.length} client{filtered.length === 1 ? "" : "s"}{activeList ? ` in "${activeList.name}"` : ""}</span>
                  {anyFilter && <button className="underline" onClick={clearAll}>Clear filters</button>}
                  <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg border" style={{ borderColor: BDR }}>Export CSV</button>
                  <button disabled={!filtered.length} onClick={() => setSel(new Set(filtered.slice(0, 100).map((r) => r.user_id)))} className="px-3 py-1.5 rounded-lg border disabled:opacity-30" style={{ borderColor: BDR }}>Select top {Math.min(100, filtered.length)}</button>
                </div>
              </div>
              <div className="rounded-xl border overflow-x-auto" style={{ background: CARD, borderColor: BDR }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ borderBottom: `1px solid ${BDR}` }}>
                    <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={filtered.length > 0 && filtered.slice(0, shown).every((r) => sel.has(r.user_id))} onChange={(e) => setSel((s) => { const n = new Set(s); filtered.slice(0, shown).forEach((r) => e.target.checked ? n.add(r.user_id) : n.delete(r.user_id)); return n; })} style={{ accentColor: PUR_L }} /></th>
                    {th("name", "Client")}<th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Status</th>{th("daysSince", "Last visit")}{th("due", "Next expected")}
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Rhythm</th>{th("visits", "Visits")}{th("clv", "Lifetime")}{th("odds", "Return odds")}{th("stake", "At stake")}<th className="w-20" />
                  </tr></thead>
                  <tbody>
                    {filtered.slice(0, shown).map((r) => { const ds = dueStatus(r); const m = DUE_META[ds]; const on = sel.has(r.user_id); const gp = Math.min(r.gap_ratio / 2, 1);
                      return (
                        <tr key={r.user_id} onClick={() => router.push(`/merchant/clients/${r.user_id}`)} className="cursor-pointer border-b hover:bg-white/[0.03]" style={{ borderColor: "#1d1238", background: on ? `${PUR_L}12` : undefined }}>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSel((s) => { const n = new Set(s); on ? n.delete(r.user_id) : n.add(r.user_id); return n; })} style={{ accentColor: PUR_L }} /></td>
                          <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className="font-medium">{r.name}</span><span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: TIER_COLOR[r.tier], background: `${TIER_COLOR[r.tier]}1f` }}>{r.tier}</span></div><div className="text-[10px]" style={{ color: MUTED }}>{STATE_NAME[r.state]}{r.phoneLast4 ? ` · ...${r.phoneLast4}` : ""}{!r.smsOk ? " · can't text" : r.cooling ? " · texted recently" : ""}</div></td>
                          <td className="px-3 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: m.color, background: `${m.color}1f` }}>{m.label}</span></td>
                          <td className="px-3 py-2.5 text-slate-300">{r.booked ? <span style={{ color: MUTED }}>–</span> : <>{fmtDate(r.lastVisit)}<div className="text-[10px]" style={{ color: MUTED }}>{r.daysSince}d ago</div></>}</td>
                          <td className="px-3 py-2.5">{r.nextDue ? <><span style={{ color: r.booked ? "#38BDF8" : (r.daysToDue ?? 0) < 0 ? GOLD : "#cbd5e1" }}>{fmtDate(r.nextDue)}</span><div className="text-[10px]" style={{ color: MUTED }}>{r.booked ? "booked" : (r.daysToDue ?? 0) < 0 ? `${-(r.daysToDue ?? 0)}d late` : (r.daysToDue ?? 0) === 0 ? "today" : `in ${r.daysToDue}d`}</div></> : <span style={{ color: MUTED }}>–</span>}</td>
                          <td className="px-3 py-2.5 w-28">{r.visits >= 2 && !r.booked ? <div title={`${r.gap_ratio.toFixed(1)}x their usual gap`}><div className="h-1.5 rounded-full overflow-hidden" style={{ background: CARD2 }}><div className="h-full rounded-full" style={{ width: `${Math.max(4, gp * 100)}%`, background: m.color }} /></div><div className="text-[9px] mt-0.5" style={{ color: MUTED }}>{r.gap_ratio.toFixed(1)}x usual gap</div></div> : <span className="text-[10px]" style={{ color: MUTED }}>{r.booked ? "in the diary" : "needs more visits"}</span>}</td>
                          <td className="px-3 py-2.5 text-slate-300">{r.visits}</td>
                          <td className="px-3 py-2.5 text-slate-300">{$(r.clv)}</td>
                          <td className="px-3 py-2.5 w-28"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: CARD2 }}><div className="h-full rounded-full" style={{ width: `${r.returnOdds}%`, background: r.returnOdds >= 70 ? GREEN : r.returnOdds >= 45 ? GOLD : RED }} /></div><span className="text-[11px] w-8">{r.returnOdds}%</span></div></td>
                          <td className="px-3 py-2.5 font-semibold" style={{ color: r.at_stake > 100 ? GOLD : "#94A3B8" }}>{r.at_stake ? $(r.at_stake) : "–"}</td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>{r.smsOk && !r.booked && !r.cooling && <button onClick={() => setBulk([r])} className="text-[11px] px-2.5 py-1 rounded-md font-semibold" style={{ background: `${PUR_L}33`, color: PUR_LL }}>Text</button>}</td>
                        </tr>); })}
                    {!filtered.length && <tr><td colSpan={11} className="px-3 py-12 text-center text-sm" style={{ color: MUTED }}>No clients match. <button className="underline" onClick={clearAll}>Clear filters</button></td></tr>}
                  </tbody>
                </table>
              </div>
              {filtered.length > shown && <div className="text-center mt-4"><button onClick={() => setShown((n) => n + 60)} className="px-5 py-2 rounded-lg text-sm border" style={{ borderColor: BDR, color: PUR_LL }}>Show {Math.min(60, filtered.length - shown)} more ({filtered.length - shown} left)</button></div>}
              <div className="text-[10px] mt-4" style={{ color: MUTED }}>Rhythm, next-expected dates and return odds are model estimates from each client's own visit history. "At stake" = lifetime value x chance they stop coming.</div>
            </div>
          </>
        )}
      </div>

      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-2xl px-5 py-3 border shadow-2xl" style={{ background: "#1A1030", borderColor: PUR_L }}>
          <div className="text-sm"><span className="font-bold">{sel.size}</span> selected <span style={{ color: MUTED }}>· {reachable.length} can be texted now · about {$(reachable.length * 0.08).replace(/^\$0$/, "$0.00")}</span></div>
          <button disabled={!reachable.length} onClick={() => setBulk(chosen)} className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>Text them (AI writes each)</button>
          <button onClick={() => setSel(new Set())} className="text-xs underline" style={{ color: MUTED }}>Clear</button>
        </div>
      )}
      {bulk && cfg && <BulkSendModal customers={bulk.map(toBulk)} label={bulk.length === 1 ? bulk[0].name : "Selected clients"} hex={PUR_LL} maxChars={cfg.body_max} onClose={() => setBulk(null)} onSent={() => { setSel(new Set()); load(true); }} />}
    </div>
  );
}
