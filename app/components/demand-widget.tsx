"use client";
// Demand forecast + cancellation slot-fill.
//  - Forecast comes from /api/intelligence/demand-heatmap (projected from client visit cycles, see lib/forecast/demand.ts)
//  - Clicking a day (or a slow-day card) ranks the clients most likely to take it via /api/intelligence/slot-fill
//  - "Write messages" hands exactly those clients to the bulk composer, which writes one personalised SMS each,
//    lets you edit/untick, and sends through the guarded /api/sms/send route.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiFetch } from "@/lib/ai/client";
import BulkSendModal from "@/app/components/bulk-send";

const CARD = "bg-[#130C24]", BDR = "border-[#2A1852]";
const GOLD = "#D4A017", GOLD2 = "#C9973A", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUT = "#6B5C8A", SURF = "#0F0A1E", CARD_S = "#130C24";
const STATE: Record<string, { label: string; hex: string }> = {
  C: { label: "First timer", hex: "#38BDF8" }, X: { label: "Churned", hex: "#F43F5E" }, R_at_risk: { label: "At risk", hex: "#FB923C" },
  R_on_fence: { label: "On fence", hex: "#FBBF24" }, R_loyal: { label: "Loyal", hex: "#34D399" },
};
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SMS_BODY_MAX = 160 - (23 + (process.env.NEXT_PUBLIC_SMS_OPTOUT_BASE_URL?.length ?? 35));

interface Day { date: string; label: string; dow: number; week_index: number; predicted_load: number; avg_bookings: number; confirmed: number; projected: number; typical_for_weekday: number; is_past: boolean; is_today: boolean; is_slow: boolean; is_opportunity: boolean; is_closed: boolean }
interface Ranked { user_id: string; name: string; markov_state: string; days_overdue: number; intervention_value: number; slot_score: number; reasons: string[]; habit_match: boolean }
interface Opp { date: string; label: string; dow: number; predicted_load: number; expected: number; reachable: number; top: Ranked[] }
interface Profile { dow: number; name: string; share: number; open: boolean }
interface SlotMeta { date: string; time: string; barber: string; weekday: string; label: string }

const loadColor = (l: number) => (l >= 75 ? "#34D399" : l >= 50 ? "#A78BFA" : l >= 30 ? "#FBBF24" : "#F43F5E");
const loadLabel = (l: number) => (l >= 75 ? "Busy" : l >= 50 ? "Moderate" : l >= 30 ? "Slow" : "Open");
const sydToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const addDay = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ago = (t: number | null) => { if (!t) return "loading"; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`; };

export function DemandHeatmapWidget({ venueId, customers }: { venueId: string; customers: any[] }) {
  const [days, setDays] = useState<Day[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [profile, setProfile] = useState<Profile[]>([]);
  const [totals, setTotals] = useState<{ confirmed_next_7: number; expected_next_7: number; clients_modelled: number } | null>(null);
  const [insight, setInsight] = useState(""); const [insightSrc, setInsightSrc] = useState(""); const [insightLoading, setInsightLoading] = useState(false);
  const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [error, setError] = useState(""); const [stale, setStale] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null); const [, setTick] = useState(0);
  const [selected, setSelected] = useState<Day | null>(null);

  // slot-fill
  const [barbers, setBarbers] = useState<string[]>([]);
  const [slotDate, setSlotDate] = useState(sydToday()); const [slotTime, setSlotTime] = useState(""); const [slotBarber, setSlotBarber] = useState("");
  const [ranking, setRanking] = useState(false); const [ranked, setRanked] = useState<Ranked[]>([]); const [slotMeta, setSlotMeta] = useState<SlotMeta | null>(null);
  const [totalCandidates, setTotalCandidates] = useState(0); const [slotError, setSlotError] = useState("");
  const [count, setCount] = useState(5); const [picked, setPicked] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false, refresh = false) => {
    if (inFlight.current) return; inFlight.current = true;
    if (silent) setSyncing(true);
    try {
      const r = await aiFetch(`/api/intelligence/demand-heatmap${refresh ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Could not load the forecast");
      setDays(d.heatmap ?? []); setOpps(d.opportunities ?? []); setProfile(d.profile ?? []); setTotals(d.totals ?? null);
      setLastSync(Date.now()); setStale(false); setError("");
      setSelected((s) => (s ? (d.heatmap ?? []).find((x: Day) => x.date === s.date) ?? null : s));
    } catch (e: any) { if (silent) setStale(true); else setError(e?.message || "Could not load the forecast"); }
    finally { inFlight.current = false; setSyncing(false); setLoading(false); }
  }, []);

  const loadInsight = useCallback(async (refresh = false) => {
    setInsightLoading(true);
    try {
      const r = await aiFetch(`/api/intelligence/demand-heatmap?part=insight${refresh ? "&refresh=1" : ""}`);
      const d = await r.json();
      if (r.ok && d.ai_insight) { setInsight(d.ai_insight); setInsightSrc(d.source || ""); }
    } catch {} finally { setInsightLoading(false); }
  }, []);

  useEffect(() => {
    load().then(() => loadInsight());
    aiFetch("/api/barbers").then((r) => r.json()).then((d) => setBarbers((d.barbers ?? []).map((b: any) => String(b.name)).filter(Boolean))).catch(() => {});
    const poll = setInterval(() => { if (!document.hidden) load(true); }, 5 * 60_000);
    const vis = () => { if (!document.hidden) load(true); };
    document.addEventListener("visibilitychange", vis);
    const tick = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => { clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", vis); };
  }, [load, loadInsight]);

  async function rank(date: string, time = slotTime, barber = slotBarber) {
    setRanking(true); setSlotError(""); setRanked([]); setComposer(false);
    try {
      const r = await aiFetch("/api/intelligence/slot-fill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot_date: date, slot_time: time || undefined, barber: barber || undefined, count: 15 }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not rank clients");
      setRanked(d.clients ?? []); setSlotMeta(d.slot); setTotalCandidates(d.total_candidates ?? 0);
      const n = Math.min(count, (d.clients ?? []).length);
      setPicked(new Set<string>((d.clients ?? []).slice(0, n).map((c: Ranked) => c.user_id)));
    } catch (e: any) { setSlotError(e?.message || "Could not rank clients"); }
    finally { setRanking(false); }
  }
  function fillDay(date: string) { setSlotDate(date); rank(date); setTimeout(() => document.getElementById("slot-fill-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
  function setCountAndPick(n: number) { setCount(n); setPicked(new Set(ranked.slice(0, n).map((c) => c.user_id))); }
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const byId = useMemo(() => new Map(customers.map((c) => [c.user_id, c])), [customers]);
  const composerList = useMemo(() => ranked.filter((c) => picked.has(c.user_id)).map((c) => byId.get(c.user_id)).filter(Boolean) as any[], [ranked, picked, byId]);

  const weeks = Array.from({ length: 6 }, (_, wi) => DOW_ORDER.map((dow) => days.find((d) => d.week_index === wi && d.dow === dow) ?? null));
  const futureOpen = days.filter((d) => !d.is_past && !d.is_closed);
  const slowest = [...futureOpen].sort((a, b) => a.predicted_load - b.predicted_load)[0];
  const maxShare = Math.max(1, ...profile.map((p) => p.share));
  const today = days.find((d) => d.is_today);

  if (loading) return (
    <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6 flex items-center gap-3`}>
      <div className="w-5 h-5 border rounded-full animate-spin" style={{ borderColor: "rgba(91,33,182,0.3)", borderTopColor: PUR_L }} />
      <span className="text-sm" style={{ color: MUT }}>Building your demand forecast...</span>
    </div>
  );

  return (
    <div className={`${CARD} border ${BDR} rounded-xl mb-6 overflow-hidden`}>
      {composer && slotMeta && (
        <BulkSendModal customers={composerList} fixed label={`Fill ${slotMeta.label}`} hex={PUR_L} maxChars={SMS_BODY_MAX} venueId={venueId}
          slot={{ label: slotMeta.label, time: slotMeta.time || undefined, barber: slotMeta.barber || undefined }}
          onClose={() => setComposer(false)} onSent={() => { setRanked([]); rank(slotMeta.date, slotMeta.time ? slotTime : "", slotMeta.barber); }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 gap-4 flex-wrap" style={{ borderBottom: "1px solid #2A1852" }}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: PUR_LL }}>Demand Forecast</div>
          <div className="text-sm font-semibold text-white">Next 6 weeks · click a day to see who could fill it</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px]" style={{ color: stale ? "#FB923C" : MUT, border: "1px solid #2A1852" }}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncing ? "animate-ping" : "animate-pulse"}`} style={{ background: stale ? "#FB923C" : "#34D399" }} />
            {stale ? "Reconnecting…" : `Live · ${ago(lastSync)}`}
          </span>
          <button onClick={() => { load(true, true); loadInsight(true); }} disabled={syncing || insightLoading}
            className="px-3.5 py-1.5 rounded-md text-[11px] font-medium border disabled:opacity-40" style={{ borderColor: "#3A2268", color: PUR_LL, background: "#1A1030" }}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="px-6 py-3 text-xs" style={{ color: "#FB923C" }}>{error}</div>}

      {/* KPI strip */}
      <div className="grid grid-cols-4 divide-x divide-[#2A1852]" style={{ borderBottom: "1px solid #2A1852" }}>
        {[
          { l: "Confirmed, next 7 days", v: totals ? String(totals.confirmed_next_7) : "–", s: "bookings already in the diary" },
          { l: "Expected, next 7 days", v: totals ? totals.expected_next_7.toFixed(0) : "–", s: "returning clients (projected)" },
          { l: "Today", v: today ? (today.is_closed ? "Closed" : `${today.predicted_load}%`) : "–", s: today && !today.is_closed ? `${loadLabel(today.predicted_load)} · ${today.confirmed} confirmed` : "no bookings expected" },
          { l: "Quietest upcoming day", v: slowest ? slowest.label : "–", s: slowest ? `${slowest.predicted_load}% load` : "" },
        ].map((k) => (
          <div key={k.l} className="px-6 py-3">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: MUT }}>{k.l}</div>
            <div className="text-xl font-bold text-white leading-none">{k.v}</div>
            <div className="text-[10px] mt-1" style={{ color: MUT }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 divide-x divide-[#2A1852]">
        {/* Grid */}
        <div className="col-span-3 p-5">
          <div className="flex items-center gap-4 mb-4">
            {[["Open", "#F43F5E"], ["Slow", "#FBBF24"], ["Moderate", "#A78BFA"], ["Busy", "#34D399"]].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: c, opacity: 0.75 }} /><span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: MUT }}>{l}</span></div>
            ))}
            <span className="ml-auto text-[9px]" style={{ color: MUT }}>Load = demand vs your busiest typical days</span>
          </div>
          <div className="grid grid-cols-8 gap-1 mb-1"><div />{DOW_ORDER.map((d) => <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider" style={{ color: MUT }}>{DOW_SHORT[d]}</div>)}</div>
          {weeks.map((week, wi) => {
            const first = week.find(Boolean);
            return (
              <div key={wi} className="grid grid-cols-8 gap-1 mb-1">
                <div className="flex items-center"><span className="text-[8px] uppercase tracking-wider whitespace-nowrap" style={{ color: MUT }}>{first ? first.label.split(" ").slice(1).join(" ") : `W${wi + 1}`}</span></div>
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="rounded-md h-11" style={{ background: "#1A1030", opacity: 0.3 }} />;
                  const dayNum = Number(day.date.slice(8));
                  if (day.is_closed) return <div key={di} className="rounded-md h-11 flex flex-col items-center justify-center" style={{ background: "#110820", border: "1px solid #1A1030" }} title={`${day.label} · closed`}><div className="text-[9px]" style={{ color: "#3A2268" }}>closed</div><div className="text-[8px]" style={{ color: "#3A2268" }}>{dayNum}</div></div>;
                  if (day.is_past) return <div key={di} className="rounded-md h-11 flex items-center justify-center" style={{ background: "#14102A", opacity: 0.45 }}><div className="text-[9px]" style={{ color: MUT }}>{dayNum}</div></div>;
                  const col = loadColor(day.predicted_load); const sel = selected?.date === day.date;
                  return (
                    <button key={di} onClick={() => setSelected((p) => (p?.date === day.date ? null : day))}
                      title={`${day.label} · ${day.predicted_load}% (${loadLabel(day.predicted_load)}) · ${day.confirmed} confirmed + ~${day.projected.toFixed(1)} projected`}
                      className="rounded-md h-11 flex flex-col items-center justify-center transition-all relative hover:brightness-125"
                      style={{ background: `${col}${sel ? "38" : "1A"}`, border: `1px solid ${col}${sel ? "90" : "30"}`, outline: day.is_today ? `2px solid ${GOLD}` : sel ? `2px solid ${col}` : undefined, outlineOffset: "1px", transform: sel ? "scale(1.06)" : undefined, zIndex: sel ? 1 : undefined }}>
                      <div className="text-[11px] font-bold leading-none" style={{ color: col }}>{day.predicted_load}%</div>
                      <div className="text-[8px] mt-0.5" style={{ color: col, opacity: 0.75 }}>{dayNum}{day.confirmed > 0 ? ` · ${day.confirmed}✓` : ""}</div>
                      {day.is_opportunity && <span className="absolute top-0.5 right-1 text-[8px]" style={{ color: GOLD }}>⚡</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {selected && (
            <div className="mt-3 rounded-lg p-4 border" style={{ background: SURF, borderColor: `${loadColor(selected.predicted_load)}50` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1"><div className="text-sm font-semibold text-white">{selected.label}</div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: `${loadColor(selected.predicted_load)}20`, color: loadColor(selected.predicted_load) }}>{loadLabel(selected.predicted_load)} · {selected.predicted_load}%</span></div>
                  <div className="text-[11px]" style={{ color: "#C4B5FD" }}>
                    {selected.confirmed} confirmed + ~{selected.projected.toFixed(1)} projected from clients' usual cycles
                    {selected.typical_for_weekday > 0 && <> · a typical {DOW_SHORT[selected.dow]} is ~{selected.typical_for_weekday.toFixed(1)}</>}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close" className="text-xs" style={{ color: MUT }}>✕</button>
              </div>
              <div className="mt-3 h-1.5 rounded-full overflow-hidden flex" style={{ background: "#2A1852" }}>
                <div style={{ width: `${Math.min(100, (selected.confirmed / Math.max(1, selected.avg_bookings)) * selected.predicted_load)}%`, background: "#34D399" }} />
                <div style={{ width: `${Math.max(0, selected.predicted_load - Math.min(100, (selected.confirmed / Math.max(1, selected.avg_bookings)) * selected.predicted_load))}%`, background: PUR_L, opacity: 0.7 }} />
              </div>
              <div className="flex gap-3 text-[9px] mt-1" style={{ color: MUT }}><span><span style={{ color: "#34D399" }}>■</span> confirmed</span><span><span style={{ color: PUR_L }}>■</span> projected</span></div>
              <button onClick={() => fillDay(selected.date)} className="mt-3 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white" style={{ background: PUR }}>
                Find clients to fill {selected.label} →
              </button>
            </div>
          )}

          {/* Weekday profile */}
          {profile.length > 0 && (
            <div className="mt-5">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: MUT }}>Your week at a glance · share of appointments</div>
              <div className="grid grid-cols-7 gap-2 items-end h-16">
                {DOW_ORDER.map((d) => { const p = profile.find((x) => x.dow === d); const h = p ? (p.share / maxShare) * 100 : 0; return (
                  <div key={d} className="flex flex-col items-center justify-end h-full">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(p?.open ? 6 : 2, h)}%`, background: p?.open ? PUR_L : "#2A1852", opacity: p?.open ? 0.8 : 1 }} title={p ? `${p.name}: ${p.share}%` : ""} />
                  </div>); })}
              </div>
              <div className="grid grid-cols-7 gap-2 mt-1">{DOW_ORDER.map((d) => <div key={d} className="text-center text-[9px]" style={{ color: MUT }}>{DOW_SHORT[d]}</div>)}</div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="col-span-2 flex flex-col" style={{ background: "#1A1030" }}>
          <div className="p-5 border-b" style={{ borderColor: "#2A1852" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px]" style={{ background: "linear-gradient(135deg, #5B21B6, #D4A017)" }}>✦</div>
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: GOLD2 }}>AI Insight</div>
              {insightSrc === "data" && <span className="text-[9px]" style={{ color: MUT }}>· from your data</span>}
            </div>
            {insight ? <p className="text-xs leading-relaxed" style={{ color: "#C4B5FD" }}>{insight}</p>
              : <p className="text-xs flex items-center gap-2" style={{ color: MUT }}>{insightLoading ? <><span className="w-3 h-3 border rounded-full animate-spin inline-block" style={{ borderColor: "rgba(91,33,182,0.3)", borderTopColor: PUR_L }} />Reading your forecast…</> : "No insight available yet."}</p>}
          </div>

          <div className="p-5 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: MUT }}>Slow days → fill them</div>
            {opps.length === 0 ? <p className="text-xs" style={{ color: MUT }}>No slow days stand out in the next three weeks.</p> : (
              <div className="space-y-2">
                {opps.map((o) => (
                  <div key={o.date} className="rounded-lg p-3 border" style={{ background: CARD_S, borderColor: `${loadColor(o.predicted_load)}30` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold text-white">{o.label}</div>
                      <div className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${loadColor(o.predicted_load)}20`, color: loadColor(o.predicted_load) }}>{o.predicted_load}%</div>
                    </div>
                    <div className="text-[10px] mb-2" style={{ color: MUT }}>{o.reachable.toLocaleString()} reachable{o.top.length > 0 && <> · best fit: {o.top.map((t) => t.name.split(" ")[0]).join(", ")}</>}</div>
                    <button onClick={() => fillDay(o.date)} disabled={o.reachable === 0} className="text-[10px] font-bold uppercase tracking-wider disabled:opacity-40" style={{ color: GOLD }}>Fill {o.label.split(" ")[0]} →</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slot-fill */}
      <div id="slot-fill-section" className="border-t scroll-mt-20" style={{ borderColor: "#2A1852", background: SURF }}>
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid #2A1852" }}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)", color: GOLD }}>⚡</div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD2 }}>Slot-Fill</div>
            <div className="text-sm font-semibold text-white">Got a gap? Pick who to ask, review the messages, send.</div>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-end gap-3 mb-3 flex-wrap">
            <div className="min-w-[170px]">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Date</div>
              <input type="date" value={slotDate} min={sydToday()} onChange={(e) => setSlotDate(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none" style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Time (optional)</div>
              <input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} className="w-36 rounded-lg px-3 py-2 text-sm text-white border focus:outline-none" style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
            <div className="min-w-[170px]">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Barber (optional)</div>
              <select value={slotBarber} onChange={(e) => setSlotBarber(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none" style={{ background: CARD_S, borderColor: "#2A1852" }}>
                <option value="">Any barber</option>{barbers.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <button onClick={() => rank(slotDate)} disabled={ranking || !slotDate} className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-2" style={{ background: PUR }}>
              {ranking ? <><span className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />Ranking…</> : "⚡ Find best clients"}
            </button>
          </div>
          <div className="flex gap-2 mb-5 text-[10px]">
            {[["Today", sydToday()], ["Tomorrow", addDay(sydToday(), 1)]].map(([l, d]) => (
              <button key={l} onClick={() => { setSlotDate(d); rank(d); }} className="px-2.5 py-1 rounded-md" style={{ border: "1px solid #2A1852", color: PUR_LL }}>{l}</button>
            ))}
            <span style={{ color: MUT }} className="self-center">Opted-out, on-hold, recently texted and already-booked clients are never listed.</span>
          </div>

          {slotError && <div className="text-xs mb-3" style={{ color: "#FB923C" }}>{slotError}</div>}

          {slotMeta && !ranking && (
            ranked.length === 0 ? <div className="text-center py-8 text-sm" style={{ color: MUT }}>No eligible clients for {slotMeta.label}: everyone reachable was texted recently or is already booked.</div> : (
              <div>
                <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                  <div className="text-[11px]" style={{ color: GOLD2 }}>Best fits for <strong style={{ color: GOLD }}>{slotMeta.label}{slotMeta.time ? ` at ${slotMeta.time}` : ""}{slotMeta.barber ? ` with ${slotMeta.barber}` : ""}</strong> · {totalCandidates.toLocaleString()} eligible</div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px]" style={{ color: MUT }}>Ask the top</span>
                    <input type="range" min={1} max={ranked.length} value={Math.min(count, ranked.length)} onChange={(e) => setCountAndPick(Number(e.target.value))} style={{ accentColor: PUR_L }} />
                    <span className="text-sm font-bold text-white w-5 text-right">{Math.min(count, ranked.length)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {ranked.map((c, i) => { const sm = STATE[c.markov_state] ?? STATE.R_at_risk; const on = picked.has(c.user_id); return (
                    <label key={c.user_id} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all" style={{ background: CARD_S, borderColor: on ? "rgba(124,58,237,0.5)" : "#2A1852", opacity: on ? 1 : 0.6 }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(c.user_id)} className="mt-1" style={{ accentColor: PUR_L }} />
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: i === 0 ? "rgba(212,160,23,0.2)" : "rgba(91,33,182,0.15)", color: i === 0 ? GOLD : PUR_LL }}>#{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-white">{c.name}</span>
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${sm.hex}20`, color: sm.hex }}>{sm.label}</span>
                          <span className="text-[10px] font-bold" style={{ color: GOLD }}>est. +${c.intervention_value.toFixed(0)}</span></div>
                        <div className="flex gap-1.5 flex-wrap mt-1.5">{c.reasons.map((r) => <span key={r} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: c.habit_match && r.startsWith("Last booked") ? "rgba(52,211,153,0.12)" : "#1A1030", color: c.habit_match && r.startsWith("Last booked") ? "#34D399" : "#A78BFA" }}>{r}</span>)}</div>
                      </div>
                    </label>); })}
                </div>
                <button onClick={() => setComposer(true)} disabled={composerList.length === 0} className="mt-4 w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: PUR }}>
                  Write {composerList.length} personalised message{composerList.length === 1 ? "" : "s"} for {slotMeta.label} →
                </button>
                <p className="text-[10px] mt-2 text-center" style={{ color: MUT }}>You review and edit every message before anything is sent.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
