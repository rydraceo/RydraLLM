"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
 
const BG   = "bg-[#050810]";
const SURF = "bg-[#090D1A]";
const CARD = "bg-[#0C1120]";
const CARD2 = "bg-[#0F1529]";
const BDR  = "border-[#162038]";
const BDR2 = "border-[#1E2D4E]";
const TIP  = { backgroundColor: "#0C1120", border: "1px solid #1E2D4E", borderRadius: "4px", color: "#fff", fontSize: "11px" };
 
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/outreach",  label: "Outreach"  },
  { href: "/merchant/campaign",  label: "Campaign"  },
  { href: "/merchant/clients",   label: "Clients", active: true },
  { href: "/merchant/barber",    label: "Barbers"   },
];
 
const STATE_META: Record<string, { label: string; strategy: string; discount: string; hex: string }> = {
  C:          { label: "First Timer",  strategy: "Rebook nudge before habit breaks at day 45. Create the routine early — no discount needed.",  discount: "No discount",  hex: "#38BDF8" },
  X:          { label: "Churned",      strategy: "Aggressive win-back. Loss aversion framing + $20–30 incentive. Act immediately.",             discount: "$20–30 off",   hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",      strategy: "Loyal customer drifting. Personalise + create scarcity. Act within 7 days.",                  discount: "$10–20 off",   hex: "#FB923C" },
  R_on_fence: { label: "On the Fence", strategy: "Gentle nudge only. No discount — they may rebook without incentive.",                         discount: "No discount",  hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",        strategy: "Appreciation message only. Discounting loyal clients destroys CLV.",                          discount: "No discount",  hex: "#34D399" },
};
 
function ArcGauge({ value, max = 10, hex, label }: { value: number; max?: number; hex: string; label: string }) {
  const pct = Math.min(value / max, 1);
  const r = 42; const cx = 56; const cy = 56;
  const start = -Math.PI * 0.75; const sweep = Math.PI * 1.5;
  const toXY = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const s = toXY(start); const e = toXY(start + sweep);
  const sv = toXY(start + sweep * pct); const la = sweep * pct > Math.PI ? 1 : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={112} height={90} viewBox="0 0 112 90">
        <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="#162038" strokeWidth="8" strokeLinecap="round" />
        {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${la} 1 ${sv.x} ${sv.y}`} fill="none" stroke={hex} strokeWidth="8" strokeLinecap="round" />}
        <text x="56" y="58" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{value.toFixed(1)}</text>
        <text x="56" y="70" textAnchor="middle" fill="#475569" fontSize="8">/{max}</text>
      </svg>
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: hex }}>{label}</span>
    </div>
  );
}
 
function SmsDrawer({ customer: c, onClose, onSent }: { customer: any; onClose: () => void; onSent: (m: string) => void }) {
  const [text, setText] = useState(""); const [gen, setGen] = useState(false); const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  const meta = STATE_META[c.markov_state] || STATE_META.R_at_risk;
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
  async function generate() { setGen(true); try { const r = await fetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: c }) }); const d = await r.json(); setText(d.message || ""); } catch {} finally { setGen(false); } }
  async function send() { if (!text.trim() || !c.phone) return; setSending(true); try { const r = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: c.phone, message: text, customer_name: c.name, customer_id: c.user_id, venue_id: VENUE_ID, markov_state: c.markov_state, risk_segment: c.risk_segment, gap_ratio: c.gap_ratio, days_overdue: c.days_overdue }) }); if (r.ok) { setSent(true); onSent(text); setTimeout(onClose, 1800); } } catch {} finally { setSending(false); } }
  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] z-50 flex flex-col border-l border-[#162038]" style={{ background: "#05080F" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#162038] flex-shrink-0">
          <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Compose SMS</div><div className="text-sm font-semibold text-white">{c.name}</div><div className="text-[10px] text-slate-600">{c.phone}</div></div>
          <button onClick={onClose} className="w-7 h-7 rounded-md border border-[#162038] text-slate-500 hover:text-white flex items-center justify-center transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-lg p-4 mb-4 border" style={{ background: `${meta.hex}08`, borderColor: `${meta.hex}25` }}>
            <div className="flex items-center justify-between mb-1.5"><span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: meta.hex }}>{meta.label}</span><span className="text-[9px] px-2 py-0.5 rounded font-medium" style={{ background: `${meta.hex}15`, color: meta.hex }}>{meta.discount}</span></div>
            <p className="text-xs text-slate-500">{meta.strategy}</p>
            <div className="flex gap-4 mt-3 pt-3 border-t border-[#162038] text-[9px]">
              {[{ l: "CLV", v: `$${c.clv?.toFixed(0) || 0}` }, { l: "ΔV", v: `+$${c.intervention_value?.toFixed(2) || 0}` }, { l: "Gap", v: `${c.gap_ratio?.toFixed(2) || 0}×` }, { l: "Overdue", v: `${c.days_overdue || 0}d` }].map(({ l, v }) => (
                <div key={l}><div className="text-slate-600 mb-0.5">{l}</div><div className="text-white font-semibold">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between mb-1.5"><span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Message</span><span className={`text-[9px] font-mono ${text.length > 140 ? "text-amber-400" : "text-slate-600"}`}>{text.length}/160</span></div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={160} className="w-full rounded-lg px-4 py-3 text-sm text-white resize-none focus:outline-none border border-[#162038] focus:border-indigo-500/40 transition-all" style={{ background: "#090D1A" }} placeholder={`Message to ${c.name?.split(" ")[0]}...`} />
          <div className="h-0.5 rounded-full mt-1.5 mb-3" style={{ background: "#162038" }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.min((text.length/160)*100,100)}%`, background: text.length > 160 ? "#F43F5E" : "#6366F1" }} /></div>
          <button onClick={generate} disabled={gen} className="w-full py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818CF8" }}>
            {gen ? <><div className="w-3 h-3 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />Generating...</> : "✦ Write with AI"}
          </button>
          {text && <div className="mt-4 rounded-lg p-3 border border-[#162038]" style={{ background: "#090D1A" }}><div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">Preview</div><div className="flex justify-end"><div className="max-w-[80%] bg-[#1D4ED8] rounded-2xl rounded-tr-sm px-3 py-2"><p className="text-white text-xs leading-relaxed">{text}</p></div></div></div>}
        </div>
        <div className="flex-shrink-0 border-t border-[#162038] px-5 py-4">
          {sent ? <div className="flex items-center justify-center gap-2 py-3 rounded-lg border" style={{ background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.2)" }}><svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-emerald-400 text-sm font-medium">Sent</span></div> : (
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm text-slate-400 border border-[#162038] hover:text-white transition-all">Cancel</button>
              <button onClick={send} disabled={!text.trim() || sending || !c.phone} className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-all" style={{ background: "#4F46E5" }}>
                {sending ? <><div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : "Send SMS"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
 
export default function ClientProfilePage() {
  const params = useParams();
  const userId = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview"|"outreach"|"visits"|"action">("overview");
  const [localOutreach, setLocalOutreach] = useState<any[]>([]);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/clients/${userId}?venue_id=${VENUE_ID}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(d => { setData(d); setLocalOutreach(d.outreach || []); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [userId]);
 
  if (loading) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="w-10 h-10 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading profile</div></div></div>;
  if (error || !data) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mb-2">Client not found</div><p className="text-xs text-slate-600 mb-4">{error}</p><a href="/merchant/clients" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to clients</a></div></div>;
 
  const { customer: c, events } = data;
  const meta = STATE_META[c.markov_state] || STATE_META.R_at_risk;
  const initials = c.name.split(" ").map((n: string) => n[0]).slice(0,2).join("").toUpperCase();
  const churnHex = (c.churn_score||0) > 0.6 ? "#F43F5E" : (c.churn_score||0) > 0.35 ? "#FB923C" : "#34D399";
  const loyalHex = (c.loyalty_score||0) > 0.6 ? "#34D399" : (c.loyalty_score||0) > 0.3 ? "#FBBF24" : "#F43F5E";
  const gaps = (c.gaps || []).slice(-10).map((g: number, i: number) => ({ v: `V${i+2}`, gap: g, avg: c.avg_gap_days }));
  const monthlySpend: Record<string, number> = {};
  (events || []).forEach((e: any) => { if (e.revenue > 0) { const m = new Date(e.date).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }); monthlySpend[m] = (monthlySpend[m]||0) + e.revenue; }});
  const spendData = Object.entries(monthlySpend).slice(-8).map(([month, revenue]) => ({ month, revenue }));
  const outCount = localOutreach.length;
  const delivCount = localOutreach.filter((o: any) => ["delivered","queued","sent"].includes(o.status)).length;
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      {drawer && <SmsDrawer customer={c} onClose={() => setDrawer(false)} onSent={msg => setLocalOutreach(p => [{ id: Date.now(), message: msg, status: "queued", markov_state: c.markov_state, sent_at: new Date().toISOString(), cost: "0.08" }, ...p])} />}
 
      {/* Nav */}
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(5,8,16,0.96)" }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none truncate max-w-[160px]">{c.name}</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => <a key={tab.href} href={tab.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>{tab.label}</a>)}
          </nav>
          <a href="/merchant/clients" className="ml-auto text-[10px] text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1 flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            All clients
          </a>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* Hero */}
        <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6 flex items-center gap-6`}>
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0" style={{ background: `${meta.hex}18`, border: `1px solid ${meta.hex}35` }}>{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <h1 className="text-2xl font-bold text-white tracking-tight">{c.name}</h1>
              <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md" style={{ background: `${meta.hex}15`, border: `1px solid ${meta.hex}30`, color: meta.hex }}>{meta.label}</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
              {c.phone && <span>{c.phone}</span>}
              {c.email && <span>{c.email}</span>}
              {c.fav_day && <span>Usually {c.fav_day}s</span>}
              {c.last_visit && <span>Last visit {new Date(c.last_visit).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>}
            </div>
          </div>
          <button onClick={() => setDrawer(true)} disabled={!c.phone}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "#4F46E5", boxShadow: "0 4px 20px rgba(99,102,241,0.25)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Send SMS
          </button>
        </div>
 
        {/* Top metrics */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {[
            { l: "Lifetime Visits",  v: c.total_visits,                             sub: `Every ${c.avg_gap_days}d avg`,  acc: "#6366F1" },
            { l: "Total Revenue",    v: `$${c.total_revenue?.toFixed(0) || 0}`,      sub: `$${c.avg_rev_per_visit?.toFixed(0) || 0}/visit`, acc: "#34D399" },
            { l: "CLV",              v: `$${c.clv?.toFixed(0) || 0}`,               sub: "Lifetime value",                acc: "#34D399" },
            { l: "Days Overdue",     v: c.days_overdue,                              sub: `Gap ${c.gap_ratio?.toFixed(2) || 0}×`, acc: c.days_overdue > 60 ? "#F43F5E" : c.days_overdue > 30 ? "#FB923C" : "#34D399" },
            { l: "SMS Sent",         v: outCount,                                    sub: `${delivCount} delivered`,       acc: "#38BDF8" },
            { l: "Intervention ΔV",  v: `+$${c.intervention_value?.toFixed(2) || 0}`, sub: `${Math.round((c.intervention_lift||0)*100)}% lift`, acc: "#34D399" },
          ].map(({ l, v, sub, acc }) => (
            <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden hover:border-[#1E2D4E] transition-all`}>
              <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
              <div className="pl-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{l}</div>
                <div className="text-2xl font-bold tracking-tight text-white mb-0.5">{v}</div>
                <div className="text-[10px] text-slate-600">{sub}</div>
              </div>
            </div>
          ))}
        </div>
 
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Gauges */}
          <div className={`${CARD} border ${BDR} rounded-xl p-5 flex flex-col items-center justify-center gap-3`}>
            <ArcGauge value={(c.churn_score||0)*10} hex={churnHex} label="Churn Risk" />
            <ArcGauge value={(c.loyalty_score||0)*10} hex={loyalHex} label="Loyalty Score" />
          </div>
 
          {/* Markov */}
          <div className="rounded-xl p-5 border" style={{ background: `${meta.hex}06`, borderColor: `${meta.hex}20` }}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">Markov State</div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg font-bold" style={{ color: meta.hex }}>{meta.label}</span>
              <span className="ml-auto text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider" style={{ background: `${meta.hex}15`, color: meta.hex }}>{meta.discount}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">{meta.strategy}</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] pt-3 border-t border-[#162038]">
              {[{ l: "Natural rebook", v: `${Math.round((c.natural_rebook||0)*100)}%` }, { l: "Post-SMS", v: `${Math.round((c.sms_rebook||0)*100)}%`, highlight: true }, { l: "Lift", v: `+${Math.round((c.intervention_lift||0)*100)}pp`, highlight: true }, { l: "SMS cost", v: "$0.08" }].map(({ l, v, highlight }) => (
                <div key={l} className="rounded-md p-2" style={{ background: "#090D1A" }}><div className="text-slate-600 mb-0.5">{l}</div><div className={`font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>{v}</div></div>
              ))}
            </div>
          </div>
 
          {/* ΔV card */}
          <div className="rounded-xl p-5 border" style={{ background: "rgba(52,211,153,0.04)", borderColor: "rgba(52,211,153,0.18)" }}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Intervention Value (ΔV)</div>
            <div className="text-4xl font-bold tracking-tight text-emerald-400 mb-1">{c.intervention_value > 0 ? `+$${c.intervention_value.toFixed(2)}` : "—"}</div>
            <div className="text-[10px] text-slate-600 mb-4">Expected return from one SMS</div>
            <div className="space-y-1.5 text-[10px] border-t border-[#162038] pt-3">
              {[{ l: "CLV", v: `$${c.clv?.toFixed(2)||0}` }, { l: "Conversion lift", v: `${Math.round((c.intervention_lift||0)*100)}pp` }, { l: "SMS cost", v: "-$0.08" }, { l: "Net ΔV", v: `+$${c.intervention_value?.toFixed(2)||0}`, bold: true }].map(({ l, v, bold }) => (
                <div key={l} className="flex items-center justify-between"><span className="text-slate-600">{l}</span><span className={bold ? "text-emerald-400 font-bold" : "text-slate-400"}>{v}</span></div>
              ))}
            </div>
          </div>
 
          {/* Key metrics */}
          <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">Key Metrics</div>
            <div className="space-y-2">
              {[
                { l: "Total visits",    v: c.total_visits },
                { l: "Avg visit gap",   v: `${c.avg_gap_days}d` },
                { l: "Gap ratio",       v: `${c.gap_ratio?.toFixed(2)||0}×`, col: c.gap_ratio > 1.5 ? "#F43F5E" : c.gap_ratio > 1 ? "#FB923C" : "#34D399" },
                { l: "Days overdue",    v: c.days_overdue },
                { l: "Lifetime value",  v: `$${c.clv?.toFixed(2)||0}`, col: "#34D399" },
                { l: "Last visit",      v: c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-AU") : "—" },
                { l: "Risk segment",    v: c.risk_segment || "—" },
              ].map(({ l, v, col }) => (
                <div key={l} className="flex items-center justify-between py-1 border-b border-[#0F1529]">
                  <span className="text-[10px] text-slate-600">{l}</span>
                  <span className="text-[10px] font-semibold" style={{ color: col || "#fff" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
 
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[#162038]">
          {(["overview","outreach","visits","action"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all capitalize border-b-2 -mb-px ${activeTab === tab ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-600 hover:text-slate-300"}`}>
              {tab === "action" ? "Action" : tab}
            </button>
          ))}
        </div>
 
        {/* Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-5">
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Visit Gap Trend</div>
              {gaps.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={gaps}><XAxis dataKey="v" stroke="#1E2D4E" fontSize={10} tick={{ fill: "#475569" }} /><YAxis stroke="#1E2D4E" fontSize={10} tick={{ fill: "#475569" }} unit="d" /><Tooltip contentStyle={TIP} formatter={(v: any) => [`${v}d`, ""]} /><ReferenceLine y={c.avg_gap_days} stroke="#4F46E5" strokeDasharray="3 3" /><Line type="monotone" dataKey="gap" stroke="#FB923C" strokeWidth={2} dot={{ fill: "#FB923C", r: 3 }} /></LineChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-48 text-[10px] text-slate-700 uppercase tracking-wider">Not enough visits for trend</div>}
            </div>
            {spendData.length > 0 ? (
              <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Monthly Spend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={spendData} margin={{ left: -20 }}><XAxis dataKey="month" stroke="#1E2D4E" fontSize={10} tick={{ fill: "#475569" }} /><YAxis stroke="#1E2D4E" fontSize={10} tick={{ fill: "#475569" }} tickFormatter={(v: number) => `$${v}`} /><Tooltip contentStyle={TIP} formatter={(v: any) => [`$${Number(v).toFixed(0)}`, "Spend"]} /><Bar dataKey="revenue" fill="#34D399" radius={[3,3,0,0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className={`${CARD} border ${BDR} rounded-xl p-5 flex items-center justify-center`}><span className="text-[10px] text-slate-700 uppercase tracking-wider">No spend data</span></div>}
          </div>
        )}
 
        {/* Outreach */}
        {activeTab === "outreach" && (
          <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-5">
              <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Communication History</div><div className="text-sm font-semibold text-white">{outCount} messages · {delivCount} delivered</div></div>
              <button onClick={() => setDrawer(true)} disabled={!c.phone} className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-40 transition-all" style={{ background: "#4F46E5" }}>+ New SMS</button>
            </div>
            {localOutreach.length === 0 ? (
              <div className="text-center py-12"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-3">No messages yet</div><button onClick={() => setDrawer(true)} disabled={!c.phone} className="px-4 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-40" style={{ background: "#4F46E5" }}>Send First Message</button></div>
            ) : (
              <div className="space-y-2">
                {localOutreach.map((o: any) => (
                  <div key={o.id} className={`rounded-lg border ${BDR} p-4 hover:border-[#1E2D4E] transition-all`} style={{ background: "#090D1A" }}>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: ["delivered","queued","sent"].includes(o.status) ? "#34D399" : "#F43F5E" }} />
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ["delivered","queued","sent"].includes(o.status) ? "#34D399" : "#F43F5E" }}>{o.status}</span>
                        {o.markov_state && STATE_META[o.markov_state] && <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: STATE_META[o.markov_state].hex }}>{STATE_META[o.markov_state].label}</span>}
                      </div>
                      <span className="text-[9px] text-slate-600">{new Date(o.sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{o.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
 
        {/* Visits */}
        {activeTab === "visits" && (
          <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-5">{events?.length || 0} Appointments on Record</div>
            {(!events || events.length === 0) ? <div className="text-center py-10 text-[9px] text-slate-700 uppercase tracking-wider">No visit history available</div> : (
              <div className="space-y-2">
                {events.map((e: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 py-2.5 border-b border-[#0F1529]">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    <div className="flex-1 text-sm text-white">{new Date(e.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
                    <div className="text-[10px] text-slate-600 capitalize">{e.type || "appointment"}</div>
                    {e.revenue > 0 && <div className="text-sm font-semibold text-emerald-400">${e.revenue.toFixed(0)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
 
        {/* Action */}
        {activeTab === "action" && (
          <div className="grid grid-cols-2 gap-5">
            <div className="rounded-xl p-5 border" style={{ background: `${meta.hex}05`, borderColor: `${meta.hex}20` }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">{meta.label} Strategy</div>
              <p className="text-sm text-slate-300 leading-relaxed mb-5">{meta.strategy}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {[{ l: "Natural rebook", v: `${Math.round((c.natural_rebook||0)*100)}%` }, { l: "Post-SMS rebook", v: `${Math.round((c.sms_rebook||0)*100)}%`, h: true }, { l: "Lift from SMS", v: `+${Math.round((c.intervention_lift||0)*100)}pp`, h: true }, { l: "Net ΔV", v: `+$${c.intervention_value?.toFixed(2)||0}`, h: true }, { l: "Urgency", v: c.days_overdue > 90 ? "Critical" : c.days_overdue > 45 ? "High" : "Medium" }, { l: "Discount rule", v: meta.discount }].map(({ l, v, h }) => (
                  <div key={l} className="rounded-md p-2.5" style={{ background: "#090D1A" }}><div className="text-slate-600 mb-0.5">{l}</div><div className={`font-bold ${h ? "text-emerald-400" : "text-white"}`}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-5">Take Action</div>
              <div className="space-y-3">
                <button onClick={() => setDrawer(true)} disabled={!c.phone}
                  className="w-full py-3.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: "#4F46E5", boxShadow: "0 4px 20px rgba(99,102,241,0.2)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  Send Personalised SMS · +${c.intervention_value?.toFixed(2)||0} expected
                </button>
                <a href="/merchant/campaign" className={`w-full py-3.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white border ${BDR} hover:border-[#1E2D4E] transition-all flex items-center justify-center gap-2`} style={{ background: "#090D1A" }}>
                  Add to Bulk Campaign
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}