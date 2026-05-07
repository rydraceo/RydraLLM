"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
 
// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  user_id: string; name: string; phone: string | null; email: string | null;
  total_visits: number; gap_ratio: number; days_overdue: number;
  avg_gap_days: number; min_gap_days: number; max_gap_days: number;
  last_visit: string | null; clv: number; total_revenue: number;
  avg_rev_per_visit: number; churn_score: number; loyalty_score: number;
  risk_segment: string; markov_state: string; intervention_value: number;
  intervention_lift: number; natural_rebook: number; sms_rebook: number;
  current_state: string; fav_day: string | null; gaps: number[];
}
 
// ─── Constants ────────────────────────────────────────────────────────────────
const STATE_META: Record<string, { label: string; color: string; bg: string; border: string; strategy: string; discount: string; emoji: string }> = {
  C:          { label: "First Timer",   color: "text-blue-400",   bg: "bg-blue-900/30",   border: "border-blue-600/40",   strategy: "Rebook nudge before habit breaks at day 45. Create the routine early.", discount: "No discount",    emoji: "🌱" },
  X:          { label: "Churned",       color: "text-red-400",    bg: "bg-red-900/30",    border: "border-red-600/40",    strategy: "Win-back campaign needed. Use loss aversion + $20–30 incentive.",    discount: "$20–30 off",    emoji: "⚠️" },
  R_at_risk:  { label: "At Risk",       color: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-600/40", strategy: "Loyal customer drifting. Personalise + scarcity. Act within 7 days.",  discount: "$10–20 off",    emoji: "🔥" },
  R_on_fence: { label: "On the Fence",  color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-600/40", strategy: "Gentle nudge only. No discount — they may rebook without it.",          discount: "No discount",   emoji: "⚖️" },
  R_loyal:    { label: "Loyal",         color: "text-green-400",  bg: "bg-green-900/30",  border: "border-green-600/40",  strategy: "Appreciation message only. Never discount loyal customers.",           discount: "No discount",   emoji: "⭐" },
};
 
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard",  icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/merchant/outreach",  label: "Outreach",   icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { href: "/merchant/campaign",  label: "Campaign",   icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  { href: "/merchant/clients",   label: "Clients",    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", active: true },
  { href: "/merchant/barber",    label: "Barbers",    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];
 
const TOOLTIPSTYLE = { backgroundColor: "#1e1b4b", border: "1px solid #6366f1", borderRadius: "8px", color: "#fff" };
 
// ─── Gauge Arc ────────────────────────────────────────────────────────────────
function GaugeArc({ value, max = 10, color, label, size = 120 }: { value: number; max?: number; color: string; label: string; size?: number }) {
  const pct = Math.min(value / max, 1);
  const r = 44; const cx = 60; const cy = 60;
  const start = -Math.PI * 0.8; const end = Math.PI * 0.8;
  const arcLen = end - start;
  const toXY = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  const s = toXY(start); const e = toXY(end);
  const sv = toXY(start + arcLen * pct); const largeArc = arcLen * pct > Math.PI ? 1 : 0;
  const bg = `M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`;
  const fg = pct > 0 ? `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${sv.x} ${sv.y}` : "";
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75} viewBox="0 0 120 90">
        <path d={bg} fill="none" stroke="#2d1b69" strokeWidth="10" strokeLinecap="round" />
        {fg && <path d={fg} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />}
        <text x="60" y="62" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{value.toFixed(1)}</text>
        <text x="60" y="76" textAnchor="middle" fill="#a78bfa" fontSize="9">/{max}</text>
      </svg>
      <span className="text-xs text-purple-400 uppercase tracking-wider -mt-1">{label}</span>
    </div>
  );
}
 
// ─── SMS Drawer ───────────────────────────────────────────────────────────────
function SmsDrawer({ customer, onClose, onSent }: { customer: Customer; onClose: () => void; onSent: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const meta = STATE_META[customer.markov_state] || STATE_META.R_at_risk;
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  async function generate() {
    setGenLoading(true);
    try {
      const res = await fetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: { name: customer.name, phone: customer.phone, markov_state: customer.markov_state, gap_ratio: customer.gap_ratio, days_overdue: customer.days_overdue, visits: customer.total_visits, potential_value: customer.clv.toFixed(2), intervention_value: customer.intervention_value, risk_segment: customer.risk_segment } }) });
      const d = await res.json(); setText(d.message || "");
    } catch {} finally { setGenLoading(false); }
  }
 
  async function send() {
    if (!text.trim() || !customer.phone) return;
    setSending(true);
    try {
      const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: customer.phone, message: text, customer_name: customer.name, customer_id: customer.user_id, venue_id: VENUE_ID, markov_state: customer.markov_state, risk_segment: customer.risk_segment, gap_ratio: customer.gap_ratio, days_overdue: customer.days_overdue }) });
      if (!res.ok) throw new Error("failed");
      setSent(true); onSent(text); setTimeout(onClose, 1800);
    } catch {} finally { setSending(false); }
  }
 
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] z-50 flex flex-col shadow-2xl" style={{ background: "linear-gradient(180deg,#0d0122,#130828)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-800/40 bg-purple-900/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></div>
            <div><div className="text-white font-semibold">SMS {customer.name.split(" ")[0]}</div><div className="text-purple-400 text-xs">{customer.phone}</div></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-purple-900/50 flex items-center justify-center text-purple-400 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className={`rounded-xl border p-4 mb-4 ${meta.bg} ${meta.border}`}>
            <div className="flex items-center gap-2 mb-2"><span className="text-base">{meta.emoji}</span><span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span><span className="ml-auto text-xs text-purple-300 bg-purple-900/40 px-2 py-0.5 rounded-full">{meta.discount}</span></div>
            <p className="text-purple-200 text-xs">{meta.strategy}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[{ l: "CLV", v: `$${customer.clv.toFixed(0)}`, c: "text-green-400" }, { l: "ΔV", v: `+$${customer.intervention_value.toFixed(2)}`, c: "text-green-400" }, { l: "Days Overdue", v: customer.days_overdue, c: "text-orange-400" }].map(({ l, v, c }) => (
              <div key={l} className="bg-purple-900/40 rounded-xl p-3 text-center"><div className={`text-sm font-bold ${c}`}>{v}</div><div className="text-purple-500 text-xs mt-0.5">{l}</div></div>
            ))}
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={160} className="w-full bg-purple-900/30 border border-purple-700/40 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none mb-2" placeholder={`Write a message to ${customer.name.split(" ")[0]}...`} />
          <div className="flex items-center justify-between mb-3"><div className="h-1 flex-1 bg-purple-900/60 rounded-full overflow-hidden mr-3"><div className={`h-full rounded-full ${text.length > 160 ? "bg-red-500" : text.length > 140 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min((text.length / 160) * 100, 100)}%` }} /></div><span className={`text-xs font-mono ${text.length > 140 ? "text-yellow-400" : "text-purple-500"}`}>{text.length}/160</span></div>
          <button onClick={generate} disabled={genLoading} className="w-full py-2.5 rounded-xl border border-purple-600/50 bg-purple-900/30 hover:bg-purple-800/40 text-purple-200 hover:text-white text-sm font-medium transition-all flex items-center justify-center gap-2 mb-4 disabled:opacity-40">
            {genLoading ? <><div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />Generating...</> : "✦ Write with AI"}
          </button>
          {text && (<div className="bg-gray-950 rounded-xl p-3 border border-gray-800/60 mb-4"><p className="text-gray-500 text-xs mb-2">Preview</p><div className="flex justify-end"><div className="max-w-[80%] bg-green-600 rounded-2xl rounded-tr-sm px-3 py-2"><p className="text-white text-xs">{text}</p></div></div></div>)}
        </div>
        <div className="flex-shrink-0 border-t border-purple-800/40 px-6 py-4">
          {sent ? (<div className="flex items-center justify-center gap-2 py-3 bg-green-900/40 border border-green-600/40 rounded-xl"><svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-green-400 font-medium">Sent!</span></div>) : (
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-purple-700/40 text-purple-400 text-sm">Cancel</button>
              <button onClick={send} disabled={!text.trim() || sending || !customer.phone} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                {sending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : "Send SMS"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientProfilePage() {
  const params = useParams();
  const userId = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "outreach" | "visits" | "action">("overview");
  const [localOutreach, setLocalOutreach] = useState<any[]>([]);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/clients/${userId}?venue_id=${VENUE_ID}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(d => { setData(d); setLocalOutreach(d.outreach || []); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [userId]);
 
  if (loading) return <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center"><div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" /></div>;
  if (error || !data) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="text-center bg-purple-900/30 border border-purple-700/40 rounded-2xl p-8 max-w-sm">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-white font-semibold mb-2">Client not found</p>
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <a href="/merchant/clients" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-sm">← Back to clients</a>
      </div>
    </div>
  );
 
  const { customer: c, events } = data;
  const meta = STATE_META[c.markov_state] || STATE_META.R_at_risk;
  const churnColor = c.churn_score > 0.6 ? "#ef4444" : c.churn_score > 0.35 ? "#f97316" : "#22c55e";
  const loyalColor = c.loyalty_score > 0.6 ? "#22c55e" : c.loyalty_score > 0.3 ? "#eab308" : "#ef4444";
  const initials = c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
 
  // Gap chart data
  const gapChartData = (c.gaps || []).slice(-12).map((g: number, i: number) => ({
    visit: `V${i + 2}`, gap: g, avg: c.avg_gap_days,
  }));
 
  // Monthly spend chart
  const monthlySpend: Record<string, number> = {};
  (events || []).forEach((e: any) => {
    if (e.revenue > 0) {
      const m = new Date(e.date).toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
      monthlySpend[m] = (monthlySpend[m] || 0) + e.revenue;
    }
  });
  const spendData = Object.entries(monthlySpend).slice(-8).map(([month, revenue]) => ({ month, revenue }));
 
  const outreachCount = localOutreach.length;
  const deliveredCount = localOutreach.filter((o: any) => ["delivered", "queued", "sent"].includes(o.status)).length;
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
      {drawerOpen && <SmsDrawer customer={c} onClose={() => setDrawerOpen(false)} onSent={(msg) => { setLocalOutreach(prev => [{ id: Date.now(), message: msg, status: "queued", markov_state: c.markov_state, sent_at: new Date().toISOString(), cost: "0.08" }, ...prev]); }} />}
 
      {/* Header */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
            <div><h1 className="text-xl font-semibold">{c.name}</h1><p className="text-purple-300 text-xs">Client profile · Alkami Barbershop</p></div>
          </div>
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            {NAV.map(tab => <a key={tab.href} href={tab.href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${(tab as any).active ? "bg-purple-600 text-white" : "text-purple-300 hover:text-white hover:bg-purple-800/50"}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>{tab.label}</a>)}
          </div>
          <a href="/merchant/clients" className="text-purple-400 hover:text-white text-sm flex items-center gap-1 ml-auto flex-shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>All clients</a>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* ── Hero Card ── */}
        <div className="bg-gradient-to-r from-purple-900/40 to-purple-800/20 rounded-2xl border border-purple-700/30 p-6 mb-6 flex items-center gap-6 flex-wrap">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-3xl flex-shrink-0 shadow-xl shadow-purple-500/20">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-3xl font-bold text-white">{c.name}</h2>
              <span className={`text-sm px-3 py-1 rounded-full border font-semibold ${meta.bg} ${meta.border} ${meta.color}`}>{meta.emoji} {meta.label}</span>
            </div>
            <div className="flex items-center gap-5 flex-wrap text-sm text-purple-300">
              {c.phone && <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>{c.phone}</span>}
              {c.email && <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>{c.email}</span>}
              {c.fav_day && <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Usually visits on {c.fav_day}s</span>}
              {c.last_visit && <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Last visit {new Date(c.last_visit).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>}
            </div>
          </div>
          <button onClick={() => setDrawerOpen(true)} disabled={!c.phone}
            className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-purple-500/20 disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Send SMS
          </button>
        </div>
 
        {/* ── Top Metric Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: "Lifetime Visits", value: c.total_visits, sub: `Avg every ${c.avg_gap_days}d`, color: "text-purple-400" },
            { label: "Total Revenue", value: `$${c.total_revenue.toFixed(0)}`, sub: `$${c.avg_rev_per_visit.toFixed(0)}/visit`, color: "text-green-400" },
            { label: "CLV", value: `$${c.clv.toFixed(0)}`, sub: "Lifetime value", color: "text-green-400" },
            { label: "Days Overdue", value: c.days_overdue, sub: `Gap ratio ${c.gap_ratio.toFixed(2)}x`, color: c.days_overdue > 60 ? "text-red-400" : c.days_overdue > 30 ? "text-orange-400" : "text-green-400" },
            { label: "SMS Sent", value: outreachCount, sub: `${deliveredCount} delivered`, color: "text-blue-400" },
            { label: "Intervention ΔV", value: `+$${c.intervention_value.toFixed(2)}`, sub: `${Math.round(c.intervention_lift * 100)}% rebook lift`, color: "text-green-400" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-purple-950/40 border border-purple-800/30 rounded-2xl p-4">
              <div className="text-purple-500 text-xs uppercase tracking-wider mb-1">{label}</div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-purple-600 text-xs mt-1">{sub}</div>
            </div>
          ))}
        </div>
 
        {/* ── Scores + Markov row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Gauges */}
          <div className="bg-purple-950/40 border border-purple-800/30 rounded-2xl p-5 flex flex-col items-center gap-3">
            <GaugeArc value={c.churn_score * 10} color={churnColor} label="Churn Risk" />
            <div className={`text-xs font-semibold px-3 py-1 rounded-full ${c.churn_score > 0.6 ? "bg-red-900/40 text-red-400" : c.churn_score > 0.35 ? "bg-orange-900/40 text-orange-400" : "bg-green-900/40 text-green-400"}`}>
              {c.churn_score > 0.6 ? "High Risk" : c.churn_score > 0.35 ? "Moderate Risk" : "Low Risk"}
            </div>
          </div>
          <div className="bg-purple-950/40 border border-purple-800/30 rounded-2xl p-5 flex flex-col items-center gap-3">
            <GaugeArc value={c.loyalty_score * 10} color={loyalColor} label="Loyalty Score" />
            <div className={`text-xs font-semibold px-3 py-1 rounded-full ${c.loyalty_score > 0.6 ? "bg-green-900/40 text-green-400" : c.loyalty_score > 0.3 ? "bg-yellow-900/40 text-yellow-400" : "bg-red-900/40 text-red-400"}`}>
              {c.loyalty_score > 0.6 ? "Highly Loyal" : c.loyalty_score > 0.3 ? "Moderately Loyal" : "Low Loyalty"}
            </div>
          </div>
 
          {/* Markov State */}
          <div className={`rounded-2xl border p-5 ${meta.bg} ${meta.border} col-span-1 lg:col-span-1`}>
            <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-3">Markov State</div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{meta.emoji}</span>
              <span className={`text-lg font-bold ${meta.color}`}>{meta.label}</span>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300`}>{meta.discount}</span>
            </div>
            <p className="text-purple-200 text-xs leading-relaxed">{meta.strategy}</p>
            <div className="mt-3 pt-3 border-t border-purple-700/30 grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-purple-500">Natural rebook</div><div className="text-white font-medium">{Math.round(c.natural_rebook * 100)}%</div></div>
              <div><div className="text-purple-500">With SMS</div><div className="text-green-400 font-medium">{Math.round(c.sms_rebook * 100)}%</div></div>
            </div>
          </div>
 
          {/* Intervention Value breakdown */}
          <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-700/30 rounded-2xl p-5">
            <div className="text-green-300 text-xs uppercase tracking-wider mb-2">Intervention Value (ΔV)</div>
            <div className="text-4xl font-bold text-green-400 mb-1">{c.intervention_value > 0 ? `+$${c.intervention_value.toFixed(2)}` : "—"}</div>
            <div className="text-green-600 text-xs mb-4">Expected return from sending one SMS</div>
            <div className="space-y-1.5 text-xs border-t border-green-800/30 pt-3">
              {[
                { l: "CLV", v: `$${c.clv.toFixed(2)}` },
                { l: "Rebook lift", v: `${Math.round(c.intervention_lift * 100)}pp` },
                { l: "SMS cost", v: "-$0.08" },
                { l: "Net ΔV", v: `+$${c.intervention_value.toFixed(2)}`, bold: true },
              ].map(({ l, v, bold }) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="text-green-600">{l}</span>
                  <span className={bold ? "text-green-400 font-bold" : "text-green-300"}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
 
        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-5 bg-purple-950/40 border border-purple-800/30 rounded-xl p-1 w-fit">
          {(["overview", "outreach", "visits", "action"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-purple-600 text-white" : "text-purple-400 hover:text-white hover:bg-purple-800/40"}`}>{tab === "action" ? "Recommended Action" : tab}</button>
          ))}
        </div>
 
        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Key metrics table */}
            <div className="bg-purple-950/30 border border-purple-800/30 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-4">Client Profile</h3>
              <div className="space-y-2.5">
                {[
                  { l: "Total visits", v: c.total_visits },
                  { l: "Avg visit gap", v: `${c.avg_gap_days} days` },
                  { l: "Shortest gap", v: c.min_gap_days > 0 ? `${c.min_gap_days} days` : "—" },
                  { l: "Longest gap", v: c.max_gap_days > 0 ? `${c.max_gap_days} days` : "—" },
                  { l: "Gap ratio", v: `${c.gap_ratio.toFixed(2)}x`, c: c.gap_ratio > 1.5 ? "text-red-400" : c.gap_ratio > 1.0 ? "text-orange-400" : "text-green-400" },
                  { l: "Days overdue", v: c.days_overdue },
                  { l: "Last visit", v: c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-AU") : "—" },
                  { l: "Fav day", v: c.fav_day || "—", c: "text-purple-300" },
                  { l: "Total revenue", v: `$${c.total_revenue.toFixed(2)}`, c: "text-green-400" },
                  { l: "Avg per visit", v: `$${c.avg_rev_per_visit.toFixed(2)}` },
                  { l: "Lifetime value (CLV)", v: `$${c.clv.toFixed(2)}`, c: "text-green-400 font-semibold" },
                  { l: "Risk segment", v: c.risk_segment },
                ].map(({ l, v, c: col }) => (
                  <div key={l} className="flex items-center justify-between py-1.5 border-b border-purple-800/20">
                    <span className="text-purple-400 text-xs">{l}</span>
                    <span className={`text-xs font-medium ${col || "text-white"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
 
            {/* Visit gap trend chart */}
            <div className="bg-purple-950/30 border border-purple-800/30 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-1">Visit Gap Trend</h3>
              <p className="text-purple-400 text-xs mb-4">Days between visits vs average</p>
              {gapChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={gapChartData}>
                    <XAxis dataKey="visit" stroke="#a78bfa" fontSize={11} />
                    <YAxis stroke="#a78bfa" fontSize={11} unit="d" />
                    <Tooltip contentStyle={TOOLTIPSTYLE} formatter={(v: any) => [`${v} days`, ""]} />
                    <ReferenceLine y={c.avg_gap_days} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: "avg", fill: "#a78bfa", fontSize: 10 }} />
                    <Line type="monotone" dataKey="gap" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 4 }} activeDot={{ r: 6 }} name="Gap" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-purple-500 text-sm">Not enough visits to show trend</div>
              )}
 
              {/* Monthly spend */}
              {spendData.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-white mt-5 mb-1">Monthly Spend</h3>
                  <p className="text-purple-400 text-xs mb-3">Revenue per month</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={spendData}>
                      <XAxis dataKey="month" stroke="#a78bfa" fontSize={10} />
                      <YAxis stroke="#a78bfa" fontSize={10} tickFormatter={(v: number) => `$${v}`} />
                      <Tooltip contentStyle={TOOLTIPSTYLE} formatter={(v: any) => [`$${Number(v).toFixed(0)}`, "Spend"]} />
                      <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          </div>
        )}
 
        {/* ── Outreach Tab ── */}
        {activeTab === "outreach" && (
          <div className="bg-purple-950/30 border border-purple-800/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">Outreach History</h3>
                <p className="text-purple-400 text-xs mt-0.5">{outreachCount} messages sent · {deliveredCount} delivered</p>
              </div>
              <button onClick={() => setDrawerOpen(true)} disabled={!c.phone} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-sm font-medium disabled:opacity-40">
                + New SMS
              </button>
            </div>
            {localOutreach.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">💬</div>
                <p className="text-purple-400 font-medium mb-1">No messages sent yet</p>
                <p className="text-purple-600 text-sm mb-4">Start a conversation with {c.name.split(" ")[0]}</p>
                <button onClick={() => setDrawerOpen(true)} disabled={!c.phone} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white text-sm font-medium disabled:opacity-40">Send First Message</button>
              </div>
            ) : (
              <div className="space-y-3">
                {localOutreach.map((o: any) => {
                  const sm = STATE_META[o.markov_state];
                  return (
                    <div key={o.id} className="bg-purple-900/30 border border-purple-800/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${["delivered","queued","sent"].includes(o.status) ? "bg-green-900/40 border-green-600/50 text-green-400" : o.status === "failed" ? "bg-red-900/40 border-red-600/50 text-red-400" : "bg-purple-900/40 border-purple-600/50 text-purple-400"}`}>{o.status}</span>
                          {sm && <span className={`text-xs font-medium ${sm.color}`}>{sm.emoji} {sm.label}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          {o.cost && <span className="text-purple-500">${o.cost}</span>}
                          <span className="text-purple-500">{new Date(o.sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <p className="text-purple-100 text-sm leading-relaxed">{o.message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
 
        {/* ── Visits Tab ── */}
        {activeTab === "visits" && (
          <div className="bg-purple-950/30 border border-purple-800/30 rounded-2xl p-6">
            <h3 className="text-base font-semibold text-white mb-4">Visit History — {events.length} appointments</h3>
            {events.length === 0 ? (
              <div className="text-center py-12 text-purple-500">No visit history available</div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-purple-800/40" />
                <div className="space-y-3">
                  {events.map((e: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-4 relative">
                      <div className="w-9 h-9 rounded-full bg-purple-800/60 border border-purple-700/40 flex items-center justify-center flex-shrink-0 relative z-10">
                        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="flex-1 bg-purple-900/30 border border-purple-800/20 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white text-sm font-medium">{new Date(e.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                            <div className="text-purple-400 text-xs capitalize mt-0.5">{e.type || "appointment"}</div>
                          </div>
                          {e.revenue > 0 && <div className="text-green-400 font-semibold">${e.revenue.toFixed(0)}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
 
        {/* ── Action Tab ── */}
        {activeTab === "action" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`rounded-2xl border p-6 ${meta.bg} ${meta.border}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{meta.emoji}</span>
                <div><div className={`text-lg font-bold ${meta.color}`}>{meta.label} Strategy</div><div className="text-purple-400 text-xs">{meta.discount}</div></div>
              </div>
              <p className="text-purple-200 text-sm leading-relaxed mb-4">{meta.strategy}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { l: "Natural rebook rate", v: `${Math.round(c.natural_rebook * 100)}%` },
                  { l: "Post-SMS rebook rate", v: `${Math.round(c.sms_rebook * 100)}%`, c: "text-green-400" },
                  { l: "Lift from SMS", v: `+${Math.round(c.intervention_lift * 100)}pp`, c: "text-green-400" },
                  { l: "SMS cost", v: "$0.08", c: "text-red-400" },
                  { l: "Net ΔV", v: `+$${c.intervention_value.toFixed(2)}`, c: "text-green-400 font-bold" },
                  { l: "Urgency", v: c.days_overdue > 90 ? "Critical" : c.days_overdue > 45 ? "High" : "Medium", c: c.days_overdue > 90 ? "text-red-400" : c.days_overdue > 45 ? "text-orange-400" : "text-yellow-400" },
                ].map(({ l, v, c: col }) => (
                  <div key={l} className="bg-purple-900/30 rounded-xl p-3">
                    <div className="text-purple-500 mb-1">{l}</div>
                    <div className={`font-semibold ${col || "text-white"}`}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
 
            <div className="bg-purple-950/40 border border-purple-800/30 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-4">Take Action</h3>
              <div className="space-y-3">
                <button onClick={() => setDrawerOpen(true)} disabled={!c.phone}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white font-semibold transition-all flex items-center justify-center gap-3 shadow-lg shadow-purple-500/20 disabled:opacity-40">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  Send Personalised SMS · +${c.intervention_value.toFixed(2)} expected
                </button>
                <a href="/merchant/campaign" className="w-full py-4 border border-purple-700/40 hover:border-purple-600/60 hover:bg-purple-800/30 rounded-xl text-purple-300 hover:text-white font-medium transition-all flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                  Add to Bulk Campaign
                </a>
                {!c.phone && (
                  <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
                    <p className="text-red-400 text-sm font-medium">No phone number on file</p>
                    <p className="text-red-600 text-xs mt-1">SMS not available for this client</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}