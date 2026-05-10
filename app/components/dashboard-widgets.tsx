"use client";
 
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
 
// ─── Royal Intelligence Tokens ────────────────────────────────────────────────
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const BDR   = "border-[#2A1852]";
const GOLD  = "#D4A017";
const GOLD2 = "#C9973A";
const PUR   = "#5B21B6";
const PUR_L = "#7C3AED";
const PUR_LL = "#A78BFA";
const MUT   = "#6B5C8A";
const SURF  = "#0F0A1E";
const CARD_S = "#130C24";
const TIP   = { backgroundColor: "#130C24", border: "1px solid #3A2268", borderRadius: "6px", color: "#F5F0FF", fontSize: "11px" };
 
const STATE_META: Record<string, { label: string; hex: string; short: string }> = {
  C:          { label: "First Timer", short: "New",     hex: "#38BDF8" },
  X:          { label: "Churned",     short: "Churned", hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",     short: "Risk",    hex: "#FB923C" },
  R_on_fence: { label: "On Fence",    short: "Fence",   hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",       short: "Loyal",   hex: "#34D399" },
};
 
// ════════════════════════════════════════════════════════════════════════════
// REVENUE RECOVERY WIDGET
// ════════════════════════════════════════════════════════════════════════════
 
interface MonthStat {
  month: string; label: string; contacted: number; rebooked: number;
  recovered: number; cost: number; conversion_rate: number; roi_pct: number;
}
interface Attribution {
  id: string; customer_name: string; customer_phone: string;
  markov_state: string; sms_sent_at: string; visit_date: string;
  visit_value: number; days_to_rebook: number; sms_source: string; rule_name: string | null;
}
 
export function RevenueRecoveryWidget({ venueId }: { venueId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
 
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/intelligence/revenue-recovery?venue_id=${venueId}`);
      const d = await res.json();
      setData(d);
    } catch {} finally { setLoading(false); }
  }, [venueId]);
 
  useEffect(() => { load(); }, [load]);
 
  async function runAttribution() {
    setRunning(true); setRunResult(null);
    try {
      const res = await fetch("/api/intelligence/revenue-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId }),
      });
      const d = await res.json();
      setRunResult(d);
      load();
    } catch {} finally { setRunning(false); }
  }
 
  const thisMonth: MonthStat = data?.this_month || { contacted: 0, rebooked: 0, recovered: 0, cost: 0, conversion_rate: 0, roi_pct: 0, label: "" };
  const allTime = data?.all_time || { contacted: 0, rebooked: 0, recovered: 0, cost: 0, conversion_rate: 0, roi_pct: 0, avg_clv: 0 };
  const trend: MonthStat[] = data?.monthly_trend || [];
  const recent: Attribution[] = data?.recent_attributions || [];
 
  const roiDisplay = thisMonth.roi_pct > 1000
    ? `${(thisMonth.roi_pct / 100).toFixed(0)}×`
    : `${thisMonth.roi_pct.toLocaleString()}%`;
 
  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  }
 
  if (loading) return (
    <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6`}>
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border rounded-full animate-spin" style={{ borderColor: "rgba(212,160,23,0.3)", borderTopColor: GOLD }} />
        <span className="text-sm" style={{ color: MUT }}>Loading revenue recovery data...</span>
      </div>
    </div>
  );
 
  return (
    <div className={`${CARD} border rounded-xl mb-6 overflow-hidden transition-all`}
      style={{ borderColor: thisMonth.recovered > 0 ? "rgba(212,160,23,0.3)" : "#2A1852" }}>
 
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #2A1852" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)" }}>
            <svg className="w-4 h-4" style={{ color: GOLD }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOLD2 }}>
              Revenue Recovery · ROI Proof
            </div>
            <div className="text-sm font-semibold text-white">
              {thisMonth.recovered > 0
                ? `This month, Rydra recovered $${thisMonth.recovered.toLocaleString(undefined, { maximumFractionDigits: 0 })} in revenue`
                : "Run attribution to see your ROI"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {runResult && (
            <div className="text-[10px] px-3 py-1 rounded-full border" style={{ background: "rgba(52,211,153,0.1)", borderColor: "rgba(52,211,153,0.3)", color: "#34D399" }}>
              ✓ {runResult.attributed} attributed · ${runResult.total_recovered?.toFixed(0)} recovered
            </div>
          )}
          <button onClick={runAttribution} disabled={running}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-40"
            style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)", color: GOLD }}>
            {running
              ? <><div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: "rgba(212,160,23,0.3)", borderTopColor: GOLD }} />Running...</>
              : "↻ Run Attribution"}
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="px-3.5 py-1.5 rounded-md text-[11px] font-medium border transition-all"
            style={{ borderColor: "#3A2268", color: PUR_LL, background: "#1A1030" }}>
            {expanded ? "Collapse" : "Full Report"}
          </button>
        </div>
      </div>
 
      {/* Key stats row */}
      <div className="grid grid-cols-6 divide-x divide-[#2A1852]">
        {[
          { l: "Recovered",   v: `$${(thisMonth.recovered||0).toLocaleString(undefined,{maximumFractionDigits:0})}`, sub: "this month",     col: GOLD,  big: true },
          { l: "Contacted",   v: thisMonth.contacted,                                                                  sub: "clients SMS'd",   col: "white" },
          { l: "Rebooked",    v: thisMonth.rebooked,                                                                   sub: "came back",       col: "#34D399" },
          { l: "Conversion",  v: `${thisMonth.conversion_rate}%`,                                                     sub: "rebook rate",     col: thisMonth.conversion_rate >= 40 ? "#34D399" : thisMonth.conversion_rate >= 20 ? "#FBBF24" : "#F43F5E" },
          { l: "SMS Spend",   v: `-$${(thisMonth.cost||0).toFixed(2)}`,                                               sub: "total cost",      col: "#F43F5E" },
          { l: "ROI",         v: roiDisplay,                                                                           sub: "return on spend", col: GOLD, big: true },
        ].map(({ l, v, sub, col, big }) => (
          <div key={l} className="px-5 py-4">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>{l}</div>
            <div className={`${big ? "text-2xl" : "text-xl"} font-bold tracking-tight`} style={{ color: col }}>{v}</div>
            <div className="text-[10px] mt-0.5" style={{ color: MUT }}>{sub}</div>
          </div>
        ))}
      </div>
 
      {/* Monthly trend + detail (expanded) */}
      {expanded && (
        <div className="border-t" style={{ borderColor: "#2A1852" }}>
 
          {/* Trend chart + all-time stats */}
          <div className="grid grid-cols-3 gap-0 divide-x divide-[#2A1852]">
 
            {/* Bar chart: monthly recovered revenue */}
            <div className="col-span-2 p-5">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: GOLD2 }}>
                Monthly Recovered Revenue · Last 6 Months
              </div>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={trend} margin={{ left: -15 }}>
                    <XAxis dataKey="label" stroke="#3A2268" fontSize={9} tick={{ fill: MUT }} />
                    <YAxis stroke="#3A2268" fontSize={9} tick={{ fill: MUT }}
                      tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`} />
                    <Tooltip contentStyle={TIP} formatter={(v: any) => [`$${Number(v).toFixed(0)}`, "Recovered"]} />
                    <Bar dataKey="recovered" radius={[3,3,0,0]}>
                      {trend.map((_, i) => (
                        <Cell key={i} fill={i === trend.length - 1 ? GOLD : GOLD2} fillOpacity={i === trend.length - 1 ? 1 : 0.6} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm" style={{ color: MUT }}>
                  Run attribution to see trend data
                </div>
              )}
            </div>
 
            {/* All-time summary */}
            <div className="p-5">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: GOLD2 }}>All-Time Summary</div>
              <div className="space-y-3">
                {[
                  { l: "Total Recovered",  v: `$${(allTime.recovered||0).toLocaleString(undefined,{maximumFractionDigits:0})}`, col: GOLD },
                  { l: "Total Contacted",  v: (allTime.contacted||0).toLocaleString() },
                  { l: "Total Rebooked",   v: (allTime.rebooked||0).toLocaleString(), col: "#34D399" },
                  { l: "Avg Conversion",   v: `${allTime.conversion_rate||0}%`, col: "#34D399" },
                  { l: "Avg Recovered CLV",v: `$${allTime.avg_clv||0}`, col: GOLD2 },
                  { l: "Total SMS Spend",  v: `-$${(allTime.cost||0).toFixed(2)}`, col: "#F43F5E" },
                  { l: "All-Time ROI",     v: allTime.roi_pct > 1000 ? `${(allTime.roi_pct/100).toFixed(0)}×` : `${(allTime.roi_pct||0).toLocaleString()}%`, col: GOLD },
                ].map(({ l, v, col }) => (
                  <div key={l} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "#2A1852" }}>
                    <span className="text-[10px]" style={{ color: MUT }}>{l}</span>
                    <span className="text-[11px] font-bold" style={{ color: col || "white" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
 
          {/* Recent attributions table */}
          <div className="border-t p-5" style={{ borderColor: "#2A1852" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: GOLD2 }}>
              Recent Attributed Rebookings — SMS sent → visited within 60 days
            </div>
            {recent.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: MUT }}>
                No attributed rebookings yet — run attribution to process your SMS history.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #2A1852" }}>
                    {["Client", "Segment", "SMS Date", "Rebooked", "Days", "Value", "Source"].map(h => (
                      <th key={h} className="pb-2 text-left text-[9px] font-bold uppercase tracking-widest" style={{ color: MUT }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => {
                    const sm = STATE_META[r.markov_state] || STATE_META.R_at_risk;
                    return (
                      <tr key={r.id || i} className="border-b" style={{ borderColor: "#1A1030" }}>
                        <td className="py-2.5 text-sm text-white font-medium">{r.customer_name || "—"}</td>
                        <td className="py-2.5">
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ background: `${sm.hex}12`, color: sm.hex }}>{sm.label}</span>
                        </td>
                        <td className="py-2.5 text-[11px]" style={{ color: MUT }}>{fmtDate(r.sms_sent_at)}</td>
                        <td className="py-2.5 text-[11px]" style={{ color: "#34D399" }}>{r.visit_date ? fmtDate(r.visit_date) : "—"}</td>
                        <td className="py-2.5 text-[11px]" style={{ color: MUT }}>{r.days_to_rebook ? `${r.days_to_rebook}d` : "—"}</td>
                        <td className="py-2.5 text-sm font-bold" style={{ color: GOLD }}>${(r.visit_value||0).toFixed(0)}</td>
                        <td className="py-2.5">
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ background: r.sms_source === "autopilot" ? "rgba(212,160,23,0.12)" : "#2A1852", color: r.sms_source === "autopilot" ? GOLD : MUT }}>
                            {r.sms_source === "autopilot" ? `⚡ ${r.rule_name || "Auto"}` : "Manual"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
 
          {/* Methodology note */}
          <div className="px-5 py-3 border-t" style={{ borderColor: "#2A1852", background: SURF }}>
            <div className="text-[9px]" style={{ color: MUT }}>
              <strong style={{ color: GOLD2 }}>Attribution methodology:</strong> A client is attributed if they received an SMS and made a visit within 60 days. Last-touch attribution. Revenue = the visit's booking value. ROI = (recovered revenue − SMS cost) ÷ SMS cost. This is the number you show at demos.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
 
// ════════════════════════════════════════════════════════════════════════════
// DEMAND HEATMAP + SLOT-FILL WIDGET
// ════════════════════════════════════════════════════════════════════════════
 
interface HeatmapDay {
    is_closed: any;
  date: string; label: string; dow: number; week_index: number;
  predicted_load: number; avg_bookings: number; is_slow: boolean; is_opportunity: boolean;
}
interface SlotClient {
  user_id: string; name: string; phone: string; markov_state: string;
  days_overdue: number; intervention_value: number; potential_value: string;
  slot_score: number; message: string; message_length: number;
}
 
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDERED = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun display order
 
function loadColor(load: number): string {
  if (load >= 75) return "#34D399";  // green — busy
  if (load >= 50) return "#A78BFA";  // purple — moderate
  if (load >= 30) return "#FBBF24";  // amber — slow
  return "#F43F5E";                  // red — very slow, opportunity
}
 
function loadLabel(load: number): string {
  if (load >= 75) return "Busy";
  if (load >= 50) return "Moderate";
  if (load >= 30) return "Slow";
  return "Open";
}
 
export function DemandHeatmapWidget({ venueId, customers }: { venueId: string; customers: any[] }) {
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [aiInsight, setAiInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);
 
  // Slot-fill state
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");
  const [slotBarber, setSlotBarber] = useState("");
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotClients, setSlotClients] = useState<SlotClient[]>([]);
  const [slotLabel, setSlotLabel] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
 
  async function loadHeatmap(refresh = false) {
    try {
      const res = await fetch(`/api/intelligence/demand-heatmap?venue_id=${venueId}${refresh ? "&refresh=1" : ""}`);
      const d = await res.json();
      setHeatmap(d.heatmap || []);
      setAiInsight(d.ai_insight || "");
    } catch {}
  }
 
  useEffect(() => {
    setLoading(true);
    loadHeatmap().finally(() => setLoading(false));
  }, [venueId]);
 
  async function refresh() {
    setRefreshing(true);
    await loadHeatmap(true);
    setRefreshing(false);
  }
 
  async function findSlotClients() {
    if (!slotDate || !slotTime) return;
    setSlotLoading(true); setSlotClients([]);
    try {
      const dt = new Date(`${slotDate}T${slotTime}`).toISOString();
      const res = await fetch("/api/intelligence/slot-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId, slot_datetime: dt, slot_barber: slotBarber || undefined }),
      });
      const d = await res.json();
      setSlotClients(d.clients || []);
      setSlotLabel(d.slot_label || "");
    } catch {} finally { setSlotLoading(false); }
  }
 
  async function sendSlotSms(client: SlotClient) {
    setSending(client.user_id);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: client.phone,
          message: client.message,
          customer_name: client.name,
          customer_id: client.user_id,
          venue_id: venueId,
          markov_state: client.markov_state,
          risk_segment: "slot_fill",
          gap_ratio: 1.5,
          days_overdue: client.days_overdue,
        }),
      });
      if (res.ok) setSent(s => new Set([...s, client.user_id]));
    } catch {} finally { setSending(null); }
  }
 
  // Group heatmap into weeks for display (Mon–Sun order)
  const weeks = Array.from({ length: 6 }, (_, wi) =>
    DOW_ORDERED.map(dow => heatmap.find(d => d.week_index === wi && d.dow === dow) || null)
  );
 
  // Best opportunity this week
  const opportunities = heatmap.filter(d => d.is_opportunity).slice(0, 3);
 
  if (loading) return (
    <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6`}>
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border rounded-full animate-spin" style={{ borderColor: "rgba(91,33,182,0.3)", borderTopColor: PUR_L }} />
        <span className="text-sm" style={{ color: MUT }}>Building demand heatmap...</span>
      </div>
    </div>
  );
 
  return (
    <div className={`${CARD} border ${BDR} rounded-xl mb-6 overflow-hidden`}>
 
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #2A1852" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(91,33,182,0.15)", border: "1px solid rgba(91,33,182,0.35)" }}>
            <svg className="w-4 h-4" style={{ color: PUR_LL }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: PUR_LL }}>Demand Heatmap</div>
            <div className="text-sm font-semibold text-white">6-Week Booking Forecast · Fill Slow Slots Proactively</div>
          </div>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[11px] font-medium border transition-all disabled:opacity-40"
          style={{ borderColor: "#3A2268", color: PUR_LL, background: "#1A1030" }}>
          <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? "Refreshing..." : "Refresh AI"}
        </button>
      </div>
 
      <div className="grid grid-cols-5 gap-0 divide-x divide-[#2A1852]">
 
        {/* ── Heatmap Grid ── */}
        <div className="col-span-3 p-5">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            {[["Open", "#F43F5E"], ["Slow", "#FBBF24"], ["Moderate", "#A78BFA"], ["Busy", "#34D399"]].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: c, opacity: 0.7 }} />
                <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: MUT }}>{l}</span>
              </div>
            ))}
            <span className="ml-auto text-[9px]" style={{ color: MUT }}>Based on {heatmap.length > 0 ? "historical patterns" : "projected averages"}</span>
          </div>
 
          {/* Day-of-week headers */}
          <div className="grid grid-cols-8 gap-1 mb-1">
            <div /> {/* week label column */}
            {DOW_ORDERED.map(dow => (
              <div key={dow} className="text-center text-[9px] font-bold uppercase tracking-wider" style={{ color: MUT }}>
                {DOW_SHORT[dow]}
              </div>
            ))}
          </div>
 
          {/* Calendar grid */}
          {weeks.map((week, wi) => {
            const firstDate = week.find(d => d)?.date;
            const weekLabel = firstDate
              ? new Date(firstDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
              : `W${wi+1}`;
            return (
              <div key={wi} className="grid grid-cols-8 gap-1 mb-1">
                <div className="flex items-center">
                  <span className="text-[8px] uppercase tracking-wider whitespace-nowrap" style={{ color: MUT }}>{weekLabel}</span>
                </div>
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="rounded-md h-10" style={{ background: "#1A1030", opacity: 0.3 }} />;
                  // Monday = closed day for Alkami
                  if (day.is_closed) return (
                    <div key={di} className="rounded-md h-10 flex flex-col items-center justify-center"
                      style={{ background: "#110820", border: "1px solid #1A1030" }}
                      title="Closed Monday">
                      <div className="text-[9px] font-bold" style={{ color: "#2A1852" }}>—</div>
                      <div className="text-[8px]" style={{ color: "#2A1852" }}>{new Date(day.date).getDate()}</div>
                    </div>
                  );
                  const col = loadColor(day.predicted_load);
                  const isSelected = selectedDay?.date === day.date;
                  return (
                    <div key={di}
                      className="rounded-md h-10 flex flex-col items-center justify-center cursor-pointer transition-all relative select-none"
                      style={{
                        background: `${col}${isSelected ? "35" : "18"}`,
                        border: `1px solid ${col}${isSelected ? "70" : "25"}`,
                        outline: isSelected ? `2px solid ${col}` : day.is_opportunity ? `1px dashed ${col}` : undefined,
                        outlineOffset: "2px",
                        transform: isSelected ? "scale(1.05)" : undefined,
                        zIndex: isSelected ? 1 : undefined,
                      }}
                      onClick={() => setSelectedDay(prev => prev?.date === day.date ? null : day)}>
                      <div className="text-[10px] font-bold" style={{ color: col }}>{day.predicted_load}%</div>
                      <div className="text-[8px]" style={{ color: col, opacity: 0.7 }}>
                        {new Date(day.date).getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
 
          {/* Selected day detail — stays visible, click to dismiss */}
          {selectedDay && !selectedDay.is_closed && (
            <div className="mt-3 rounded-lg p-3 border flex items-center gap-4"
              style={{ background: SURF, borderColor: `${loadColor(selectedDay.predicted_load)}40` }}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-xs font-semibold text-white">{selectedDay.label}</div>
                  <div className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                    style={{ background: `${loadColor(selectedDay.predicted_load)}15`, color: loadColor(selectedDay.predicted_load) }}>
                    {loadLabel(selectedDay.predicted_load)}
                  </div>
                </div>
                <div className="text-[10px]" style={{ color: MUT }}>
                  {selectedDay.predicted_load}% predicted load · ~{selectedDay.avg_bookings.toFixed(1)} bookings/day avg
                  {selectedDay.is_opportunity && <span className="ml-2 font-semibold" style={{ color: "#FBBF24" }}>⚡ Campaign opportunity</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedDay.is_opportunity && (
                  <>
                    <a
                      href={`/merchant/campaign?states=R_at_risk,R_on_fence&heatmap_date=${selectedDay.date}&source=heatmap`}
                      className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all"
                      style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)", color: GOLD }}>
                      Build Campaign →
                    </a>
                    <button
                      onClick={() => {
                        setSlotDate(selectedDay.date);
                        setSlotTime("10:00");
                        setTimeout(() => {
                          document.getElementById("slot-fill-section")?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                      }}
                      className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white transition-all"
                      style={{ background: PUR, boxShadow: "0 2px 8px rgba(212,160,23,0.1)" }}>
                      Fill This Day →
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedDay(null)}
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ color: MUT }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
 
        {/* ── Right Panel: AI Insight + Opportunities ── */}
        <div className="col-span-2 flex flex-col" style={{ background: "#1A1030" }}>
 
          {/* AI Insight */}
          <div className="p-5 border-b" style={{ borderColor: "#2A1852" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6, #D4A017)" }}>
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: GOLD2 }}>AI Insight</div>
            </div>
            {aiInsight ? (
              <p className="text-xs leading-relaxed" style={{ color: "#C4B5FD" }}>{aiInsight}</p>
            ) : (
              <p className="text-xs" style={{ color: MUT }}>Click Refresh AI to generate a demand insight based on your booking patterns.</p>
            )}
          </div>
 
          {/* Campaign opportunities */}
          <div className="p-5 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: MUT }}>Slow Slots → Campaign Opportunities</div>
            {opportunities.length === 0 ? (
              <p className="text-xs" style={{ color: MUT }}>No significant slow slots detected in the next 6 weeks.</p>
            ) : (
              <div className="space-y-2">
                {opportunities.map(d => (
                  <div key={d.date} className="rounded-lg p-3 border" style={{ background: CARD_S, borderColor: `${loadColor(d.predicted_load)}25` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold text-white">{d.label}</div>
                      <div className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${loadColor(d.predicted_load)}15`, color: loadColor(d.predicted_load) }}>
                        {d.predicted_load}%
                      </div>
                    </div>
                    <div className="text-[10px] mb-2" style={{ color: MUT }}>
                      ~{d.avg_bookings.toFixed(1)} bookings historically · campaign window 2 days prior
                    </div>
                    <a href={`/merchant/campaign?states=R_at_risk,R_on_fence&heatmap_date=${d.date}&source=heatmap`}
                      className="text-[10px] font-bold uppercase tracking-wider transition-all"
                      style={{ color: GOLD }}>
                      Build Campaign →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
 
      {/* ── Slot-Fill Section ── */}
      <div id="slot-fill-section" className="border-t" style={{ borderColor: "#2A1852", background: SURF }}>
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid #2A1852" }}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)" }}>
            <svg className="w-3.5 h-3.5" style={{ color: GOLD }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD2 }}>Cancellation Slot-Fill</div>
            <div className="text-sm font-semibold text-white">Got a gap? Rank your best clients and send in 10 seconds.</div>
          </div>
        </div>
 
        <div className="p-5">
          {/* Input row */}
          <div className="flex items-end gap-3 mb-5">
            <div className="flex-1">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Date</div>
              <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Time</div>
              <input type="time" value={slotTime} onChange={e => setSlotTime(e.target.value)}
                className="w-48 rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
            <div className="flex-1">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Barber (optional)</div>
              <input type="text" value={slotBarber} onChange={e => setSlotBarber(e.target.value)} placeholder="e.g. JB Edwards"
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none"
                style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
            <button onClick={findSlotClients} disabled={slotLoading || !slotDate || !slotTime}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all flex items-center gap-2 flex-shrink-0"
              style={{ background: PUR, boxShadow: "0 4px 20px rgba(212,160,23,0.12)" }}>
              {slotLoading
                ? <><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />Ranking...</>
                : <>⚡ Find Best Clients</>}
            </button>
          </div>
 
          {/* Ranked clients */}
          {slotLabel && (
            <div className="text-[10px] mb-3 font-medium" style={{ color: GOLD2 }}>
              Top clients for <strong style={{ color: GOLD }}>{slotLabel}</strong> · ranked by recovery value + urgency
            </div>
          )}
 
          {slotClients.length > 0 ? (
            <div className="space-y-3">
              {slotClients.map((client, idx) => {
                const sm = STATE_META[client.markov_state] || STATE_META.R_at_risk;
                const isSent = sent.has(client.user_id);
                const isSending = sending === client.user_id;
                return (
                  <div key={client.user_id} className="rounded-xl border p-4" style={{ background: CARD_S, borderColor: isSent ? "rgba(52,211,153,0.3)" : "#2A1852" }}>
                    <div className="flex items-start gap-4">
                      {/* Rank */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: idx === 0 ? "rgba(212,160,23,0.2)" : "rgba(91,33,182,0.15)", color: idx === 0 ? GOLD : PUR_LL, border: `1px solid ${idx === 0 ? "rgba(212,160,23,0.4)" : "rgba(91,33,182,0.3)"}` }}>
                        #{idx + 1}
                      </div>
 
                      {/* Client info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-white">{client.name}</span>
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ background: `${sm.hex}15`, color: sm.hex }}>{sm.label}</span>
                          <span className="text-[9px]" style={{ color: MUT }}>{client.days_overdue}d overdue</span>
                          <span className="text-[9px] font-bold" style={{ color: GOLD }}>ΔV +${(client.intervention_value||0).toFixed(0)}</span>
                        </div>
                        <div className="text-[10px] mb-2" style={{ color: MUT }}>{client.phone}</div>
 
                        {/* Pre-written message */}
                        <div className="rounded-lg px-3 py-2 border" style={{ background: "#1A1030", borderColor: "#2A1852" }}>
                          <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: MUT }}>AI-written slot-fill SMS · {client.message_length}/160</div>
                          <p className="text-xs text-white leading-relaxed">{client.message}</p>
                        </div>
                      </div>
 
                      {/* Send button */}
                      <div className="flex-shrink-0">
                        {isSent ? (
                          <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg border"
                            style={{ background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.3)" }}>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-[11px] font-semibold text-emerald-400">Sent</span>
                          </div>
                        ) : (
                          <button onClick={() => sendSlotSms(client)} disabled={isSending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
                            style={{ background: PUR, boxShadow: "0 2px 12px rgba(212,160,23,0.12)" }}>
                            {isSending
                              ? <><div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                              : "Send SMS →"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : slotLabel ? (
            <div className="text-center py-8 text-sm" style={{ color: MUT }}>
              No eligible clients found (all recently contacted or no at-risk clients with phone numbers).
            </div>
          ) : (
            <div className="flex items-center gap-5 py-4">
              {[
                { icon: "1", text: "Enter the cancelled slot date and time" },
                { icon: "2", text: "Optionally add the barber's name" },
                { icon: "3", text: "Click Find Best Clients — AI ranks and writes a unique SMS per client" },
              ].map(({ icon, text }) => (
                <div key={icon} className="flex items-center gap-2.5 flex-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.25)", color: GOLD2 }}>
                    {icon}
                  </div>
                  <span className="text-xs" style={{ color: MUT }}>{text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}