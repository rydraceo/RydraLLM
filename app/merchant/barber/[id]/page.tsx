"use client";
// Barber HQ: performance against the team, their book of clients, their wallet, and (for the owner) the manager console.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, Cell, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiFetch } from "@/lib/ai/client";
import BulkSendModal from "@/app/components/bulk-send";
import { DiaryWidget } from "@/app/components/diary-widget";
import BarberWallet from "@/app/components/wallet/barber-wallet";
import OwnerConsole from "@/app/components/wallet/owner-console";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E", SKY = "#38BDF8";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const TIP = { backgroundColor: CARD, border: "1px solid #3A2268", borderRadius: 4, color: "#fff", fontSize: 11 };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" },
  { href: "/merchant/clients", label: "Clients" }, { href: "/merchant/barber", label: "Barbers", active: true },
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : `${(n * 100).toFixed(d)}%`);
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const STATUS: Record<string, { label: string; color: string }> = {
  due: { label: "Due now", color: "#EAB308" }, slipping: { label: "Slipping", color: "#FB923C" }, overdue: { label: "Overdue", color: RED }, lapsed: { label: "Lapsed", color: "#9F1239" },
  new: { label: "One visit", color: PUR_LL }, ontrack: { label: "On track", color: GREEN }, booked: { label: "Booked", color: SKY },
};
const dshort = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) : "–");
const hourLabel = (h: string) => { const n = Number(String(h).slice(0, 2)); return n === 12 ? "12pm" : n > 12 ? `${n - 12}pm` : `${n}am`; };

function Box({ title, sub, children, className = "", right }: { title?: string; sub?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return <div className={`rounded-xl p-5 border ${className}`} style={{ background: CARD, borderColor: BDR }}>{(title || right) && <div className="flex items-start justify-between gap-3 mb-3"><div>{title && <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{title}</div>}{sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}</div>{right}</div>}{children}</div>;
}
function Meter({ label, value, sub, color, mark }: { label: string; value: number | null; sub?: string; color: string; mark?: number | null }) {
  return <div><div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{label}</span><span className="font-bold">{value === null ? "–" : pct(value, 0)}</span></div>
    <div className="h-2 rounded-full relative" style={{ background: CARD2 }}>{value !== null && <div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />}{mark != null && <div className="absolute top-[-3px] w-0.5 h-3.5" style={{ left: `${Math.min(100, mark * 100)}%`, background: GOLD }} title="team average" />}</div>
    {sub && <div className="text-[10px] mt-0.5" style={{ color: MUTED }}>{sub}</div>}</div>;
}

function BarberPage() {
  const { id: slug } = useParams() as { id: string };
  const router = useRouter(); const sp = useSearchParams();
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"performance" | "wallet" | "manager">(() => (["wallet", "manager"].includes(String(sp.get("tab"))) ? (sp.get("tab") as any) : "performance"));
  const [filter, setFilter] = useState("risk"); const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<any[] | null>(null); const [showDiary, setShowDiary] = useState(false);
  const [dRebook, setDRebook] = useState(3); const [dTicket, setDTicket] = useState(4);

  const load = useCallback(async (refresh = false) => {
    try { const r = await aiFetch(`/api/team/${slug}${refresh ? "?refresh=1" : ""}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load this barber"); setD(j); setErr(""); }
    catch (e: any) { setErr(e?.message || "Could not load this barber"); } finally { setLoading(false); }
  }, [slug]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 120_000); return () => clearInterval(t); }, [load]);
  const goTab = (t: typeof tab) => { setTab(t); const u = new URL(window.location.href); if (t === "performance") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); window.history.replaceState(null, "", u.toString()); };

  const b = d?.barber, s = b?.stats, mt = b?.metrics, shop = d?.shop;
  const peers: any[] = d?.peers ?? [];
  const first = b?.name?.split(" ")[0] ?? "";
  const isOwner = /owner/i.test(b?.role ?? "");
  const book: any[] = mt?.book ?? [];
  const shown = useMemo(() => book.filter((c) => (filter === "all" ? true : filter === "risk" ? c.status === "slipping" || c.status === "overdue" : c.status === filter)), [book, filter]);
  const hours = useMemo(() => (Array.isArray(s?.hourly_breakdown) ? s.hourly_breakdown : []).map((h: any) => ({ h: hourLabel(h.hour), sales: num(h.gross_sales), qty: num(h.sales_qty) })), [s]);
  const rankOf = (key: string, higher = true) => { const vals = peers.filter((p) => p.stats).map((p) => num(p.stats[key])); const mine = num(s?.[key]); return [...vals].sort((a, c) => (higher ? c - a : a - c)).indexOf(mine) + 1; };
  const avgOf = (key: string) => { const v = peers.filter((p) => p.stats).map((p) => num(p.stats[key])); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
  const reachable = book.filter((c) => sel.has(c.user_id) && c.smsOk && !c.booked);
  const toBulk = (c: any) => ({ user_id: c.user_id, name: c.name, phone: "on file", markov_state: c.state, risk_segment: c.status, gap_ratio: c.gap_ratio, days_overdue: c.daysSince, intervention_value: Math.max(c.atStake * 0.15, 1), sms_blocked: !c.smsOk });

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: "#0A0612", color: MUTED }}>Loading...</div>;
  if (err || !b) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm" style={{ background: "#0A0612" }}><div style={{ color: RED }}>{err || "Barber not found"}</div><a href="/merchant/barber" className="underline" style={{ color: PUR_LL }}>Back to the team</a></div>;

  const gapPts = Math.max(0, (num(shop?.rebook_rate) - num(s?.rebook_rate)) * 100);
  const maxOf = (k: string, floor: number) => Math.max(...peers.map((p) => num(p.stats?.[k])), floor);
  const radar = s && shop ? [
    { k: "Rebooking", me: num(s.rebook_rate) / maxOf("rebook_rate", 0.01), shop: num(shop.rebook_rate) / maxOf("rebook_rate", 0.01) },
    { k: "Ticket size", me: num(s.avg_appt_value) / maxOf("avg_appt_value", 1), shop: num(shop.avg_appt_value) / maxOf("avg_appt_value", 1) },
    { k: "Upselling", me: num(s.upsell_rate) / maxOf("upsell_rate", 0.001), shop: num(shop.upsell_rate) / maxOf("upsell_rate", 0.001) },
    { k: "Loyalty", me: num(s.pct_returning_clients) / maxOf("pct_returning_clients", 0.01), shop: num(avgOf("pct_returning_clients")) / maxOf("pct_returning_clients", 0.01) },
    { k: "Requested", me: num(s.pct_requested_by_client) / maxOf("pct_requested_by_client", 0.01), shop: num(avgOf("pct_requested_by_client")) / maxOf("pct_requested_by_client", 0.01) },
    { k: "Occupancy", me: num(s.occupancy_rate) / maxOf("occupancy_rate", 0.01), shop: num(avgOf("occupancy_rate")) / maxOf("occupancy_rate", 0.01) },
  ].map((r) => ({ ...r, me: Math.round(r.me * 100), shop: Math.round(r.shop * 100) })) : [];
  const gainRebook = dRebook * num(d.pointValue), gainTicket = num(d.yearVisits) * dTicket;
  const dowMax = Math.max(1, ...(mt?.dow ?? [1]));
  const opp: { t: string; v: number; note: string; c: string }[] = [];
  if (gapPts >= 0.5) opp.push({ t: "Close the rebooking gap", v: gapPts * num(d.pointValue), note: `${(num(s.rebook_rate) * 100).toFixed(1)}% vs ${(num(shop.rebook_rate) * 100).toFixed(1)}% shop average`, c: RED });
  if (mt?.atRiskValue > 0) opp.push({ t: `Win back ${mt.atRiskCount} slipping regulars`, v: mt.atRiskValue, note: "lifetime value that is drifting away", c: GOLD });
  if (mt?.secondVisit > 0) opp.push({ t: `Secure ${mt.secondVisit} second visits`, v: mt.secondVisit * (num(s?.avg_appt_value) || 50) * 3, note: "one-visit clients still in the window (3 more visits each, estimate)", c: PUR_LL });
  if (s && num(s.avg_service_value) < num(shop?.avg_service_value) * 0.95) opp.push({ t: "Lift ticket size", v: (num(shop.avg_service_value) - num(s.avg_service_value)) * num(d.yearVisits), note: `$${num(s.avg_service_value).toFixed(0)} vs $${num(shop.avg_service_value).toFixed(0)} shop average per service`, c: GREEN });
  if (hours.length) { const lo = [...hours].sort((a, c) => a.sales - c.sales)[0], hi = [...hours].sort((a, c) => c.sales - a.sales)[0]; if (hi.sales > lo.sales * 1.6) opp.push({ t: `Fill the ${lo.h} slot`, v: (hi.sales - lo.sales) * 0.25, note: `${lo.h} earns ${$(lo.sales)} vs ${$(hi.sales)} at ${hi.h}. A quarter of that gap, if filled.`, c: SKY }); }
  opp.sort((x, y) => y.v - x.v);
  const period = s?.period_label ? `the Fresha stats period (${s.period_label})` : "the Fresha stats period";
  const hiHour = hours.length ? [...hours].sort((a, c) => c.sales - a.sales)[0] : null; const loHour = hours.length ? [...hours].sort((a, c) => a.sales - c.sales)[0] : null;
  const newPct = num(s?.pct_new_clients), retPct = num(s?.pct_returning_clients);

  return (
    <div className="min-h-screen text-white pb-28" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} /><div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none">{b.name}</div></div></div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${(t as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <a href="/merchant/barber" className="ml-auto text-[11px] hover:text-white" style={{ color: MUTED }}>&larr; Team</a>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 pt-8 space-y-6">
        <div className="rounded-xl p-6 border flex flex-wrap items-center gap-6" style={{ background: CARD, borderColor: BDR }}>
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{b.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{b.name}</h1>{isOwner && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: GOLD, background: `${GOLD}22` }}>OWNER</span>}</div>
            <div className="text-sm" style={{ color: MUTED }}><span className="capitalize">{b.role}</span>{s ? ` · ${num(s.avg_rating).toFixed(2)} stars from ${num(s.review_count)} reviews` : ""}{s?.period_label ? ` · stats for ${s.period_label}` : ""}</div>
            {s && <div className="flex flex-wrap gap-2 mt-3">{[["Revenue", rankOf("total_revenue")], ["Rebooking", rankOf("rebook_rate")], ["Ticket", rankOf("avg_appt_value")], ["Upselling", rankOf("upsell_rate")], ["Requested", rankOf("pct_requested_by_client")]].map(([l, r]) => <span key={l as string} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: r === 1 ? `${GOLD}22` : CARD2, color: r === 1 ? GOLD : "#94A3B8" }}>{r === 1 ? "★ " : ""}#{r as number} {l} <span style={{ color: MUTED }}>of {peers.length}</span></span>)}</div>}
          </div>
          <a href={`/merchant/barber/${slug}/coach`} className="px-5 py-3 rounded-lg text-sm font-bold" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>Open RydraCoach</a>
        </div>

        <div className="flex gap-1 border-b" style={{ borderColor: BDR }}>
          {([["performance", "Performance"], ["wallet", "Wallet"], ...(isOwner ? [["manager", "Manager console"]] : [])] as [typeof tab, string][]).map(([k, l]) => <button key={k} onClick={() => goTab(k)} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider -mb-px border-b-2" style={{ borderColor: tab === k ? (k === "manager" ? GOLD : PUR_L) : "transparent", color: tab === k ? (k === "manager" ? GOLD : PUR_LL) : MUTED }}>{l}</button>)}
        </div>

        {tab === "wallet" && <BarberWallet barberId={b.id} barberName={b.name} />}
        {tab === "manager" && isOwner && <OwnerConsole teamStats={{ visits: num(d.visitCount), links: num(d.linkCount), level: d.dataLevel }} onChanged={() => load(true)} />}

        {tab === "performance" && (<>
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                ["Revenue", $(num(s.total_revenue)), mt?.hasVisits ? `${$(mt.revenue12m)} last 12 months` : `services ${$(num(s.services_revenue))}`, null],
                ["Rebook rate", pct(num(s.rebook_rate)), `shop ${pct(num(shop?.rebook_rate))}`, num(s.rebook_rate) - num(shop?.rebook_rate)],
                ["Avg appointment", $(num(s.avg_appt_value)), `shop ${$(num(shop?.avg_appt_value))}`, num(s.avg_appt_value) - num(shop?.avg_appt_value)],
                ["Upsell rate", pct(num(s.upsell_rate)), `shop ${pct(num(shop?.upsell_rate))}`, num(s.upsell_rate) - num(shop?.upsell_rate)],
                ["Occupancy", pct(num(s.occupancy_rate), 0), `team ${pct(avgOf("occupancy_rate"), 0)}`, num(s.occupancy_rate) - num(avgOf("occupancy_rate"))],
                ["Appointments", num(s.total_appts).toLocaleString(), mt?.weeklyVisits ? `${mt.weeklyVisits}/wk lately` : `${num(s.total_clients)} clients`, null],
              ].map(([l, v, sub, delta]) => <div key={l as string} className="rounded-xl p-4 border" style={{ background: CARD, borderColor: BDR }}><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{l}</div><div className="text-2xl font-bold mt-1.5">{v}</div><div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "#64748B" }}>{delta !== null && <span style={{ color: (delta as number) >= 0 ? GREEN : RED }}>{(delta as number) >= 0 ? "▲" : "▼"}</span>}{sub}</div></div>)}
            </div>
          )}

          {opp.length > 0 && (
            <Box title="Where the money is" sub={`Biggest opportunities first. Estimates, measured over ${period}.`}>
              <div className={`grid grid-cols-1 gap-3 ${opp.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : opp.length === 3 ? "md:grid-cols-3" : opp.length === 2 ? "md:grid-cols-2" : ""}`}>{opp.slice(0, 4).map((o) => <div key={o.t} className="rounded-lg p-4" style={{ background: CARD2, borderLeft: `3px solid ${o.c}` }}><div className="text-xl font-bold" style={{ color: o.c }}>{$(o.v)}</div><div className="text-sm font-semibold mt-1">{o.t}</div><div className="text-[11px] mt-1" style={{ color: MUTED }}>{o.note}</div></div>)}</div>
            </Box>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            <div className="space-y-6">
              {hours.length > 0 && (
                <Box title="When the money comes in" sub={hiHour && loHour ? `Busiest: ${hiHour.h} (${$(hiHour.sales)}). Quietest: ${loHour.h} (${$(loHour.sales)}). Sales by hour over ${period}.` : undefined}
                  right={loHour ? <a href={`/merchant/campaign`} className="text-[11px] font-semibold px-3 py-1.5 rounded-md whitespace-nowrap" style={{ background: `${SKY}22`, color: SKY }}>Fill quiet hours</a> : null}>
                  <div style={{ height: 200 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={hours} margin={{ left: -10, right: 8, top: 8 }}>
                    <XAxis dataKey="h" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip contentStyle={TIP} cursor={{ fill: "#ffffff08" }} formatter={(v: any, n: any, p: any) => [`${$(Number(v))} from ${p.payload.qty} sales`, "Sales"]} />
                    <Bar dataKey="sales" radius={[4, 4, 0, 0]}>{hours.map((h: any, i: number) => <Cell key={i} fill={hiHour && h.h === hiHour.h ? GOLD : loHour && h.h === loHour.h ? SKY : b.color_from} fillOpacity={0.9} />)}</Bar></BarChart></ResponsiveContainer></div>
                </Box>
              )}

              {s && (
                <Box title="Who sits in the chair" sub={`From Fresha, ${s.period_label ?? "latest period"}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-300">New vs returning clients</span><span style={{ color: MUTED }}>{num(s.total_clients)} clients</span></div>
                      <div className="h-6 rounded-lg overflow-hidden flex text-[10px] font-bold">
                        <div className="flex items-center justify-center" style={{ width: `${newPct * 100}%`, background: PUR_L }}>{newPct > 0.12 ? `${Math.round(newPct * 100)}% new` : ""}</div>
                        <div className="flex items-center justify-center" style={{ width: `${retPct * 100}%`, background: GREEN, color: "#052e1c" }}>{retPct > 0.12 ? `${Math.round(retPct * 100)}% returning` : ""}</div>
                      </div>
                      <div className="text-[11px] mt-2" style={{ color: "#94A3B8" }}>{newPct > 0.6 ? `${first} sees a lot of new faces. Every first-timer rebooked in the chair is a future regular.` : `A solid base of returning clients.`} {num(s.rebooked_clients)} clients rebooked.</div>
                    </div>
                    <div className="space-y-3">
                      <Meter label="Asked for by name" value={num(s.pct_requested_by_client)} color={GOLD} mark={avgOf("pct_requested_by_client")} sub="gold mark = team average" />
                      <Meter label="Booked online" value={num(s.pct_online)} color={SKY} mark={avgOf("pct_online")} />
                      <Meter label="Chair occupancy" value={num(s.occupancy_rate)} color={PUR_L} mark={avgOf("occupancy_rate")} />
                    </div>
                  </div>
                </Box>
              )}

              {mt?.hasVisits && (
                <Box title="Revenue, last 12 months" sub="From imported visit history">
                  <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={mt.months.map((x: any) => ({ ...x, label: new Date(x.m + "-15").toLocaleDateString("en-AU", { month: "short" }) }))} margin={{ left: -10, right: 8, top: 8 }}>
                    <defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={b.color_from} stopOpacity={0.5} /><stop offset="100%" stopColor={b.color_from} stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip contentStyle={TIP} formatter={(v: any) => [$(Number(v)), "Revenue"]} /><Area dataKey="revenue" stroke={b.color_from} strokeWidth={2} fill="url(#rv)" /></AreaChart></ResponsiveContainer></div>
                </Box>
              )}

              {mt && book.length > 0 ? (
                <Box title={`${first}'s book of clients`} sub={`${book.length} clients see ${first} most. ${$(mt.bookValue)} lifetime value.`}>
                  <div className="flex flex-wrap gap-1.5 mb-3">{[["risk", `Running late (${book.filter((c) => c.status === "slipping" || c.status === "overdue").length})`], ["due", `Due now (${book.filter((c) => c.status === "due").length})`], ["new", `One visit (${book.filter((c) => c.status === "new").length})`], ["lapsed", `Lapsed (${book.filter((c) => c.status === "lapsed").length})`], ["booked", `Booked (${book.filter((c) => c.status === "booked").length})`], ["all", "Everyone"]].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: filter === k ? PUR_L : CARD2, color: filter === k ? "#fff" : "#94A3B8" }}>{l}</button>)}
                    <button onClick={() => setSel(new Set(shown.filter((c) => c.smsOk && !c.booked).slice(0, 25).map((c) => c.user_id)))} className="ml-auto px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: BDR, color: PUR_LL }}>Select up to 25 who can be texted</button></div>
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: `1px solid ${BDR}` }}>{["", "Client", "Status", "Last visit", `Visits (with ${first})`, "Lifetime", "At stake"].map((h, i) => <th key={i} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                    <tbody>{shown.slice(0, 40).map((c) => { const st = STATUS[c.status]; const on = sel.has(c.user_id); return (
                      <tr key={c.user_id} className="border-b hover:bg-white/[0.03] cursor-pointer" style={{ borderColor: "#1d1238", background: on ? `${PUR_L}12` : undefined }} onClick={() => router.push(`/merchant/clients/${c.user_id}`)}>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={!c.smsOk || c.booked} checked={on} onChange={() => setSel((x) => { const n = new Set(x); on ? n.delete(c.user_id) : n.add(c.user_id); return n; })} style={{ accentColor: PUR_L }} /></td>
                        <td className="px-2 py-2 font-medium">{c.name}</td>
                        <td className="px-2 py-2"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: st.color, background: `${st.color}1f` }}>{st.label}</span></td>
                        <td className="px-2 py-2 text-slate-300">{c.booked ? "booked" : dshort(c.lastVisit)}<div className="text-[10px]" style={{ color: MUTED }}>{c.booked ? "" : `${c.daysSince}d ago`}</div></td>
                        <td className="px-2 py-2 text-slate-300">{c.visitsWithMe || "–"} <span style={{ color: MUTED }}>of {c.visits}</span></td><td className="px-2 py-2 text-slate-300">{$(c.clv)}</td>
                        <td className="px-2 py-2 font-semibold" style={{ color: c.atStake > 100 ? GOLD : "#94A3B8" }}>{c.atStake ? $(c.atStake) : "–"}</td></tr>); })}
                      {!shown.length && <tr><td colSpan={7} className="py-8 text-center text-sm" style={{ color: MUTED }}>Nobody in this group.</td></tr>}</tbody></table></div>
                </Box>
              ) : (
                <Box title={`${first}'s book of clients`}>
                  <div className="text-sm text-slate-300 leading-relaxed">Rydra doesn't know yet which clients see {first}. Fresha's customer list doesn't say which barber did each cut, so it needs the appointment history.</div>
                  <div className="text-[12px] mt-2" style={{ color: MUTED }}>Once it's imported, this shows {first}'s regulars, who's running late, one-visit clients to save, and lets {first} text them, plus the coach can name real clients.</div>
                  {isOwner ? <button onClick={() => goTab("manager")} className="mt-4 px-4 py-2 rounded-lg text-xs font-bold" style={{ background: GOLD, color: "#000" }}>Import client history</button>
                    : <a href={`/merchant/barber/${peers.find((p) => /owner/i.test(p.role ?? ""))?.slug ?? "jb-edwards"}?tab=manager`} className="inline-block mt-4 px-4 py-2 rounded-lg text-xs font-bold" style={{ background: GOLD, color: "#000" }}>Import it in the manager console</a>}
                  <div className="text-[11px] mt-3" style={{ color: MUTED }}>You can also set a client's barber by hand on any client's page.</div>
                </Box>
              )}
            </div>

            <div className="space-y-6">
              {radar.length > 0 && (
                <Box title={`${first} vs the shop`} sub="Each spoke is scaled to the best barber on the team">
                  <div style={{ height: 250 }}><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar} outerRadius="70%"><PolarGrid stroke={BDR} /><PolarAngleAxis dataKey="k" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                    <Radar name="Shop average" dataKey="shop" stroke={MUTED} fill={MUTED} fillOpacity={0.15} /><Radar name={first} dataKey="me" stroke={b.color_from} fill={b.color_from} fillOpacity={0.35} /><Tooltip contentStyle={TIP} /></RadarChart></ResponsiveContainer></div>
                  <div className="flex justify-center gap-4 text-[11px]"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: b.color_from }} />{first}</span><span className="flex items-center gap-1.5" style={{ color: MUTED }}><span className="w-2 h-2 rounded-full" style={{ background: MUTED }} />Shop average</span></div>
                </Box>
              )}
              <Box title="Leaderboard position" sub="Where each number ranks on the team">
                <div className="space-y-2.5">{[["Rebook rate", "rebook_rate", pct], ["Avg appointment", "avg_appt_value", (v: number) => $(v)], ["Upsell rate", "upsell_rate", pct], ["Returning clients", "pct_returning_clients", pct], ["Asked for by name", "pct_requested_by_client", pct]].map(([l, k, f]: any) => {
                  const sorted = peers.filter((p) => p.stats).sort((a, c) => num(c.stats[k]) - num(a.stats[k])); const top = sorted[0]; const r = sorted.findIndex((p) => p.slug === slug) + 1;
                  return <div key={k} className="flex items-center gap-3 text-xs"><div className="w-32 text-slate-300">{l}</div><div className="flex-1 flex gap-1">{sorted.map((p) => <div key={p.slug} className="flex-1 h-2 rounded-full" style={{ background: p.slug === slug ? b.color_from : CARD2 }} title={`${p.name}: ${f(num(p.stats[k]))}`} />)}</div><div className="w-24 text-right"><b>#{r}</b> <span style={{ color: MUTED }}>{r === 1 ? "top" : `top: ${top?.name.split(" ")[0]}`}</span></div></div>;
                })}</div>
              </Box>
              {mt?.hasVisits && (
                <Box title="Do clients come back?" sub="Measured from real visit history">
                  <div className="space-y-3">
                    <Meter label="Back within 45 days of a visit" value={mt.return45} color={PUR_L} mark={(() => { const v = peers.map((p) => p.return45).filter((x) => x !== null); return v.length > 1 ? v.reduce((a, c) => a + c, 0) / v.length : null; })()} sub={`${mt.return45n} visits measured`} />
                    <Meter label="First-timers who return within 60 days" value={mt.firstReturn} color={GREEN} mark={(() => { const v = peers.map((p) => p.firstReturn).filter((x) => x !== null); return v.length > 1 ? v.reduce((a, c) => a + c, 0) / v.length : null; })()} sub={`${mt.firstReturnN} first-timers`} />
                    <Meter label={`Return visits that stay with ${first}`} value={mt.keptWithMe} color={GOLD} />
                  </div>
                </Box>
              )}
              {mt?.hasVisits && (
                <Box title="Busiest days" sub="Visits, all imported history">
                  <div className="flex items-end gap-2 h-24">{mt.dow.map((n: number, i: number) => <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1"><div className="w-full rounded-t" style={{ height: `${(n / dowMax) * 100}%`, minHeight: n ? 4 : 2, background: n === dowMax ? GOLD : n ? PUR_L : CARD2 }} /><div className="text-[9px]" style={{ color: MUTED }}>{DOW[i]}</div></div>)}</div>
                </Box>
              )}
              <Box title="What-if calculator" sub={`What small habit changes are worth for ${first}, over a period like ${period}`}>
                <label className="block text-xs mb-3"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>Rebook rate up</span><span className="font-semibold text-white">+{dRebook} points</span></div><input type="range" min={0} max={10} value={dRebook} onChange={(e) => setDRebook(Number(e.target.value))} className="w-full" style={{ accentColor: PUR_L }} /></label>
                <label className="block text-xs mb-3"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>Average ticket up</span><span className="font-semibold text-white">+${dTicket}</span></div><input type="range" min={0} max={15} value={dTicket} onChange={(e) => setDTicket(Number(e.target.value))} className="w-full" style={{ accentColor: GOLD }} /></label>
                <div className="rounded-lg p-3 text-center" style={{ background: CARD2 }}><div className="text-3xl font-bold" style={{ color: GREEN }}>{$(gainRebook + gainTicket)}</div><div className="text-[11px]" style={{ color: MUTED }}>{$(gainRebook)} rebooking + {$(gainTicket)} ticket size</div></div>
                <div className="text-[10px] mt-2" style={{ color: MUTED }}>Based on {num(d.yearVisits).toLocaleString()} appointments. Each rebooking point = 1% of those appointments x the average appointment value. Estimate, not a promise.</div>
              </Box>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href={`/merchant/barber/${slug}/coach`} className="text-xs font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: GOLD, color: GOLD }}>Train with RydraCoach</a>
            <button onClick={() => setShowDiary((v) => !v)} className="text-xs font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: BDR, color: PUR_LL }}>{showDiary ? "Hide" : "Show"} diary & client notes</button>
          </div>
          {showDiary && <DiaryWidget venueId={VENUE_ID} barberSlug={slug} barberName={b.name} mode="barber" />}
        </>)}
      </div>

      {sel.size > 0 && tab === "performance" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-2xl px-5 py-3 border shadow-2xl" style={{ background: "#1A1030", borderColor: PUR_L }}>
          <div className="text-sm"><span className="font-bold">{sel.size}</span> selected <span style={{ color: MUTED }}>· {reachable.length} can be texted</span></div>
          <button disabled={!reachable.length} onClick={() => setBulk(reachable)} className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>Text them as {first} (AI writes each)</button>
          <button onClick={() => setSel(new Set())} className="text-xs underline" style={{ color: MUTED }}>Clear</button>
        </div>
      )}
      {bulk && <BulkSendModal customers={bulk.map(toBulk)} label={`${first}'s clients`} hex={PUR_LL} maxChars={d.config?.body_max ?? 100} onClose={() => setBulk(null)} onSent={() => { setSel(new Set()); load(true); }} />}
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><BarberPage /></Suspense>; }
