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

// The demand forecast + slot-fill widget lives in its own file (app/components/demand-widget.tsx).
export { DemandHeatmapWidget } from "@/app/components/demand-widget";
