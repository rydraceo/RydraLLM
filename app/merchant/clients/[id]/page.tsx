"use client";
// Client 360: everything about one client on a page, what to do about it, and a one-tap way to do it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiFetch } from "@/lib/ai/client";
import { DiaryWidget } from "@/app/components/diary-widget";
import { DUE_META, dueStatus, type ClientRow } from "@/lib/clients/insights";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const TIP = { backgroundColor: CARD, border: "1px solid #3A2268", borderRadius: 4, color: "#fff", fontSize: 11 };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" },
  { href: "/merchant/clients", label: "Clients", active: true }, { href: "/merchant/barber", label: "Barbers" },
];
const STATE_NAME: Record<string, string> = { X: "Lapsed", R_at_risk: "At risk", R_on_fence: "Due soon", C: "First-timer", R_loyal: "Loyal" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const dshort = (d: string | null) => (d ? new Date(d.length <= 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit", timeZone: d.length <= 10 ? "UTC" : "Australia/Sydney" }) : "–");

function Box({ title, sub, children, className = "" }: { title?: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-5 border ${className}`} style={{ background: CARD, borderColor: BDR }}>
      {title && <div className="mb-3"><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{title}</div>{sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}</div>}
      {children}
    </div>
  );
}

function BarberPicker({ id }: { id: string }) {
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const load = useCallback(async () => { try { const r = await aiFetch(`/api/clients/${id}/barber`); const j = await r.json(); if (r.ok) setD(j); } catch {} }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const primary = d.links.find((l: any) => l.is_primary);
  async function set(v: string) {
    setBusy(true); setNote("");
    try { const r = await aiFetch(`/api/clients/${id}/barber`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber_id: v || null }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setNote("Saved"); await load(); }
    catch (e: any) { setNote(e?.message || "Couldn't save"); } setBusy(false);
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
      <span style={{ color: MUTED }}>Their barber</span>
      <select disabled={busy || !d.available} value={primary?.barber_id ?? ""} onChange={(e) => set(e.target.value)} className="rounded-md px-2 py-1 text-xs outline-none text-white" style={{ background: "#0A0612", border: `1px solid ${BDR}` }}>
        <option value="">{d.available ? "Not set" : "Run the barber SQL first"}</option>{d.barbers.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {primary && <span style={{ color: MUTED }}>{primary.source === "manual" ? "set by hand" : `${primary.visits} visits together`}</span>}
      {note && <span style={{ color: note === "Saved" ? GREEN : RED }}>{note}</span>}
    </div>
  );
}

export default function ClientPage() {
  const { id } = useParams() as { id: string };
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<any>(null); const [briefLoading, setBriefLoading] = useState(false);
  const [text, setText] = useState(""); const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false); const [sendNote, setSendNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showDiary, setShowDiary] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { const r = await aiFetch(`/api/clients/${id}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not load this client"); setD(j); setErr(""); }
    catch (e: any) { setErr(e?.message || "Could not load this client"); } finally { setLoading(false); }
  }, [id]);
  const loadBrief = useCallback(async (force = false) => {
    const key = `rydra-brief-${id}`;
    if (!force) { try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.at < 600_000) { setBrief(c.b); return; } } catch {} }
    setBriefLoading(true);
    try { const r = await aiFetch(`/api/clients/${id}/brief`, { method: "POST" }); const j = await r.json(); if (r.ok) { setBrief(j); try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), b: j })); } catch {} } } catch {}
    setBriefLoading(false);
  }, [id]);
  useEffect(() => { load(); loadBrief(); }, [load, loadBrief]);

  const c = d?.me;
  const row = useMemo(() => c ? ({ state: c.markov_state, booked: c.has_upcoming_booking, visits: c.visits, gap_ratio: c.gap_ratio } as ClientRow) : null, [c]);
  const status = row ? dueStatus(row) : "ontrack";
  const gapData = useMemo(() => (d?.gaps ?? []).slice(-14).map((g: number, i: number, a: number[]) => ({ n: `#${(d.gaps.length - a.length) + i + 2}`, gap: g })), [d]);
  const spendData = useMemo(() => (d?.events ?? []).filter((e: any) => e.revenue > 0 && !/cancel|no.?show/i.test(e.type)).slice(0, 14).reverse().map((e: any) => ({ date: dshort(e.date), revenue: e.revenue })), [d]);

  const timeline = useMemo(() => {
    if (!d) return [] as any[];
    const v = d.events.map((e: any) => ({ kind: "visit", at: e.date, ...e }));
    const t = d.outreach.map((o: any) => ({ kind: "text", at: String(o.sent_at).slice(0, 10), ...o }));
    return [...v, ...t].sort((a, b) => String(b.at).localeCompare(String(a.at)) || (a.kind === "text" ? -1 : 1));
  }, [d]);
  const sent = d?.outreach.filter((o: any) => !o.failed) ?? [];
  const worked = sent.filter((o: any) => o.rebooked_in_days !== null).length;
  const lastText = sent[0];
  const daysSinceText = lastText ? Math.floor((Date.now() - Date.parse(lastText.sent_at)) / 86400000) : null;

  async function draft() {
    if (!c) return; setDrafting(true); setSendNote(null);
    try {
      const r = await aiFetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: { name: c.name, visits: c.visits, gap_ratio: c.gap_ratio, days_overdue: c.days_since_last_visit, markov_state: c.markov_state, status: c.markov_state === "X" ? "X" : "" } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not write a message"); setText(j.message || "");
    } catch (e: any) { setSendNote({ ok: false, msg: e?.message || "Could not write a message" }); }
    setDrafting(false);
  }
  async function send() {
    if (!c || !text.trim()) return; setSending(true); setSendNote(null);
    try {
      const r = await aiFetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: id, message: text, customer_name: c.name, venue_id: VENUE_ID, markov_state: c.markov_state, gap_ratio: c.gap_ratio, days_overdue: c.days_since_last_visit }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Not sent");
      setSendNote({ ok: true, msg: "Sent. It will show in the timeline below." }); setText(""); load();
    } catch (e: any) { setSendNote({ ok: false, msg: e?.message || "Not sent" }); }
    setSending(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: "#0A0612", color: MUTED }}>Loading client...</div>;
  if (err || !d || !c) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm" style={{ background: "#0A0612" }}><div style={{ color: RED }}>{err || "Client not found"}</div><a href="/merchant/clients" className="underline" style={{ color: PUR_LL }}>Back to all clients</a></div>;

  const s = d.stats; const m = DUE_META[status];
  const odds = Math.round((1 - c.churn_score) * 100);
  const initials = c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const tierLabel = s.percentile ? (s.percentile <= 10 ? "VIP" : s.percentile <= 30 ? "Core" : "Regular") : "Regular";
  const dueText = c.has_upcoming_booking ? `Booked for ${dshort(c.last_visit_local)}` : s.nextDue ? (s.daysToDue < 0 ? `Expected ${dshort(s.nextDue)} (${-s.daysToDue} days late)` : s.daysToDue === 0 ? "Expected today" : `Expected ${dshort(s.nextDue)} (in ${s.daysToDue} days)`) : c.visits <= 1 ? "Needs a second visit to predict" : "No rhythm yet";
  const maxH = Math.max(1, ...d.habits.dow);
  const hrs = d.habits.hours ? Object.entries(d.habits.hours as Record<string, number>) : [];
  const hMax = Math.max(1, ...hrs.map(([, v]) => v));

  return (
    <div className="min-h-screen text-white pb-20" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} /><div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none truncate max-w-[200px]">{c.name}</div></div></div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${t.active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <a href="/merchant/clients" className="ml-auto text-[11px] hover:text-white" style={{ color: MUTED }}>&larr; All clients</a>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 pt-8 space-y-6">
        {/* Hero */}
        <div className="rounded-xl p-6 border flex flex-wrap items-center gap-6" style={{ background: CARD, borderColor: BDR }}>
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0" style={{ background: `${m.color}18`, border: `1px solid ${m.color}40`, color: m.color }}>{initials}</div>
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
              <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: m.color, background: `${m.color}1f` }}>{m.label}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: tierLabel === "VIP" ? GOLD : PUR_LL, background: `${tierLabel === "VIP" ? GOLD : PUR_LL}1f` }}>{tierLabel}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: MUTED, background: CARD2 }}>{STATE_NAME[c.markov_state]}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: MUTED }}>
              {d.contact.phone && <span>{d.contact.phone}</span>}{d.contact.email && <span>{d.contact.email}</span>}
              {s.firstVisit && <span>Client since {dshort(s.firstVisit)}</span>}
              {s.ltvRank && <span>#{s.ltvRank} of {s.of} by spend (top {s.percentile}%)</span>}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg" style={{ background: `${m.color}14`, color: m.color }}>{dueText}</div>
            <BarberPicker id={id} />
          </div>
          <div className="text-center px-4"><div className="text-4xl font-bold" style={{ color: odds >= 70 ? GREEN : odds >= 45 ? GOLD : RED }}>{odds}%</div><div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>chance they return</div></div>
          <button onClick={() => { composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); if (!text) draft(); }} disabled={c.sms_status !== "ok"} className="px-6 py-3 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>{c.sms_status === "ok" ? "Reach out" : "Can't text"}</button>
        </div>

        {/* AI brief */}
        <div className="rounded-xl p-5 border" style={{ background: "linear-gradient(135deg, #1B1240, #130C24)", borderColor: `${PUR_L}66` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PUR_LL }}>Before they sit down{brief?.source === "data" ? " (from your data)" : ""}</div>
            <button onClick={() => loadBrief(true)} disabled={briefLoading} className="text-[11px] underline disabled:opacity-40" style={{ color: MUTED }}>{briefLoading ? "Thinking..." : "Refresh"}</button>
          </div>
          {brief ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-2">
              <div><div className="text-lg font-semibold leading-snug">{brief.headline}</div><ul className="mt-3 space-y-1.5">{brief.points.map((p: string, i: number) => <li key={i} className="text-sm text-slate-300 flex gap-2"><span style={{ color: PUR_LL }}>•</span>{p}</li>)}</ul></div>
              <div className="rounded-lg p-4" style={{ background: "#0A0612AA", border: `1px solid ${BDR}` }}><div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Best next move</div><div className="font-semibold">{brief.move}</div><div className="text-xs mt-1.5 text-slate-400">{brief.why}</div></div>
            </div>
          ) : <div className="text-sm mt-3" style={{ color: MUTED }}>{briefLoading ? "Reading their history..." : "Brief unavailable right now."}</div>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            ["Visits", String(c.visits), s.tenureDays ? `over ${Math.round(s.tenureDays / 30)} months` : ""],
            ["Lifetime spend", $(c.clv_aud), s.ltvRank ? `#${s.ltvRank} of ${s.of}` : ""],
            ["Typical spend", $(s.avgTicket), s.ticketDelta === null ? "per visit" : s.ticketDelta > 1 ? `trending up ${$(s.ticketDelta)}` : s.ticketDelta < -1 ? `trending down ${$(-s.ticketDelta)}` : "steady"],
            ["Comes every", s.avgGap ? `${s.avgGap} days` : "–", d.trend ? d.trend.label.split(" (")[0] : ""],
            ["Yearly value", s.annualValue ? $(s.annualValue) : "–", "at their current pace"],
            ["No-shows", String(s.noShows + s.cancels), `${s.noShows} no-show, ${s.cancels} cancelled`],
          ].map(([l, v, sub]) => <div key={l} className="rounded-xl p-4 border" style={{ background: CARD, borderColor: BDR }}><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{l}</div><div className="text-2xl font-bold mt-1">{v}</div><div className="text-[11px] text-slate-500 mt-0.5">{sub}</div></div>)}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-6">
          <div className="space-y-6">
            <Box title="Rhythm" sub={d.trend ? d.trend.label : "Days between each visit, against their average"}>
              {gapData.length >= 2 ? (
                <div style={{ height: 200 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={gapData} margin={{ left: -12, right: 8, top: 8 }}>
                  <XAxis dataKey="n" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} unit="d" />
                  <Tooltip contentStyle={TIP} cursor={{ fill: "#ffffff08" }} formatter={(v: any) => [`${v} days`, "Gap before this visit"]} />
                  <Bar dataKey="gap" radius={[3, 3, 0, 0]}>{gapData.map((g: any, i: number) => <Cell key={i} fill={s.avgGap && g.gap > s.avgGap * 1.4 ? GOLD : PUR_L} fillOpacity={0.85} />)}</Bar>
                  {s.avgGap > 0 && <ReferenceLine y={s.avgGap} stroke={GREEN} strokeDasharray="4 4" label={{ value: `avg ${s.avgGap}d`, fill: GREEN, fontSize: 10, position: "insideTopRight" }} />}
                  {c.days_since_last_visit > 0 && !c.has_upcoming_booking && <ReferenceLine y={c.days_since_last_visit} stroke={m.color} strokeDasharray="2 3" label={{ value: `now ${c.days_since_last_visit}d`, fill: m.color, fontSize: 10, position: "insideBottomRight" }} />}
                </ComposedChart></ResponsiveContainer></div>
              ) : <div className="text-sm py-10 text-center" style={{ color: MUTED }}>Needs at least 3 visits to show a rhythm.</div>}
            </Box>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Box title="Spend per visit">
                {spendData.length >= 2 ? <div style={{ height: 150 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={spendData} margin={{ left: -20, right: 6, top: 6 }}><XAxis dataKey="date" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} /><Tooltip contentStyle={TIP} formatter={(v: any) => [$(Number(v)), "Spent"]} /><Line dataKey="revenue" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} /></ComposedChart></ResponsiveContainer></div> : <div className="text-sm py-8 text-center" style={{ color: MUTED }}>No spend history yet.</div>}
              </Box>
              <Box title="When they come" sub={d.habits.favDay !== null ? `Mostly ${DOW[d.habits.favDay]}s` : undefined}>
                <div className="flex items-end gap-1.5 h-24">{d.habits.dow.map((n: number, i: number) => <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full"><div className="w-full rounded-t" style={{ height: `${(n / maxH) * 100}%`, minHeight: n ? 4 : 2, background: n === Math.max(...d.habits.dow) && n > 0 ? GOLD : n ? PUR_L : CARD2 }} /><div className="text-[9px]" style={{ color: MUTED }}>{DOW[i]}</div></div>)}</div>
                {hrs.length > 0 && <div className="mt-3 space-y-1">{hrs.map(([k, v]) => <div key={k} className="flex items-center gap-2 text-[11px]"><div className="w-16 capitalize" style={{ color: MUTED }}>{k}</div><div className="flex-1 h-1.5 rounded-full" style={{ background: CARD2 }}><div className="h-full rounded-full" style={{ width: `${(v / hMax) * 100}%`, background: PUR_L }} /></div><div className="w-5 text-right">{v}</div></div>)}</div>}
              </Box>
            </div>
            {d.barbers.length > 0 && (
              <Box title="Barber loyalty" sub={d.barbers[0].share >= 0.8 ? `Loyal to ${d.barbers[0].name}. If ${d.barbers[0].name} is away, expect a skipped visit.` : "Sees a mix of barbers"}>
                <div className="space-y-2">{d.barbers.map((b: any) => <div key={b.name} className="flex items-center gap-3 text-sm"><div className="w-24 truncate">{b.name}</div><div className="flex-1 h-2 rounded-full" style={{ background: CARD2 }}><div className="h-full rounded-full" style={{ width: `${b.share * 100}%`, background: `linear-gradient(90deg, ${PUR}, ${PUR_L})` }} /></div><div className="w-24 text-right text-xs" style={{ color: MUTED }}>{b.visits} visits · {Math.round(b.share * 100)}%</div></div>)}</div>
              </Box>
            )}
          </div>

          <div className="space-y-6">
            <div ref={composerRef}>
              <Box title="Reach out" sub={c.sms_status === "ok" ? "Written by AI from their history. Edit anything before it goes." : "This client can't be texted (opted out, on hold, or no valid mobile)."}>
                {c.sms_status === "ok" ? (
                  <>
                    {c.has_upcoming_booking && <div className="text-xs rounded-lg p-2.5 mb-3" style={{ background: "#0F2A3A", color: "#7DD3FC" }}>They're already booked for {dshort(c.last_visit_local)}. A text isn't needed.</div>}
                    {daysSinceText !== null && daysSinceText < 7 && <div className="text-xs rounded-lg p-2.5 mb-3" style={{ background: "#2A2108", color: GOLD }}>Texted {daysSinceText === 0 ? "today" : `${daysSinceText} day${daysSinceText === 1 ? "" : "s"} ago`}. Give them space before another.</div>}
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Click 'Write it for me', or type your own..." className="w-full rounded-lg p-3 text-sm outline-none resize-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: text.length > 130 ? GOLD : MUTED }}><span>The opt-out line is added automatically.</span><span>{text.length} chars</span></div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={draft} disabled={drafting} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-40" style={{ borderColor: PUR_L, color: PUR_LL }}>{drafting ? "Writing..." : text ? "Write another" : "Write it for me"}</button>
                      <button onClick={send} disabled={sending || !text.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>{sending ? "Sending..." : "Send text"}</button>
                    </div>
                    {sendNote && <div className="text-xs mt-2" style={{ color: sendNote.ok ? GREEN : "#FDA4AF" }}>{sendNote.msg}</div>}
                    <div className="text-[10px] mt-3" style={{ color: MUTED }}>Expected value of a text to this client: about {$(Math.max(0, c.intervention_value_aud ?? 0))}. Estimate.</div>
                  </>
                ) : <div className="text-sm" style={{ color: MUTED }}>Status: {String(c.sms_status).replace(/_/g, " ")}.</div>}
              </Box>
            </div>

            <Box title="Timeline" sub={sent.length ? `${sent.length} text${sent.length === 1 ? "" : "s"} sent. ${worked} followed by a visit within 4 weeks.` : "Visits and texts together, newest first"}>
              {timeline.length === 0 ? <div className="text-sm py-6 text-center" style={{ color: MUTED }}>No history on record.</div> : (
                <div className="relative pl-5 max-h-[560px] overflow-y-auto pr-1">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: BDR }} />
                  {timeline.slice(0, 40).map((t: any, i: number) => t.kind === "visit" ? (
                    <div key={`v${i}`} className="relative mb-3"><div className="absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: /cancel|no.?show/i.test(t.type) ? RED : PUR_L }} />
                      <div className="flex justify-between text-sm"><span>{dshort(t.date)} <span className="text-[11px] capitalize" style={{ color: MUTED }}>{/cancel|no.?show/i.test(t.type) ? t.type : "visit"}{t.barber ? ` · ${t.barber}` : ""}</span></span>{t.revenue > 0 && <span style={{ color: GREEN }}>{$(t.revenue)}</span>}</div></div>
                  ) : (
                    <div key={`t${i}`} className="relative mb-3"><div className="absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: t.failed ? RED : GOLD }} />
                      <div className="rounded-lg p-3" style={{ background: CARD2 }}>
                        <div className="flex justify-between text-[11px] mb-1" style={{ color: MUTED }}><span>Text · {dshort(t.sent_at)}</span><span style={{ color: t.failed ? RED : t.rebooked_in_days !== null ? GREEN : MUTED }}>{t.failed ? "failed" : t.rebooked_in_days !== null ? `came back ${t.rebooked_in_days === 0 ? "same day" : `${t.rebooked_in_days} day${t.rebooked_in_days === 1 ? "" : "s"} later`}` : "no visit since"}</span></div>
                        <div className="text-xs text-slate-300 leading-relaxed">{t.message}</div></div></div>
                  ))}
                </div>
              )}
            </Box>
          </div>
        </div>

        <div>
          <button onClick={() => setShowDiary((v) => !v)} className="text-xs font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: BDR, color: PUR_LL }}>{showDiary ? "Hide" : "Show"} barber diary & notes</button>
          {showDiary && <div className="mt-4"><DiaryWidget venueId={VENUE_ID} customerId={id} customerName={c.name} mode="client" /></div>}
        </div>
      </div>
    </div>
  );
}
