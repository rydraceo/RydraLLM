"use client";
 
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
 
// ─── Markov chain (client-side) ───────────────────────────────────────────────
const P: number[][] = [
  [0.00, 0.40, 0.25, 0.15, 0.20],
  [0.00, 0.75, 0.18, 0.05, 0.02],
  [0.00, 0.30, 0.35, 0.25, 0.10],
  [0.00, 0.08, 0.15, 0.35, 0.42],
  [0.00, 0.00, 0.00, 0.00, 1.00],
];
 
function mm(A: number[][], B: number[][]): number[][] {
  const C: number[][] = [
    [0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],
  ];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      for (let k = 0; k < 5; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}
 
function mp(M: number[][], n: number): number[][] {
  let r: number[][] = [
    [1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1],
  ];
  for (let i = 0; i < n; i++) { r = mm(r, M); }
  return r;
}
 
const Pn3 = mp(P, 3);
const STATE_IDX: Record<string, number> = { C: 0, R_loyal: 1, R_on_fence: 2, R_at_risk: 3, X: 4 };
const RATES: Record<string, { nat: number; sms: number }> = {
  C: { nat: 0.25, sms: 0.45 }, X: { nat: 0.03, sms: 0.15 },
  R_at_risk: { nat: 0.15, sms: 0.35 }, R_on_fence: { nat: 0.40, sms: 0.55 }, R_loyal: { nat: 0.65, sms: 0.70 },
};
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface Customer {
  score_id: string; user_id: string; name: string; phone: string;
  gap_ratio: number; days_overdue: number; visits: number;
  potential_value: string; churn_score: number | null;
  intervention_value: number; markov_state: string; risk_segment: string;
}
 
// ─── Nav ──────────────────────────────────────────────────────────────────────
 
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/merchant/outreach", label: "Outreach", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { href: "/merchant/campaign", label: "Campaign", icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z", active: true },
  { href: "/merchant/clients", label: "Clients", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/merchant/barber", label: "Barbers", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];
 
const MARKOV_LABELS: Record<string, { label: string; color: string }> = {
  C:          { label: "First Timers",  color: "text-blue-400" },
  X:          { label: "Churned",       color: "text-red-400" },
  R_at_risk:  { label: "At Risk",       color: "text-orange-400" },
  R_on_fence: { label: "On the Fence",  color: "text-yellow-400" },
  R_loyal:    { label: "Loyal",         color: "text-green-400" },
};
 
// ─── Main Page ────────────────────────────────────────────────────────────────
 
export default function CampaignPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
 
  // Filters
  const [markovFilter, setMarkovFilter] = useState("all");
  const [minCLV, setMinCLV] = useState(0);
  const [minDays, setMinDays] = useState(0);
  const [maxDays, setMaxDays] = useState(999);
 
  // Campaign
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
 
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/intelligence/at-risk-customers?venue_id=${VENUE_ID}`)
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
 
  const audience = useMemo(() => customers.filter(c => {
    if (markovFilter !== "all" && c.markov_state !== markovFilter) return false;
    if (parseFloat(c.potential_value) < minCLV) return false;
    if (c.days_overdue < minDays) return false;
    if (c.days_overdue > maxDays) return false;
    return true;
  }), [customers, markovFilter, minCLV, minDays, maxDays]);
 
  const audienceWithPhone = useMemo(() => audience.filter(c => c.phone && c.phone !== "No phone"), [audience]);
  const totalCLV  = useMemo(() => audience.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0), [audience]);
  const totalDV   = useMemo(() => audience.reduce((s, c) => s + (c.intervention_value || 0), 0), [audience]);
  const campaignCost = audienceWithPhone.length * 0.08;
  const netUplift = totalDV - campaignCost;
 
  // 3-month Markov revenue forecast
  const forecast = useMemo(() => {
    if (audience.length === 0) return null;
    return [1, 2, 3].map(month => {
      let baseline = 0;
      let campaign = 0;
      audience.forEach(c => {
        const clv = parseFloat(c.potential_value || "0");
        const idx = STATE_IDX[c.markov_state] ?? 2;
        const churnIn3 = Pn3[idx][4];
        const survivalProb = Math.max(0, 1 - churnIn3 * (month / 3));
        const r = RATES[c.markov_state] || RATES.R_on_fence;
        const lift = r.sms - r.nat;
        baseline += clv * survivalProb * (1 / 1.5) * (month / 3);
        campaign += clv * Math.min(survivalProb + lift * 0.3, 1) * (1 / 1.5) * (month / 3);
      });
      return {
        month: `Month ${month}`,
        baseline: Math.round(baseline),
        campaign: Math.round(campaign),
        uplift:   Math.round(campaign - baseline),
      };
    });
  }, [audience]);
 
  async function generateMessage() {
    if (audienceWithPhone.length === 0) return;
    setAiLoading(true);
    try {
      const avgCLV  = totalCLV / (audience.length || 1);
      const avgDays = audience.reduce((s, c) => s + c.days_overdue, 0) / (audience.length || 1);
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment:          MARKOV_LABELS[markovFilter]?.label || "Mixed",
          markov_state:     markovFilter === "all" ? "R_at_risk" : markovFilter,
          audience_size:    audienceWithPhone.length,
          avg_clv:          avgCLV.toFixed(0),
          avg_days_overdue: Math.round(avgDays),
          campaign_goal:    campaignName || "Re-engage and rebook",
        }),
      });
      const data = await res.json();
      setMessage(data.message || "");
    } catch (e) { console.error(e); }
    finally { setAiLoading(false); }
  }
 
  async function launchCampaign() {
    if (!message.trim() || audienceWithPhone.length === 0) return;
    setSending(true);
    setSendProgress(0);
    let done = 0;
    const targets = audienceWithPhone.slice(0, 50);
    for (const customer of targets) {
      try {
        const personalised = message
          .replace("[NAME]", customer.name.split(" ")[0])
          .replace("[BARBER]", "your barber");
        await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: customer.phone, message: personalised,
            customer_name: customer.name, customer_id: customer.user_id,
            venue_id: VENUE_ID, markov_state: customer.markov_state,
            risk_segment: customer.risk_segment, gap_ratio: customer.gap_ratio,
            days_overdue: customer.days_overdue,
          }),
        });
        done++;
        setSendProgress(Math.round((done / targets.length) * 100));
        await new Promise(r => setTimeout(r, 100));
      } catch { /* continue */ }
    }
    setSending(false);
    setSent(true);
  }
 
  const charCount = message.length;
  const tooltipStyle = { backgroundColor: "#1e1b4b", border: "1px solid #6366f1", borderRadius: "8px", color: "#fff" };
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
 
      {/* Header */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-8 py-5 flex items-center gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Campaign Builder</h1>
              <p className="text-purple-300 text-xs">Revenue forecasting + bulk outreach · Alkami Barbershop</p>
            </div>
          </div>
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            {NAV.map(tab => (
              <a key={tab.href} href={tab.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${(tab as any).active ? "bg-purple-600 text-white" : "text-purple-300 hover:text-white hover:bg-purple-800/50"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </a>
            ))}
          </div>
        </div>
      </div>
 
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 
          {/* ── LEFT: Audience Builder ── */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-2xl border border-purple-800/30 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Build Audience</h2>
              <p className="text-purple-400 text-xs mb-5">Filter your customer base to target the right segment</p>
 
              {/* Markov State */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 block">Markov State</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["all",        "All States",   "text-purple-300"],
                    ["X",          "Churned",      "text-red-400"],
                    ["R_at_risk",  "At Risk",      "text-orange-400"],
                    ["R_on_fence", "On Fence",     "text-yellow-400"],
                    ["C",          "First Timer",  "text-blue-400"],
                    ["R_loyal",    "Loyal",        "text-green-400"],
                  ].map(([val, label, color]) => (
                    <button key={val} onClick={() => setMarkovFilter(val)}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                        markovFilter === val
                          ? "bg-purple-600 border-purple-500 text-white"
                          : `border-purple-800/40 bg-purple-900/20 ${color} hover:bg-purple-800/40`
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
 
              {/* Min CLV */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 block">
                  Min CLV: ${minCLV}
                </label>
                <input type="range" min={0} max={500} step={10} value={minCLV}
                  onChange={e => setMinCLV(Number(e.target.value))} className="w-full accent-purple-500" />
                <div className="flex justify-between text-xs text-purple-600 mt-1"><span>$0</span><span>$500</span></div>
              </div>
 
              {/* Days overdue range */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 block">
                  Days Overdue: {minDays}–{maxDays === 999 ? "∞" : maxDays}
                </label>
                <div className="flex gap-2">
                  <input type="number" min={0} value={minDays} onChange={e => setMinDays(Number(e.target.value))}
                    className="w-1/2 bg-purple-900/40 border border-purple-700/40 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="Min" />
                  <input type="number" min={0} value={maxDays === 999 ? "" : maxDays}
                    onChange={e => setMaxDays(e.target.value === "" ? 999 : Number(e.target.value))}
                    className="w-1/2 bg-purple-900/40 border border-purple-700/40 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="Max" />
                </div>
              </div>
 
              {/* Audience preview */}
              <div className="border-t border-purple-800/30 pt-4 space-y-2">
                {[
                  { label: "Audience size",       value: `${audience.length.toLocaleString()} clients` },
                  { label: "With phone number",   value: `${audienceWithPhone.length.toLocaleString()} reachable` },
                  { label: "Total CLV at stake",  value: `$${totalCLV.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                  { label: "Total ΔV (potential)", value: `$${totalDV.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-green-400" },
                  { label: "Campaign cost",        value: `-$${campaignCost.toFixed(2)}`, color: "text-red-400" },
                  { label: "Net uplift",           value: `$${netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: netUplift > 0 ? "text-green-400 font-bold" : "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-1 border-b border-purple-800/20">
                    <span className="text-purple-400 text-xs">{label}</span>
                    <span className={`text-xs font-medium ${color || "text-white"}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
 
            {/* Segment breakdown */}
            <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Audience Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(MARKOV_LABELS).map(([key, { label, color }]) => {
                  const count = audience.filter(c => c.markov_state === key).length;
                  const pct   = audience.length > 0 ? (count / audience.length) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${color}`}>{label}</span>
                        <span className="text-xs text-purple-400">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1 bg-purple-900/60 rounded-full">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
 
          {/* ── RIGHT: Forecast + Compose ── */}
          <div className="lg:col-span-2 space-y-5">
 
            {/* Revenue Forecast */}
            <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-2xl border border-purple-800/30 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">3-Month Revenue Forecast</h2>
                  <p className="text-purple-400 text-xs">Markov chain projection — without vs with this campaign</p>
                </div>
              </div>
 
              {forecast ? (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    {forecast.map(f => (
                      <div key={f.month} className="bg-purple-900/30 rounded-xl p-4">
                        <div className="text-purple-400 text-xs mb-2">{f.month}</div>
                        <div className="text-white font-bold text-lg">${f.campaign.toLocaleString()}</div>
                        <div className="text-purple-500 text-xs line-through">${f.baseline.toLocaleString()}</div>
                        <div className="text-green-400 text-xs font-medium mt-1">+${f.uplift.toLocaleString()} uplift</div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={forecast} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="month" stroke="#a78bfa" fontSize={12} />
                      <YAxis stroke="#a78bfa" fontSize={11}
                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={((v: number, name: string): [string, string] => [
                          `$${Number(v).toLocaleString()}`,
                          name === "baseline" ? "Without campaign" : "With campaign",
                        ]) as any}
                      />
                      <Bar dataKey="baseline" fill="#4c1d95" radius={[4, 4, 0, 0]} name="baseline" />
                      <Bar dataKey="campaign" fill="#7c3aed" radius={[4, 4, 0, 0]} name="campaign" />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-purple-500 text-xs mt-2 text-center">
                    Based on Markov P³ churn projections · $0.08/SMS cost deducted
                  </p>
                </>
              ) : (
                <div className="text-center py-8 text-purple-500 text-sm">
                  Select an audience to see forecast
                </div>
              )}
            </div>
 
            {/* Campaign Compose */}
            <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-2xl border border-purple-800/30 p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Compose Campaign</h2>
              <p className="text-purple-400 text-xs mb-5">
                Write once · Send to {audienceWithPhone.length.toLocaleString()} clients · $0.08 each
              </p>
 
              {/* Campaign name */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 block">Campaign Name</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. May Win-Back Campaign"
                  className="w-full bg-purple-900/40 border border-purple-700/40 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm" />
              </div>
 
              {/* Message */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Message</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-500">Use [NAME] and [BARBER] as placeholders</span>
                    <span className={`text-xs font-mono font-medium ${charCount > 160 ? "text-red-400" : charCount > 140 ? "text-yellow-400" : "text-green-400"}`}>
                      {charCount}/160
                    </span>
                  </div>
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={320}
                  placeholder="Hey [NAME], it's been a while — we'd love to see you back at Alkami. Book this week with [BARBER]. Reply YES to lock in your spot."
                  className="w-full bg-purple-900/30 border border-purple-700/40 rounded-xl px-4 py-3 text-white placeholder-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm leading-relaxed resize-none" />
                <div className="mt-2 h-1 bg-purple-900/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${charCount > 160 ? "bg-red-500" : charCount > 140 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min((charCount / 160) * 100, 100)}%` }}
                  />
                </div>
                <button onClick={generateMessage} disabled={aiLoading || audienceWithPhone.length === 0}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-purple-600/50 bg-purple-900/30 hover:bg-purple-800/40 text-purple-200 hover:text-white text-sm font-medium transition-all disabled:opacity-40">
                  {aiLoading ? (
                    <><div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />Generating...</>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                      </svg>
                      Write with AI — optimised for {MARKOV_LABELS[markovFilter]?.label || "this segment"}
                    </>
                  )}
                </button>
              </div>
 
              {/* Preview */}
              {message && audienceWithPhone.length > 0 && (
                <div className="mb-4 bg-gray-950 rounded-xl p-4 border border-gray-800/60">
                  <p className="text-xs text-gray-500 mb-2">Preview — first client</p>
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-green-600 rounded-2xl rounded-tr-sm px-3 py-2">
                      <p className="text-white text-xs leading-relaxed">
                        {message
                          .replace("[NAME]", audienceWithPhone[0]?.name?.split(" ")[0] || "Chris")
                          .replace("[BARBER]", "JB")}
                      </p>
                    </div>
                  </div>
                </div>
              )}
 
              {/* Launch */}
              {sent ? (
                <div className="flex items-center justify-center gap-3 py-4 bg-green-900/30 border border-green-600/40 rounded-xl">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="text-green-400 font-semibold">Campaign sent!</div>
                    <div className="text-green-600 text-xs">Messages sent to {Math.min(audienceWithPhone.length, 50)} clients</div>
                  </div>
                </div>
              ) : sending ? (
                <div className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-purple-300 text-sm">Sending campaign...</span>
                    <span className="text-purple-400 text-sm">{sendProgress}%</span>
                  </div>
                  <div className="h-2 bg-purple-900/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-300"
                      style={{ width: `${sendProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="flex-1 bg-purple-900/20 border border-purple-800/30 rounded-xl px-4 py-3 text-center">
                    <div className="text-white font-bold">{audienceWithPhone.length.toLocaleString()}</div>
                    <div className="text-purple-500 text-xs">recipients</div>
                  </div>
                  <div className="flex-1 bg-purple-900/20 border border-purple-800/30 rounded-xl px-4 py-3 text-center">
                    <div className="text-red-400 font-bold">-${campaignCost.toFixed(2)}</div>
                    <div className="text-purple-500 text-xs">cost</div>
                  </div>
                  <div className="flex-1 bg-green-900/20 border border-green-800/30 rounded-xl px-4 py-3 text-center">
                    <div className="text-green-400 font-bold">+${netUplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="text-purple-500 text-xs">net uplift</div>
                  </div>
                  <button onClick={launchCampaign}
                    disabled={!message.trim() || audienceWithPhone.length === 0 || charCount > 160}
                    className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
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