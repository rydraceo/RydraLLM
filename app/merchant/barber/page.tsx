"use client";
// Team command centre: who's doing what, where the money is leaking, and what to do about it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiFetch } from "@/lib/ai/client";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const TIP = { backgroundColor: CARD, border: "1px solid #3A2268", borderRadius: 4, color: "#fff", fontSize: 11 };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" },
  { href: "/merchant/clients", label: "Clients" }, { href: "/merchant/barber", label: "Barbers", active: true },
];
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const k$ = (n: number) => (n >= 10000 ? `$${(n / 1000).toFixed(0)}k` : $(n));
const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : `${(n * 100).toFixed(d)}%`);
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const first = (n: string) => n.split(" ")[0];

type B = any;
type MetricKey = "revenue" | "rebook" | "ticket" | "upsell" | "returning" | "requested" | "occupancy" | "online" | "return45" | "firstReturn" | "atRisk";
type Metric = { key: MetricKey; label: string; get: (b: B) => number | null; fmt: (v: number | null) => string; higherBetter: boolean; needs?: "visits" | "links" };
const ALL_METRICS: Metric[] = [
  { key: "revenue", label: "Revenue", get: (b) => (b.stats ? num(b.stats.total_revenue) : null), fmt: (v) => (v === null ? "–" : k$(v)), higherBetter: true },
  { key: "rebook", label: "Rebook rate", get: (b) => (b.stats ? num(b.stats.rebook_rate) : null), fmt: (v) => pct(v), higherBetter: true },
  { key: "ticket", label: "Avg appointment", get: (b) => (b.stats ? num(b.stats.avg_appt_value) : null), fmt: (v) => (v === null ? "–" : $(v)), higherBetter: true },
  { key: "upsell", label: "Upsell rate", get: (b) => (b.stats ? num(b.stats.upsell_rate) : null), fmt: (v) => pct(v), higherBetter: true },
  { key: "returning", label: "Returning clients", get: (b) => (b.stats ? num(b.stats.pct_returning_clients) : null), fmt: (v) => pct(v), higherBetter: true },
  { key: "requested", label: "Asked for by name", get: (b) => (b.stats ? num(b.stats.pct_requested_by_client) : null), fmt: (v) => pct(v, 0), higherBetter: true },
  { key: "occupancy", label: "Occupancy", get: (b) => (b.stats ? num(b.stats.occupancy_rate) : null), fmt: (v) => pct(v, 0), higherBetter: true },
  { key: "online", label: "Booked online", get: (b) => (b.stats ? num(b.stats.pct_online) : null), fmt: (v) => pct(v, 0), higherBetter: true },
  { key: "return45", label: "Back within 45 days", get: (b) => b.metrics?.return45 ?? null, fmt: (v) => pct(v, 0), higherBetter: true, needs: "visits" },
  { key: "firstReturn", label: "First-timers who return", get: (b) => b.metrics?.firstReturn ?? null, fmt: (v) => pct(v, 0), higherBetter: true, needs: "visits" },
  { key: "atRisk", label: "Book at risk", get: (b) => (b.metrics ? b.metrics.atRiskValue : null), fmt: (v) => (v === null ? "–" : $(v)), higherBetter: false, needs: "links" },
];
let METRICS: Metric[] = ALL_METRICS;

function Spark({ data, color }: { data: number[]; color: string }) {
  const d = data.map((v, i) => ({ i, v }));
  return <div style={{ height: 38 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={d} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}><defs><linearGradient id={`sg${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><Area dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sg${color.slice(1)})`} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}

export default function BarbersPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("rebook");
  const [sort, setSort] = useState<{ k: MetricKey; dir: 1 | -1 }>({ k: "revenue", dir: -1 });
  const [dRebook, setDRebook] = useState(2); const [dTicket, setDTicket] = useState(3);

  const load = useCallback(async (refresh = false) => {
    setSyncing(true);
    try { const r = await aiFetch(`/api/team/overview${refresh ? "?refresh=1" : ""}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load the team"); setData(j); setErr(""); }
    catch (e: any) { setErr(e?.message || "Could not load the team"); } finally { setLoading(false); setSyncing(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 120_000); return () => clearInterval(t); }, [load]);

  const barbers: B[] = data?.barbers ?? [];
  const level: string = data?.dataLevel ?? "stats";
  METRICS = ALL_METRICS.filter((m) => !m.needs || (m.needs === "visits" ? level === "visits" : level !== "stats"));
  const owner = barbers.find((b) => /owner/i.test(b.role ?? ""));
  const [wallet, setWallet] = useState<any>(null);
  useEffect(() => { aiFetch("/api/wallet").then(async (r) => setWallet(r.ok ? await r.json() : { error: (await r.json().catch(() => ({}))).error ?? "unavailable" })).catch(() => {}); }, []);
  const heat = useMemo(() => { const hrs = new Set<string>(); barbers.forEach((b) => (Array.isArray(b.stats?.hourly_breakdown) ? b.stats.hourly_breakdown : []).forEach((h: any) => hrs.add(String(h.hour)))); const hours = [...hrs].sort(); const max = Math.max(1, ...barbers.flatMap((b) => (b.stats?.hourly_breakdown ?? []).map((h: any) => num(h.gross_sales)))); return { hours, max }; }, [barbers]);
  const shop = data?.shop;
  const m = METRICS.find((x) => x.key === metric)!;
  const sorted = useMemo(() => { const mm = METRICS.find((x) => x.key === sort.k)!; return [...barbers].sort((a, b) => ((mm.get(a) ?? -1) - (mm.get(b) ?? -1)) * sort.dir); }, [barbers, sort]);
  const rank = (b: B, key: MetricKey) => { const mm = METRICS.find((x) => x.key === key)!; const vals = barbers.map((x) => mm.get(x)).filter((v) => v !== null) as number[]; const v = mm.get(b); if (v === null || !vals.length) return null; const s = [...vals].sort((x, y) => (mm.higherBetter ? y - x : x - y)); return s.indexOf(v) + 1; };
  const shade = (b: B, key: MetricKey) => { const mm = METRICS.find((x) => x.key === key)!; const vals = barbers.map((x) => mm.get(x)).filter((v) => v !== null) as number[]; const v = mm.get(b); if (v === null || vals.length < 2) return "transparent"; const lo = Math.min(...vals), hi = Math.max(...vals); if (hi === lo) return "transparent"; let t = (v - lo) / (hi - lo); if (!mm.higherBetter) t = 1 - t; return t > 0.66 ? `${GREEN}18` : t < 0.34 ? `${RED}18` : "transparent"; };

  const team = useMemo(() => {
    const withM = barbers.filter((b) => b.metrics);
    const fr = withM.filter((b) => b.metrics.firstReturn !== null).map((b) => b.metrics.firstReturn as number);
    return {
      revenue: barbers.reduce((s, b) => s + num(b.stats?.total_revenue), 0), rebook: barbers.filter((b) => b.stats).reduce((s, b) => s + num(b.stats.rebook_rate), 0) / Math.max(1, barbers.filter((b) => b.stats).length),
      atRisk: withM.reduce((s, b) => s + b.metrics.atRiskValue, 0), atRiskN: withM.reduce((s, b) => s + b.metrics.atRiskCount, 0), due: withM.reduce((s, b) => s + b.metrics.dueSoon, 0),
      firstReturn: fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : null,
      occ: barbers.filter((b) => b.stats).reduce((s, b) => s + num(b.stats.occupancy_rate), 0) / Math.max(1, barbers.filter((b) => b.stats).length),
      req: barbers.filter((b) => b.stats).reduce((s, b) => s + num(b.stats.pct_requested_by_client), 0) / Math.max(1, barbers.filter((b) => b.stats).length),
      rebooked: barbers.reduce((s, b) => s + num(b.stats?.rebooked_clients), 0), reviews: barbers.reduce((s, b) => s + num(b.stats?.review_count), 0), rating: barbers.filter((b) => b.stats).reduce((s, b) => s + num(b.stats.avg_rating), 0) / Math.max(1, barbers.filter((b) => b.stats).length),
    };
  }, [barbers]);
  const whatIf = useMemo(() => ({ rebook: barbers.reduce((s, b) => s + num(b.pointValue) * dRebook, 0), ticket: barbers.reduce((s, b) => s + num(b.yearVisits) * dTicket, 0) }), [barbers, dRebook, dTicket]);

  const months = barbers.find((b) => b.metrics)?.metrics.months.map((x: any) => x.m) ?? [];
  const trend = months.map((mo: string, i: number) => { const row: any = { m: new Date(mo + "-15").toLocaleDateString("en-AU", { month: "short" }) }; barbers.forEach((b) => { if (b.metrics) row[b.slug] = b.metrics.months[i].revenue; }); return row; });
  const chartData = barbers.map((b) => ({ name: first(b.name), v: m.get(b), color: b.color_from })).filter((d) => d.v !== null);
  const shopLine = shop ? (metric === "rebook" ? shop.rebook_rate : metric === "ticket" ? shop.avg_appt_value : metric === "upsell" ? shop.upsell_rate : null) : null;

  function focus(b: B): { tag: string; color: string; note: string } {
    if (!b.stats) return { tag: "No data", color: MUTED, note: "" };
    const gapPts = Math.max(0, (num(shop?.rebook_rate) - num(b.stats.rebook_rate)) * 100);
    if (gapPts >= 1) return { tag: "Rebooking", color: RED, note: `Matching the shop average is worth about ${$(gapPts * num(b.pointValue))}/yr` };
    if (b.stats.avg_service_value < num(shop?.avg_service_value) * 0.9) return { tag: "Upsell", color: GOLD, note: "Ticket size is below the team" };
    if (b.metrics?.atRiskCount > 3) return { tag: "Look after regulars", color: "#FB923C", note: `${b.metrics.atRiskCount} regulars running late` };
    return { tag: "On track", color: GREEN, note: "Ahead of the shop on rebooking" };
  }

  return (
    <div className="min-h-screen text-white pb-20" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1500px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} /><div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none">Team Intelligence</div></div></div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${(t as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <button onClick={() => load(true)} className="ml-auto flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full border" style={{ borderColor: BDR, color: MUTED }}><span className={`w-1.5 h-1.5 rounded-full ${syncing ? "animate-pulse" : ""}`} style={{ background: GREEN }} />{syncing ? "Updating..." : "Live"}</button>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-8 pt-8 space-y-8">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "#2A0F1A", border: `1px solid ${RED}55`, color: "#FDA4AF" }}>{err}</div>}
        {loading ? <div className="text-sm" style={{ color: MUTED }}>Loading your team...</div> : data && (
          <>
            <div><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Alkami Barbershop · Canberra</div><div className="text-2xl font-semibold tracking-tight mt-1">Your team, and where the money is</div></div>
            {level !== "visits" && (
              <div className="rounded-xl px-5 py-4 flex flex-wrap items-center gap-4" style={{ background: "#2A2108", border: `1px solid ${GOLD}55` }}>
                <div className="flex-1 min-w-[260px]"><div className="text-sm font-semibold" style={{ color: GOLD }}>{level === "stats" ? "Unlock client books, retention and trends for every barber" : "Client books are on. Import visits to unlock retention and trends"}</div><div className="text-xs mt-0.5 text-slate-400">Fresha's client list doesn't say who cut whose hair. Import the Fresha appointments export once and every barber gets their own client book, retention and trend lines, and the coach can name real clients.</div></div>
                {owner && <a href={`/merchant/barber/${owner.slug}?tab=manager`} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: GOLD, color: "#000" }}>Import client history</a>}
              </div>
            )}

            {wallet && owner && (
              <a href={`/merchant/barber/${owner.slug}?tab=manager`} className="block rounded-xl p-4 border hover:border-[#3A2268]" style={{ background: CARD, borderColor: BDR }}>
                {wallet.error ? <div className="text-sm" style={{ color: GOLD }}>Barber wallets aren't set up yet. Open the manager console to finish set-up.</div> : (
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Barber wallets</div>
                    {[["Held", $((wallet.barbers ?? []).reduce((a: number, b: any) => a + b.balance_cents, 0) / 100), "#fff"], ["Set aside for tax", $((wallet.barbers ?? []).reduce((a: number, b: any) => a + b.tax_pot_cents, 0) / 100), GOLD], ["Requests waiting", String((wallet.payouts ?? []).filter((p: any) => p.status === "requested").length), GOLD], ["Ready to send", String((wallet.payouts ?? []).filter((p: any) => p.status === "approved").length), "#38BDF8"]].map(([l, v, c]) => <div key={l}><span className="text-lg font-bold" style={{ color: c }}>{v}</span> <span className="text-[11px]" style={{ color: MUTED }}>{l}</span></div>)}
                    <span className="ml-auto text-xs font-semibold" style={{ color: GOLD }}>Manager console &rarr;</span>
                  </div>)}
              </a>
            )}

            {data.insights?.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {data.insights.map((i: any, idx: number) => (
                  <div key={idx} onClick={() => i.slug && router.push(`/merchant/barber/${i.slug}`)} className={`rounded-xl p-4 border flex gap-3 ${i.slug ? "cursor-pointer hover:border-[#3A2268]" : ""}`} style={{ background: CARD, borderColor: BDR }}>
                    <div className="w-1 rounded-full flex-shrink-0" style={{ background: i.tone === "warn" ? GOLD : i.tone === "good" ? GREEN : PUR_L }} />
                    <div className="text-sm text-slate-200 leading-snug">{i.text}</div>
                  </div>))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                ["Team revenue", k$(team.revenue), `${barbers.length} barbers`, GREEN], ["Avg rebook rate", pct(team.rebook), `target 22%`, team.rebook >= 0.22 ? GREEN : GOLD],
                ...(level !== "stats" ? [["Book at risk", $(team.atRisk), `${team.atRiskN} regulars running late`, RED], ["Due back this week", String(team.due), "regulars about to book", GREEN]] : [["Avg occupancy", pct(team.occ, 0), "of available chair time booked", PUR_LL], ["Asked for by name", pct(team.req, 0), "clients requesting a barber", GOLD]]),
                level === "visits" ? ["First-timers return", pct(team.firstReturn, 0), "within 60 days", team.firstReturn !== null && team.firstReturn < 0.5 ? GOLD : GREEN] : ["Rebooked clients", team.rebooked.toLocaleString(), "rebooked before leaving", GREEN], ["Avg rating", team.rating ? team.rating.toFixed(2) : "–", `${team.reviews.toLocaleString()} reviews`, GOLD],
              ].map(([l, v, s, c]) => <div key={l as string} className="rounded-xl p-4 border" style={{ background: CARD, borderColor: BDR }}><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{l}</div><div className="text-2xl font-bold mt-1.5" style={{ color: c as string }}>{v}</div><div className="text-[11px] text-slate-500 mt-0.5">{s}</div></div>)}
            </div>

            {/* Leaderboard */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Leaderboard (click a column to sort, a row to open)</div>
              <div className="rounded-xl border overflow-x-auto" style={{ background: CARD, borderColor: BDR }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ borderBottom: `1px solid ${BDR}` }}><th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Barber</th>
                    {METRICS.map((x) => <th key={x.key} onClick={() => setSort((s) => ({ k: x.key, dir: s.k === x.key ? (s.dir === 1 ? -1 : 1) : -1 }))} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer whitespace-nowrap" style={{ color: sort.k === x.key ? PUR_LL : MUTED }}>{x.label}{sort.k === x.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}</th>)}</tr></thead>
                  <tbody>
                    {sorted.map((b) => (
                      <tr key={b.id} onClick={() => router.push(`/merchant/barber/${b.slug}`)} className="cursor-pointer border-b hover:bg-white/[0.03]" style={{ borderColor: "#1d1238" }}>
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{b.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div><div><div className="font-medium">{b.name}</div><div className="text-[10px] capitalize" style={{ color: MUTED }}>{b.role}</div></div></div></td>
                        {METRICS.map((x) => { const v = x.get(b); const r = rank(b, x.key); return <td key={x.key} className="px-3 py-3" style={{ background: shade(b, x.key) }}><span className="font-semibold">{x.fmt(v)}</span>{r === 1 && barbers.length > 1 && v !== null && <span className="ml-1.5 text-[9px]" style={{ color: GOLD }}>★</span>}</td>; })}
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="flex flex-wrap gap-1.5 mb-3">{METRICS.map((x) => <button key={x.key} onClick={() => setMetric(x.key)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ background: metric === x.key ? PUR_L : CARD2, color: metric === x.key ? "#fff" : MUTED }}>{x.label}</button>)}</div>
                <div style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ left: 0, right: 8, top: 18, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} /><YAxis hide />
                  <Tooltip contentStyle={TIP} cursor={{ fill: "#ffffff08" }} formatter={(v: any) => [m.fmt(Number(v)), m.label]} />
                  {shopLine !== null && <ReferenceLine y={shopLine} stroke={GOLD} strokeDasharray="4 4" label={{ value: "shop avg", fill: GOLD, fontSize: 10, position: "insideTopRight" }} />}
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 10, fill: "#cbd5e1", formatter: (v: any) => m.fmt(Number(v)) }}>{chartData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.9} />)}</Bar></BarChart></ResponsiveContainer></div>
              </div>
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>{level === "visits" ? "Revenue by month, last 12 months" : "Who brings in the revenue"}</div>
                {level === "visits" && trend.length ? <div style={{ height: 250 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ left: -10, right: 8, top: 10, bottom: 0 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip contentStyle={TIP} formatter={(v: any, n: any) => [$(Number(v)), first(barbers.find((b) => b.slug === n)?.name ?? n)]} />
                  {barbers.filter((b) => b.metrics).map((b) => <Line key={b.id} dataKey={b.slug} stroke={b.color_from} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer></div> : (
                  <div className="space-y-2.5 pt-2">
                    <div className="text-[11px] mb-2" style={{ color: MUTED }}>Share of team revenue (Fresha stats). Monthly trends appear once visit history is imported.</div>
                    {[...barbers].filter((b) => b.stats).sort((a, b) => num(b.stats.total_revenue) - num(a.stats.total_revenue)).map((b) => { const share = team.revenue ? num(b.stats.total_revenue) / team.revenue : 0; return (
                      <div key={b.id} className="flex items-center gap-3 text-xs"><div className="w-20 text-slate-300">{first(b.name)}</div><div className="flex-1 h-5 rounded relative" style={{ background: CARD2 }}><div className="h-full rounded" style={{ width: `${share * 100}%`, background: `linear-gradient(90deg, ${b.color_from}, ${b.color_to})` }} /></div><div className="w-28 text-right"><b>{Math.round(share * 100)}%</b> <span style={{ color: MUTED }}>{k$(num(b.stats.total_revenue))}</span></div></div>); })}
                  </div>)}
                <div className="flex flex-wrap gap-3 mt-1">{barbers.map((b) => <span key={b.id} className="text-[11px] flex items-center gap-1.5" style={{ color: "#94A3B8" }}><span className="w-2 h-2 rounded-full" style={{ background: b.color_from }} />{first(b.name)}</span>)}</div>
              </div>
            </div>

            {heat.hours.length > 0 && (
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>The floor by the hour</div>
                <div className="text-[11px] text-slate-500 mb-3">Sales by barber and hour of the day (Fresha stats). Darker = more money. Pale cells are chairs you could fill.</div>
                <div className="overflow-x-auto"><table className="w-full text-[11px] border-separate" style={{ borderSpacing: 3 }}>
                  <thead><tr><th />{heat.hours.map((h) => <th key={h} className="font-normal pb-1" style={{ color: MUTED }}>{(() => { const n = Number(h.slice(0, 2)); return n === 12 ? "12pm" : n > 12 ? `${n - 12}pm` : `${n}am`; })()}</th>)}<th className="font-normal pb-1 text-right pl-2" style={{ color: MUTED }}>Best hour</th></tr></thead>
                  <tbody>{barbers.filter((b) => b.stats?.hourly_breakdown?.length).map((b) => { const row = new Map((b.stats.hourly_breakdown as any[]).map((h) => [String(h.hour), h])); const best = [...(b.stats.hourly_breakdown as any[])].sort((x, y) => num(y.gross_sales) - num(x.gross_sales))[0]; return (
                    <tr key={b.id}><td className="pr-3 whitespace-nowrap text-slate-300">{first(b.name)}</td>
                      {heat.hours.map((h) => { const c = row.get(h); const v = num(c?.gross_sales); const t = v / heat.max; return <td key={h} title={`${b.name}, ${h}: ${$(v)} from ${num(c?.sales_qty)} sales`} className="h-8 rounded text-center align-middle" style={{ background: v ? `rgba(124,58,237,${0.12 + t * 0.88})` : CARD2, color: t > 0.55 ? "#fff" : "#94A3B8" }}>{v ? `${Math.round(v / 1000)}k` : ""}</td>; })}
                      <td className="pl-2 text-right whitespace-nowrap" style={{ color: GOLD }}>{best ? `${(() => { const n = Number(String(best.hour).slice(0, 2)); return n === 12 ? "12pm" : n > 12 ? `${n - 12}pm` : `${n}am`; })()}` : ""}</td></tr>); })}</tbody></table></div>
              </div>
            )}

            {/* What-if */}
            <div className="rounded-xl p-5 border" style={{ background: "linear-gradient(135deg, #1B1240, #130C24)", borderColor: `${PUR_L}66` }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: PUR_LL }}>Team what-if: what's a small habit change worth?</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <label className="block text-xs"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>Everyone rebooks more</span><span className="font-semibold text-white">+{dRebook} points</span></div><input type="range" min={0} max={10} value={dRebook} onChange={(e) => setDRebook(Number(e.target.value))} className="w-full" style={{ accentColor: PUR_L }} /></label>
                <label className="block text-xs"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>Everyone adds to the average ticket</span><span className="font-semibold text-white">+${dTicket}</span></div><input type="range" min={0} max={15} value={dTicket} onChange={(e) => setDTicket(Number(e.target.value))} className="w-full" style={{ accentColor: GOLD }} /></label>
                <div className="text-right"><div className="text-3xl font-bold" style={{ color: GREEN }}>{$(whatIf.rebook + whatIf.ticket)}<span className="text-sm font-normal" style={{ color: MUTED }}> / period</span></div><div className="text-[11px]" style={{ color: MUTED }}>{$(whatIf.rebook)} from rebooking + {$(whatIf.ticket)} from ticket size</div></div>
              </div>
              <div className="text-[10px] mt-3" style={{ color: MUTED }}>Estimate over a period like your Fresha stats period{barbers[0]?.stats?.period_label ? ` (${barbers[0].stats.period_label})` : ""}: each rebooking point = 1% of appointments x average appointment value; each ticket dollar = appointments x $1.</div>
            </div>

            {/* Cards */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Your barbers</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {barbers.map((b) => { const f = focus(b); const s = b.stats; const mt = b.metrics; return (
                  <div key={b.id} className="rounded-xl border overflow-hidden" style={{ background: CARD, borderColor: BDR }}>
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{b.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div>
                        <div className="flex-1 min-w-0"><div className="font-semibold">{b.name}</div><div className="text-[11px] capitalize" style={{ color: MUTED }}>{b.role}{rank(b, "revenue") ? ` · #${rank(b, "revenue")} on revenue` : ""}</div></div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ color: f.color, background: `${f.color}1f` }}>{f.tag}</span>
                      </div>
                      {mt && <Spark data={mt.months.map((x: any) => x.revenue)} color={b.color_from} />}
                      {s ? <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        {[["Revenue", k$(num(s.total_revenue))], ["Rebook", pct(num(s.rebook_rate))], ["Appt", $(num(s.avg_appt_value))]].map(([l, v]) => <div key={l} className="rounded-lg py-2" style={{ background: CARD2 }}><div className="text-[9px]" style={{ color: MUTED }}>{l}</div><div className="text-sm font-bold">{v}</div></div>)}
                      </div> : <div className="text-xs py-4 text-center" style={{ color: MUTED }}>No stats yet</div>}
                      {mt && <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                        {[["Due this week", String(mt.dueSoon), GREEN], ["Running late", String(mt.atRiskCount), mt.atRiskCount ? GOLD : MUTED], ["At risk", $(mt.atRiskValue), mt.atRiskValue ? RED : MUTED]].map(([l, v, c]) => <div key={l as string} className="rounded-lg py-2" style={{ background: CARD2 }}><div className="text-[9px]" style={{ color: MUTED }}>{l}</div><div className="text-sm font-bold" style={{ color: c as string }}>{v}</div></div>)}
                      </div>}
                      <div className="text-[11px] mt-3 min-h-[28px]" style={{ color: "#94A3B8" }}>{f.note}</div>
                    </div>
                    <div className="grid grid-cols-2 border-t" style={{ borderColor: BDR }}>
                      <a href={`/merchant/barber/${b.slug}`} className="py-3 text-center text-xs font-semibold hover:bg-white/5" style={{ color: PUR_LL }}>Open dashboard</a>
                      <a href={`/merchant/barber/${b.slug}/coach`} className="py-3 text-center text-xs font-semibold border-l hover:bg-white/5" style={{ color: GOLD, borderColor: BDR }}>RydraCoach</a>
                    </div>
                  </div>); })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
