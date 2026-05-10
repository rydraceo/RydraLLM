"use client";
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
 
const BG   = "bg-[#0A0612]";
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const BDR   = "border-[#2A1852]";
const TIP   = { backgroundColor: "#130C24", border: "1px solid #3A2268", borderRadius: "4px", color: "#fff", fontSize: "11px" };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/outreach",  label: "Outreach"  },
  { href: "/merchant/campaign",  label: "Campaign", active: true },
  { href: "/merchant/clients",   label: "Clients"   },
  { href: "/merchant/barber",    label: "Barbers"   },
];
 
const P: number[][] = [[0,0.40,0.25,0.15,0.20],[0,0.75,0.18,0.05,0.02],[0,0.30,0.35,0.25,0.10],[0,0.08,0.15,0.35,0.42],[0,0,0,0,1.00]];
function mm(A: number[][], B: number[][]): number[][] {
  const C: number[][] = [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]];
  for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) { for (let k = 0; k < 5; k++) { C[i][j] += A[i][k] * B[k][j]; } } }
  return C;
}
function mp(M: number[][], n: number): number[][] {
  let r: number[][] = [[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]];
  for (let i = 0; i < n; i++) { r = mm(r, M); }
  return r;
}
const Pn3 = mp(P, 3);
const STATE_IDX: Record<string, number> = { C:0, R_loyal:1, R_on_fence:2, R_at_risk:3, X:4 };
const RATES: Record<string, { nat: number; sms: number }> = {
  C: { nat:0.25, sms:0.45 }, X: { nat:0.03, sms:0.15 },
  R_at_risk: { nat:0.15, sms:0.35 }, R_on_fence: { nat:0.40, sms:0.55 }, R_loyal: { nat:0.65, sms:0.70 },
};
 
const STATE_META: Record<string, { label: string; hex: string }> = {
  C: { label:"First Timers", hex:"#38BDF8" }, X: { label:"Churned", hex:"#F43F5E" },
  R_at_risk: { label:"At Risk", hex:"#FB923C" }, R_on_fence: { label:"On Fence", hex:"#FBBF24" }, R_loyal: { label:"Loyal", hex:"#34D399" },
};
 
// ─── Tooltip formatter — cast as any to avoid Recharts generic conflict ───────
const tipFormatter = ((v: any, n: string) => [
  `$${Number(v).toLocaleString()}`,
  n === "baseline" ? "Without campaign" : "With campaign",
]) as any;
 
interface Customer {
  score_id: string; user_id: string; name: string; phone: string;
  gap_ratio: number; days_overdue: number; visits: number;
  potential_value: string; churn_score: number | null;
  intervention_value: number; markov_state: string; risk_segment: string;
}
 
export default function CampaignPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [markovFilter, setMarkovFilter] = useState("all");
  const [minCLV, setMinCLV] = useState(0);
  const [minDays, setMinDays] = useState(0);
  const [maxDays, setMaxDays] = useState(999);
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/intelligence/at-risk-customers?venue_id=${VENUE_ID}`)
      .then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(console.error).finally(() => setLoading(false));
  }, []);
 
  const audience = useMemo(() => customers.filter(c => {
    if (markovFilter !== "all" && c.markov_state !== markovFilter) return false;
    if (parseFloat(c.potential_value) < minCLV) return false;
    if (c.days_overdue < minDays || c.days_overdue > maxDays) return false;
    return true;
  }), [customers, markovFilter, minCLV, minDays, maxDays]);
 
  const audienceWithPhone = useMemo(() => audience.filter(c => c.phone && c.phone !== "No phone"), [audience]);
  const totalCLV = useMemo(() => audience.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0), [audience]);
  const totalDV  = useMemo(() => audience.reduce((s, c) => s + (c.intervention_value || 0), 0), [audience]);
  const cost = audienceWithPhone.length * 0.08;
  const netUplift = totalDV - cost;
 
  const forecast = useMemo(() => {
    if (!audience.length) return null;
    return [1, 2, 3].map(month => {
      let baseline = 0; let campaign = 0;
      audience.forEach(c => {
        const clv = parseFloat(c.potential_value || "0");
        const idx = STATE_IDX[c.markov_state] ?? 2;
        const churnIn3 = Pn3[idx][4];
        const surv = Math.max(0, 1 - churnIn3 * (month / 3));
        const r = RATES[c.markov_state] || RATES.R_on_fence;
        baseline += clv * surv * (1 / 1.5) * (month / 3);
        campaign += clv * Math.min(surv + (r.sms - r.nat) * 0.3, 1) * (1 / 1.5) * (month / 3);
      });
      return {
        month: `M${month}`,
        baseline: Math.round(baseline),
        campaign: Math.round(campaign),
        uplift: Math.round(campaign - baseline),
      };
    });
  }, [audience]);
 
  async function generateMessage() {
    if (!audienceWithPhone.length) return;
    setAiLoading(true);
    try {
      const avgCLV = totalCLV / (audience.length || 1);
      const avgDays = audience.reduce((s, c) => s + c.days_overdue, 0) / (audience.length || 1);
      const r = await fetch("/api/ai/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: STATE_META[markovFilter]?.label || "Mixed",
          markov_state: markovFilter === "all" ? "R_at_risk" : markovFilter,
          audience_size: audienceWithPhone.length,
          avg_clv: avgCLV.toFixed(0),
          avg_days_overdue: Math.round(avgDays),
          campaign_goal: campaignName || "Re-engage and rebook",
        }),
      });
      const d = await r.json(); setMessage(d.message || "");
    } catch {} finally { setAiLoading(false); }
  }
 
  async function launchCampaign() {
    if (!message.trim() || !audienceWithPhone.length) return;
    setSending(true); setSendProgress(0); let done = 0;
    const targets = audienceWithPhone.slice(0, 50);
    for (const c of targets) {
      try {
        const msg = message.replace("[NAME]", c.name.split(" ")[0]).replace("[BARBER]", "your barber");
        await fetch("/api/sms/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.phone, message: msg, customer_name: c.name, customer_id: c.user_id, venue_id: VENUE_ID, markov_state: c.markov_state, risk_segment: c.risk_segment, gap_ratio: c.gap_ratio, days_overdue: c.days_overdue }),
        });
        done++; setSendProgress(Math.round((done / targets.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {}
    }
    setSending(false); setSent(true);
  }
 
  const charCount = message.length;
 
  if (loading) return (
    <div className={`min-h-screen ${BG} flex items-center justify-center`}>
      <div className="text-center">
        <div className="w-10 h-10 border border-[#7C3AED]/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading data</div>
      </div>
    </div>
  );
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      {/* Nav */}
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(10,6,18,0.97)" }}>
        <div className="max-w-[1600px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div>
              <div className="text-sm font-semibold text-white leading-none">Campaign Builder</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => (
              <a key={tab.href} href={tab.href}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>
                {tab.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
 
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="mb-8">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Revenue Forecasting + Bulk Outreach</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Campaign Builder</h1>
        </div>
 
        <div className="grid grid-cols-3 gap-5">
 
          {/* ── Left: Audience Builder ── */}
          <div className="space-y-4">
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Build Audience</div>
 
              {/* Markov State */}
              <div className="mb-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Markov State</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[["all","All States"],["X","Churned"],["R_at_risk","At Risk"],["R_on_fence","On Fence"],["C","First Timer"],["R_loyal","Loyal"]].map(([val, label]) => (
                    <button key={val} onClick={() => setMarkovFilter(val)}
                      className={`py-2 px-2.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${markovFilter === val ? "bg-[#5B21B6] text-white" : "border border-[#2A1852] text-slate-500 hover:text-slate-200"}`}
                      style={markovFilter !== val ? { background: "#0F0A1E" } : {}}>
                      {label}
                      {val !== "all" && STATE_META[val] && (
                        <span className="ml-1 opacity-60">({customers.filter(c => c.markov_state === val).length})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
 
              {/* Min CLV */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Min CLV</span>
                  <span className="text-[10px] font-bold text-white">${minCLV}</span>
                </div>
                <input type="range" min={0} max={500} step={10} value={minCLV}
                  onChange={e => setMinCLV(Number(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none accent-indigo-500"
                  style={{ background: "#2A1852" }} />
                <div className="flex justify-between text-[9px] text-slate-700 mt-1"><span>$0</span><span>$500</span></div>
              </div>
 
              {/* Days Overdue */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Days Overdue</span>
                  <span className="text-[10px] text-slate-500">{minDays}–{maxDays === 999 ? "∞" : maxDays}</span>
                </div>
                <div className="flex gap-2">
                  <input type="number" min={0} value={minDays} onChange={e => setMinDays(Number(e.target.value))} placeholder="Min"
                    className="w-1/2 rounded-md px-3 py-1.5 text-xs text-white border border-[#2A1852] focus:outline-none focus:border-[#7C3AED]/40" style={{ background: "#0F0A1E" }} />
                  <input type="number" min={0} value={maxDays === 999 ? "" : maxDays} onChange={e => setMaxDays(e.target.value === "" ? 999 : Number(e.target.value))} placeholder="Max"
                    className="w-1/2 rounded-md px-3 py-1.5 text-xs text-white border border-[#2A1852] focus:outline-none focus:border-[#7C3AED]/40" style={{ background: "#0F0A1E" }} />
                </div>
              </div>
 
              {/* Audience metrics */}
              <div className="border-t border-[#0F1529] pt-4 space-y-2">
                {[
                  { l: "Audience size",       v: `${audience.length.toLocaleString()} clients` },
                  { l: "With phone",          v: `${audienceWithPhone.length.toLocaleString()} reachable` },
                  { l: "Total CLV at stake",  v: `$${totalCLV.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                  { l: "Total ΔV",            v: `$${totalDV.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,  hex: "#34D399" },
                  { l: "Campaign cost",        v: `-$${cost.toFixed(2)}`,                                                  hex: "#F43F5E" },
                  { l: "Net uplift",           v: `$${netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, hex: netUplift > 0 ? "#34D399" : "#F43F5E", bold: true },
                ].map(({ l, v, hex, bold }) => (
                  <div key={l} className="flex items-center justify-between py-1 border-b border-[#0F1529]">
                    <span className="text-[9px] text-slate-600">{l}</span>
                    <span className={`text-[10px] ${bold ? "font-bold" : "font-medium"}`} style={{ color: hex || "#fff" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
 
            {/* Segment breakdown */}
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">Audience Breakdown</div>
              <div className="space-y-2.5">
                {Object.entries(STATE_META).map(([key, { label, hex }]) => {
                  const count = audience.filter(c => c.markov_state === key).length;
                  const pct = audience.length > 0 ? (count / audience.length) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-semibold" style={{ color: hex }}>{label}</span>
                        <span className="text-[9px] text-slate-600">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: "#2A1852" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hex }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
 
          {/* ── Right: Forecast + Compose ── */}
          <div className="col-span-2 space-y-5">
 
            {/* Revenue forecast */}
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }}>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Markov P³ Projection</div>
                  <div className="text-sm font-semibold text-white">3-Month Revenue Forecast</div>
                </div>
              </div>
 
              {forecast ? (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {forecast.map(f => (
                      <div key={f.month} className={`${CARD2} border ${BDR} rounded-lg p-4`}>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">{f.month}</div>
                        <div className="text-xl font-bold text-white tracking-tight">${f.campaign.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-600 line-through">${f.baseline.toLocaleString()}</div>
                        <div className="text-[10px] font-semibold text-emerald-400 mt-0.5">+${f.uplift.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={forecast} margin={{ left: -20 }}>
                      <XAxis dataKey="month" stroke="#3A2268" fontSize={10} tick={{ fill: "#475569" }} />
                      <YAxis stroke="#3A2268" fontSize={10} tick={{ fill: "#475569" }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={TIP} formatter={tipFormatter} />
                      <Bar dataKey="baseline" fill="#1A1030" radius={[3, 3, 0, 0]} name="baseline" />
                      <Bar dataKey="campaign" fill="#7C3AED" radius={[3, 3, 0, 0]} name="campaign" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-[9px] text-slate-700 text-center mt-2 uppercase tracking-wider">
                    Based on Markov P³ churn projections · $0.08/SMS deducted
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-[9px] text-slate-700 uppercase tracking-wider">
                  Select an audience to see forecast
                </div>
              )}
            </div>
 
            {/* Compose */}
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Bulk Outreach</div>
              <div className="text-sm font-semibold text-white mb-5">Compose Campaign · {audienceWithPhone.length.toLocaleString()} recipients</div>
 
              {/* Campaign name */}
              <div className="mb-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Campaign Name</div>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. May Win-Back Campaign"
                  className="w-full rounded-md px-4 py-2.5 text-sm text-white placeholder-slate-600 border border-[#2A1852] focus:border-[#7C3AED]/40 focus:outline-none transition-all"
                  style={{ background: "#0F0A1E" }} />
              </div>
 
              {/* Message */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Message</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-700">Use [NAME] and [BARBER]</span>
                    <span className={`text-[9px] font-mono font-bold ${charCount > 160 ? "text-rose-400" : charCount > 140 ? "text-amber-400" : "text-slate-600"}`}>{charCount}/160</span>
                  </div>
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={320}
                  placeholder="Hey [NAME], it's been a while — we'd love to see you back at Alkami. Book this week with [BARBER]. Reply YES to lock in your spot."
                  className="w-full rounded-md px-4 py-3 text-sm text-white placeholder-slate-600 border border-[#2A1852] focus:border-[#7C3AED]/40 focus:outline-none transition-all resize-none leading-relaxed"
                  style={{ background: "#0F0A1E" }} />
                <div className="h-0.5 rounded-full mt-1.5" style={{ background: "#2A1852" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((charCount / 160) * 100, 100)}%`, background: charCount > 160 ? "#F43F5E" : charCount > 140 ? "#FBBF24" : "#7C3AED" }} />
                </div>
                <button onClick={generateMessage} disabled={aiLoading || audienceWithPhone.length === 0}
                  className="mt-3 w-full py-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 border border-[#2A1852] text-slate-500 hover:text-slate-200 hover:border-[#3A2268]"
                  style={{ background: "#0F0A1E" }}>
                  {aiLoading
                    ? <><div className="w-3 h-3 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />Generating...</>
                    : `✦ Write with AI — optimised for ${STATE_META[markovFilter]?.label || "this segment"}`}
                </button>
              </div>
 
              {/* Preview */}
              {message && audienceWithPhone.length > 0 && (
                <div className="mb-4 rounded-md p-3 border border-[#2A1852]" style={{ background: "#0F0A1E" }}>
                  <div className="text-[9px] text-slate-700 uppercase tracking-wider mb-2">Preview — first recipient</div>
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-[#1D4ED8] rounded-2xl rounded-tr-sm px-3 py-2">
                      <p className="text-white text-xs leading-relaxed">
                        {message.replace("[NAME]", audienceWithPhone[0]?.name?.split(" ")[0] || "Chris").replace("[BARBER]", "JB")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
 
              {/* Launch */}
              {sent ? (
                <div className="flex items-center justify-center gap-2 py-3.5 rounded-md border" style={{ background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.2)" }}>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <div>
                    <div className="text-emerald-400 font-semibold text-sm">Campaign sent</div>
                    <div className="text-emerald-600 text-xs">{Math.min(audienceWithPhone.length, 50)} messages delivered</div>
                  </div>
                </div>
              ) : sending ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Sending campaign...</span>
                    <span className="text-xs font-mono text-[#A78BFA]">{sendProgress}%</span>
                  </div>
                  <div className="h-1 rounded-full" style={{ background: "#2A1852" }}>
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${sendProgress}%` }} />
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  {[
                    { l: audienceWithPhone.length.toLocaleString(), sub: "recipients", hex: "#7C3AED" },
                    { l: `-$${cost.toFixed(2)}`,                    sub: "cost",       hex: "#F43F5E" },
                    { l: `+$${netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: "net uplift", hex: "#34D399" },
                  ].map(({ l, sub, hex }) => (
                    <div key={sub} className="flex-1 rounded-md p-3 text-center border border-[#2A1852]" style={{ background: "#0F0A1E" }}>
                      <div className="text-base font-bold" style={{ color: hex }}>{l}</div>
                      <div className="text-[9px] text-slate-700 uppercase tracking-wider mt-0.5">{sub}</div>
                    </div>
                  ))}
                  <button onClick={launchCampaign} disabled={!message.trim() || audienceWithPhone.length === 0 || charCount > 160}
                    className="flex-[2] py-3 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                    style={{ background: "#5B21B6", boxShadow: "0 4px 20px rgba(91,33,182,0.25)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    Launch Campaign
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
 