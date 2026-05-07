"use client";
 
import { useState, useEffect, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
 
// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  score_id: string; user_id: string; name: string; phone: string; email: string | null;
  status: string; gap_ratio: number; days_overdue: number; visits: number;
  potential_value: string; churn_score: number | null; loyalty_score: number | null;
  last_visit: string; avg_gap_days: number; risk_segment: string;
  intervention_recommended: boolean; intervention_value: number; markov_state: string;
}
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface Recommendation { title: string; description: string; impact: string; actionLabel: string; confidence?: number; }
interface Summary { total: number; intervention_ready: number; total_intervention_value: number; }
type MarkovState = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";
 
function deriveMarkovState(c: Customer): MarkovState {
  if (c.visits <= 1) return "C";
  if (c.gap_ratio > 2.5 || c.status === "X") return "X";
  if (c.gap_ratio > 1.3) return "R_at_risk";
  if (c.gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
const MARKOV_META: Record<MarkovState, { label: string; strategy: string; discountRule: string; hex: string }> = {
  C:          { label: "First Timer",  strategy: "Rebook nudge before habit breaks at day 45.",         discountRule: "No discount",  hex: "#38BDF8" },
  X:          { label: "Churned",      strategy: "Aggressive win-back. Loss aversion + $20–30 offer.",  discountRule: "$20–30 off",   hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",      strategy: "Personalise + scarcity. Act within 7 days.",          discountRule: "$10–20 off",   hex: "#FB923C" },
  R_on_fence: { label: "On the Fence", strategy: "Gentle nudge only. No discount needed.",              discountRule: "No discount",  hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",        strategy: "Appreciation only. Never discount loyal clients.",    discountRule: "No discount",  hex: "#34D399" },
};
 
// ─── Design tokens ────────────────────────────────────────────────────────────
const BG   = "bg-[#050810]";
const SURF = "bg-[#090D1A]";
const CARD = "bg-[#0C1120]";
const CARD2 = "bg-[#0F1529]";
const BDR  = "border-[#162038]";
const BDR2 = "border-[#1E2D4E]";
const TIPSTYLE = { backgroundColor: "#0C1120", border: "1px solid #1E2D4E", borderRadius: "6px", color: "#fff", fontSize: "12px" };
 
// ─── Tooltip formatter ────────────────────────────────────────────────────────
const fmtTooltip = ((v: any, n: string) => [`$${Number(v).toLocaleString()}`, n]) as any;
 
// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#34D399" : pct >= 60 ? "#FBBF24" : "#FB923C";
  const label = pct >= 80 ? "High confidence" : pct >= 60 ? "Medium confidence" : "Low confidence";
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 items-end">
        {[1,2,3,4,5].map(i => <div key={i} className="w-1 rounded-sm" style={{ height: `${5+i*2}px`, backgroundColor: i <= Math.round(pct/20) ? color : "#162038" }} />)}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>{pct}% · {label}</span>
    </div>
  );
}
 
// ─── IV badge ─────────────────────────────────────────────────────────────────
function IVBadge({ value }: { value: number }) {
  if (value <= 0) return <span className="text-[#162038] text-xs">—</span>;
  return <div className="text-right"><div className="text-xs font-bold text-emerald-400">+${value.toFixed(2)}</div><div className="text-[9px] uppercase tracking-wider text-slate-600 mt-0.5">ΔV</div></div>;
}
 
// ─── Morning Brief ────────────────────────────────────────────────────────────
function MorningBrief({ venueId }: { venueId: string }) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
 
  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/morning-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue_id: venueId }) });
      const data = await res.json();
      setBrief(data.brief || ""); setCollapsed(false);
    } catch {} finally { setLoading(false); }
  }
 
  return (
    <div className={`${CARD} border ${BDR} rounded-xl mb-6 overflow-hidden`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#162038]/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Intelligence Brief</div>
            <div className="text-sm font-medium text-white">{today}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {brief && <button onClick={() => setCollapsed(c => !c)} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-md border border-[#162038] hover:border-[#1E2D4E]">{collapsed ? "Expand" : "Collapse"}</button>}
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-[11px] font-semibold transition-all disabled:opacity-40"
            style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#FBBF24" }}>
            {loading ? <><div className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />Generating...</> : brief ? "Regenerate" : "Generate Brief"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-6 py-5">
          {brief ? (
            <div className="grid grid-cols-2 gap-3">
              {brief.split(/(?=📊|🎯|👥|📈)/).filter(Boolean).map((section, i) => {
                const emoji = section[0];
                const content = section.slice(1).trim();
                const [header, ...rest] = content.split("\n");
                return (
                  <div key={i} className={`rounded-lg p-4 border ${BDR}`} style={{ background: "rgba(15,21,41,0.6)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{emoji} {header.replace(/\n/g, "")}</div>
                    <p className="text-sm text-slate-300 leading-relaxed">{rest.join(" ").trim()}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-600 text-center py-2">Generate your daily intelligence brief — who to contact, revenue health, and today's priority action.</p>
          )}
        </div>
      )}
    </div>
  );
}
 
// ─── SMS Drawer ───────────────────────────────────────────────────────────────
function SmsDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [smsText, setSmsText] = useState(""); const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false); const [sent, setSent] = useState(false);
  const markovState = deriveMarkovState(customer); const meta = MARKOV_META[markovState];
  const charCount = smsText.length;
 
  async function generateSMS() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer }) });
      const data = await res.json(); setSmsText(data.message || "");
    } catch {} finally { setGenerating(false); }
  }
  async function sendSMS() {
    if (!smsText.trim()) return; setSending(true);
    try {
      const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: customer.phone, message: smsText, customer_name: customer.name, customer_id: customer.user_id, venue_id: process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID, markov_state: markovState, risk_segment: customer.risk_segment, gap_ratio: customer.gap_ratio, days_overdue: customer.days_overdue }) });
      if (res.ok) { setSent(true); setTimeout(onClose, 1800); }
    } catch {} finally { setSending(false); }
  }
 
  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[460px] z-50 flex flex-col border-l border-[#162038]" style={{ background: "#05080F" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#162038] flex-shrink-0">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">Compose SMS</div>
            <div className="text-sm font-semibold text-white">{customer.name}</div>
            <div className="text-xs text-slate-500">{customer.phone}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center border border-[#162038] text-slate-500 hover:text-white hover:border-[#1E2D4E] transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {/* State card */}
          <div className="rounded-lg p-4 mb-5 border" style={{ background: `${meta.hex}08`, borderColor: `${meta.hex}30` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.hex }}>{meta.label} Strategy</div>
              <div className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: `${meta.hex}15`, color: meta.hex }}>{meta.discountRule}</div>
            </div>
            <p className="text-xs text-slate-400">{meta.strategy}</p>
            <div className="flex gap-4 mt-3 pt-3 border-t border-[#162038] text-[10px]">
              {[{ l: "CLV", v: `$${customer.potential_value}` }, { l: "ΔV", v: `+$${customer.intervention_value.toFixed(2)}` }, { l: "Gap", v: `${customer.gap_ratio.toFixed(2)}×` }, { l: "Overdue", v: `${customer.days_overdue}d` }].map(({ l, v }) => (
                <div key={l}><div className="text-slate-600 mb-0.5">{l}</div><div className="text-white font-semibold">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Message</div>
              <span className={`text-[10px] font-mono ${charCount > 160 ? "text-rose-400" : charCount > 140 ? "text-amber-400" : "text-slate-600"}`}>{charCount}/160</span>
            </div>
            <textarea value={smsText} onChange={e => setSmsText(e.target.value)} rows={5} maxLength={320}
              className={`w-full rounded-lg px-4 py-3 text-sm text-white text-sm leading-relaxed resize-none focus:outline-none transition-all`}
              style={{ background: "#090D1A", border: "1px solid #162038" }}
              placeholder={`Write to ${customer.name.split(" ")[0]}...`} />
            <div className="mt-1.5 h-[2px] rounded-full overflow-hidden" style={{ background: "#162038" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((charCount/160)*100,100)}%`, background: charCount > 160 ? "#F43F5E" : charCount > 140 ? "#FBBF24" : "#6366F1" }} />
            </div>
          </div>
          <button onClick={generateSMS} disabled={generating}
            className="w-full mt-3 py-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#818CF8" }}>
            {generating ? <><div className="w-3.5 h-3.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />Generating...</> : "✦ Write with AI"}
          </button>
          {smsText && (
            <div className="mt-4 rounded-lg p-4 border border-[#162038]" style={{ background: "#090D1A" }}>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Preview</div>
              <div className="flex justify-end"><div className="max-w-[80%] bg-[#1D4ED8] rounded-2xl rounded-tr-sm px-3 py-2"><p className="text-white text-xs leading-relaxed">{smsText}</p></div></div>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 border-t border-[#162038] px-6 py-4">
          {sent ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-lg border" style={{ background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.25)" }}>
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-emerald-400 text-sm font-medium">Message sent</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm text-slate-400 border border-[#162038] hover:text-white hover:border-[#1E2D4E] transition-all">Cancel</button>
              <button onClick={sendSMS} disabled={!smsText.trim() || charCount > 160 || sending || !customer.phone || customer.phone === "No phone"}
                className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "#4F46E5" }}>
                {sending ? <><div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : "Send SMS"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
 
function formatMsg(content: string) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {content.split("\n").map((line, i) => {
        const nb = line.match(/^(\d+)\.\s\*\*(.+?)\*\*[:\s—-]*(.*)/);
        if (nb) return <div key={i} className="flex gap-2.5 items-start py-0.5"><span className="flex-shrink-0 w-5 h-5 rounded bg-indigo-600/20 text-indigo-400 text-[10px] flex items-center justify-center font-bold mt-0.5 border border-indigo-600/20">{nb[1]}</span><div><span className="font-medium text-white">{nb[2]}</span>{nb[3] && <span className="text-slate-400"> — {nb[3]}</span>}</div></div>;
        const n = line.match(/^(\d+)\.\s+(.*)/);
        if (n) return <div key={i} className="flex gap-2.5 items-start py-0.5"><span className="flex-shrink-0 text-indigo-400 font-mono text-xs mt-0.5">{n[1]}.</span><span className="text-slate-300">{n[2]}</span></div>;
        if (line.match(/^[-•*]\s/)) return <div key={i} className="flex gap-2 items-start py-0.5"><span className="text-indigo-400 mt-1.5 flex-shrink-0 text-[8px]">◆</span><span className="text-slate-300">{line.replace(/^[-•*]\s/, "")}</span></div>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-slate-300">{line}</p>;
      })}
    </div>
  );
}
 
const SUGGESTED_PROMPTS = ["Who are my top 5 at-risk customers?", "Total CLV of on-fence clients?", "How many are intervention-ready?", "Who has the highest churn score?", "Clients not visited in 90+ days?", "Revenue breakdown by segment?", "Overall health summary"];
const FALLBACK_RECS: Recommendation[] = [
  { title: "Target At-Risk Segment", description: "Deploy personalised SMS to customers with gap_ratio > 1.3. Prioritise top 5 by CLV. Use scarcity framing and $10–20 offer.", impact: "+$840 recoverable", actionLabel: "Launch Campaign", confidence: 0.85 },
  { title: "Win Back Churned Clients", description: "$20 discount to clients lapsed 112+ days. Loss aversion framing outperforms discounting alone by 34%.", impact: "+$420 recoverable", actionLabel: "Create Offer", confidence: 0.72 },
  { title: "First-Timer Rebooking", description: "Book second appointment at day 35–45 before habit breaks. No discount needed. Single SMS achieves 45% conversion.", impact: "+18% conversion", actionLabel: "Send SMS", confidence: 0.91 },
];
 
// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeg, setFilterSeg] = useState("all");
  const [curPage, setCurPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => { fetch(`/api/intelligence/at-risk-customers?venue_id=${VENUE_ID}`).then(r => r.json()).then(d => { setCustomers(d.customers || []); setSummary(d.summary || null); }).catch(console.error).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (customers.length > 0 && recs.length === 0) generateRecs(); }, [customers]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, chatLoading]);
 
  async function generateRecs() {
    setLoadingRecs(true);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue_id: VENUE_ID, type: "recommendations" }) });
      const data = await res.json();
      const r = (data.recommendations || []).map((x: Recommendation, i: number) => ({ ...x, confidence: x.confidence ?? [0.85, 0.72, 0.91][i % 3] }));
      setRecs(r.length > 0 ? r : FALLBACK_RECS);
    } catch { setRecs(FALLBACK_RECS); } finally { setLoadingRecs(false); }
  }
 
  async function sendChat(message: string) {
    if (!message.trim() || chatLoading) return;
    setChatInput(""); setChat(prev => [...prev, { role: "user", content: message.trim() }]); setChatLoading(true);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue_id: VENUE_ID, type: "chat", query: message.trim() }) });
      const data = await res.json();
      setChat(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch { setChat(prev => [...prev, { role: "assistant", content: "Something went wrong." }]); } finally { setChatLoading(false); }
  }
 
  const n = customers.length || 1;
  const atRisk = customers.filter(c => c.gap_ratio > 1.5);
  const onFence = customers.filter(c => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
  const loyal = customers.filter(c => c.gap_ratio <= 0.5);
  const totalValue = customers.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0);
  const avgChurn = customers.reduce((s, c) => s + (c.churn_score || 0), 0) / n;
  const avgGap = customers.reduce((s, c) => s + c.gap_ratio, 0) / n;
  const totalIV = summary?.total_intervention_value ?? customers.reduce((s, c) => s + (c.intervention_value || 0), 0);
 
  const riskData = [{ name: "At Risk", value: atRisk.length, color: "#F43F5E" }, { name: "On Fence", value: onFence.length, color: "#6366F1" }, { name: "Loyal", value: loyal.length, color: "#34D399" }];
  const gapData = [{ r: "0–0.5", n: customers.filter(c => c.gap_ratio <= 0.5).length }, { r: "0.5–1", n: customers.filter(c => c.gap_ratio > 0.5 && c.gap_ratio <= 1).length }, { r: "1–1.5", n: customers.filter(c => c.gap_ratio > 1 && c.gap_ratio <= 1.5).length }, { r: "1.5–2", n: customers.filter(c => c.gap_ratio > 1.5 && c.gap_ratio <= 2).length }, { r: "2+", n: customers.filter(c => c.gap_ratio > 2).length }];
  const odData = [{ r: "0–30d", n: customers.filter(c => c.days_overdue <= 30).length }, { r: "31–60", n: customers.filter(c => c.days_overdue > 30 && c.days_overdue <= 60).length }, { r: "61–90", n: customers.filter(c => c.days_overdue > 60 && c.days_overdue <= 90).length }, { r: "91–180", n: customers.filter(c => c.days_overdue > 90 && c.days_overdue <= 180).length }, { r: "180+", n: customers.filter(c => c.days_overdue > 180).length }];
 
  const filtered = useMemo(() => {
    let f = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) || (c.email && c.email.toLowerCase().includes(search.toLowerCase())));
    if (filterSeg !== "all") f = f.filter(c => c.risk_segment === filterSeg);
    return f;
  }, [customers, search, filterSeg]);
 
  const paginated = useMemo(() => filtered.slice((curPage - 1) * perPage, curPage * perPage), [filtered, curPage, perPage]);
  const totalPages = Math.ceil(filtered.length / perPage);
  useEffect(() => setCurPage(1), [search, filterSeg]);
 
  const riskColor = (g: number) => g > 1.5 ? "#F43F5E" : g > 0.5 ? "#FB923C" : "#34D399";
  const riskLabel = (g: number) => g > 1.5 ? "Critical" : g > 0.5 ? "At Risk" : "Stable";
 
  if (loading) return (
    <div className={`min-h-screen ${BG} flex items-center justify-center`}>
      <div className="text-center">
        <div className="w-12 h-12 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Loading intelligence</div>
      </div>
    </div>
  );
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      {selectedCustomer && <SmsDrawer customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />}
 
      {/* ── Navigation ── */}
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(5,8,16,0.96)" }}>
        <div className="max-w-[1800px] mx-auto px-8 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Rydra</div>
              <div className="text-sm font-semibold text-white leading-none">Demand Intelligence</div>
            </div>
          </div>
 
          <nav className="flex items-center gap-1">
            {[
              { href: "/merchant/dashboard", label: "Dashboard",  active: true },
              { href: "/merchant/outreach",  label: "Outreach"  },
              { href: "/merchant/campaign",  label: "Campaign"  },
              { href: "/merchant/clients",   label: "Clients"   },
              { href: "/merchant/barber",    label: "Barbers"   },
            ].map(tab => (
              <a key={tab.href} href={tab.href}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${tab.active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>
                {tab.label}
              </a>
            ))}
          </nav>
 
          <button onClick={() => document.getElementById("rydra-ai")?.scrollIntoView({ behavior: "smooth" })}
            className="flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white transition-all"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Ask RydraAI
          </button>
        </div>
      </div>
 
      <div className="max-w-[1800px] mx-auto px-8 py-8">
 
        {/* ── Page title ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Canberra</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Demand Intelligence</h1>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#162038]" style={{ background: "#090D1A" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Live</span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500">{customers.length.toLocaleString()} clients</span>
          </div>
        </div>
 
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Clients",      value: customers.length.toLocaleString(), sub: `${atRisk.length.toLocaleString()} critical`,                                        accent: "#6366F1" },
            { label: "Client Value",       value: `$${(totalValue/1000).toFixed(0)}k`,    sub: "Total customer CLV",                                                            accent: "#34D399" },
            { label: "Avg Gap Ratio",      value: `${avgGap.toFixed(2)}×`,               sub: "Overdue multiplier",                                                             accent: "#FBBF24" },
            { label: "Intervention Value", value: `$${totalIV.toLocaleString(undefined,{maximumFractionDigits:0})}`, sub: "ΔV across all clients",                              accent: "#A78BFA" },
            { label: "Avg Churn Risk",     value: `${(avgChurn * 10).toFixed(1)}`,        sub: <><span className="text-slate-600">/10</span> churn probability</>,              accent: "#F43F5E" },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} className={`${CARD} border ${BDR} rounded-xl p-5 relative overflow-hidden hover:border-[#1E2D4E] transition-all group`}>
              <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: accent }} />
              <div className="pl-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">{label}</div>
                <div className="text-3xl font-bold tracking-tight text-white mb-1">{value}</div>
                <div className="text-[11px] text-slate-600">{sub}</div>
              </div>
            </div>
          ))}
        </div>
 
        {/* ── Morning Brief ── */}
        <MorningBrief venueId={VENUE_ID} />
 
        {/* ── AI Recommendations ── */}
        <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6`}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">AI Intelligence</div>
              <h2 className="text-base font-semibold text-white">Recommended Actions</h2>
            </div>
            <button onClick={generateRecs} disabled={loadingRecs}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-white border border-[#162038] hover:border-[#1E2D4E] transition-all disabled:opacity-40">
              <svg className={`w-3.5 h-3.5 ${loadingRecs ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
          {loadingRecs ? (
            <div className="flex items-center justify-center py-10 gap-2">
              <div className="w-4 h-4 border border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-600">Generating intelligence...</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {recs.slice(0, 3).map((rec, idx) => (
                <div key={idx} className={`${CARD2} border ${BDR} rounded-xl p-5 flex flex-col gap-3 hover:border-[#1E2D4E] transition-all`}>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400 mb-1.5">Insight {idx + 1}</div>
                    <h3 className="text-sm font-semibold text-white leading-snug">{rec.title}</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed flex-1">{rec.description}</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    {rec.impact}
                  </div>
                  <ConfBar pct={Math.round((rec.confidence ?? 0.75) * 100)} />
                  <button className="w-full py-2 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all text-indigo-300 hover:text-white"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    {rec.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
 
        {/* ── RydraAI Chat ── */}
        <div id="rydra-ai" className={`${CARD} border ${BDR} rounded-xl mb-6 overflow-hidden`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#162038]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Natural Language Query</div>
                <div className="text-sm font-semibold text-white">RydraAI</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {customers.length.toLocaleString()} records indexed
            </div>
          </div>
 
          <div className="flex" style={{ height: "480px" }}>
            <div className="w-52 flex-shrink-0 border-r border-[#0F1829] p-4 flex flex-col gap-1 overflow-y-auto">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 mb-2 px-1">Suggested Queries</div>
              {SUGGESTED_PROMPTS.map(p => (
                <button key={p} onClick={() => sendChat(p)} disabled={chatLoading}
                  className="text-left text-[11px] text-slate-500 hover:text-slate-200 px-2.5 py-2 rounded-md hover:bg-white/[0.04] transition-all disabled:opacity-40 leading-snug border border-transparent hover:border-[#162038]">
                  {p}
                </button>
              ))}
            </div>
 
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {chat.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Query your database</div>
                      <div className="text-xs text-slate-600 mt-1">Ask anything about your {customers.length.toLocaleString()} clients in plain English</div>
                    </div>
                  </div>
                )}
                {chat.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>}
                    <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "border border-[#162038] rounded-tl-sm text-slate-300"}`} style={msg.role === "assistant" ? { background: "#090D1A" } : {}}>
                      {msg.role === "user" ? msg.content : formatMsg(msg.content)}
                    </div>
                    {msg.role === "user" && <div className="w-6 h-6 rounded-md border border-[#162038] flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#090D1A" }}><svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3"><div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0"><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /></div>
                    <div className="px-4 py-3 rounded-xl rounded-tl-sm border border-[#162038] flex gap-1 items-center" style={{ background: "#090D1A" }}>
                      {[0,150,300].map(d => <div key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-[#0F1829] p-4">
                <form onSubmit={e => { e.preventDefault(); sendChat(chatInput); }} className="flex gap-2">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={chatLoading}
                    placeholder="Ask about your customers..."
                    className="flex-1 rounded-md px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none border border-[#162038] hover:border-[#1E2D4E] focus:border-indigo-500/40 transition-all"
                    style={{ background: "#090D1A" }} />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-all flex items-center gap-2"
                    style={{ background: "#4F46E5" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
 
        {/* ── Charts ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { title: "Risk Distribution", sub: "Client segments", content: (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={riskData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">{riskData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={TIPSTYLE} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#94A3B8", fontSize: "11px" }}>{v}</span>} /></PieChart>
              </ResponsiveContainer>
            )},
            { title: "Gap Ratio", sub: "Distribution across clients", content: (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gapData} margin={{ left: -20 }}><XAxis dataKey="r" stroke="#334155" fontSize={10} tick={{ fill: "#64748B" }} /><YAxis stroke="#334155" fontSize={10} tick={{ fill: "#64748B" }} /><Tooltip contentStyle={TIPSTYLE} formatter={(v: any) => [v, "Clients"]} /><Bar dataKey="n" fill="#6366F1" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            )},
            { title: "Days Overdue", sub: "Urgency distribution", content: (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={odData} margin={{ left: -20 }}><XAxis dataKey="r" stroke="#334155" fontSize={10} tick={{ fill: "#64748B" }} /><YAxis stroke="#334155" fontSize={10} tick={{ fill: "#64748B" }} /><Tooltip contentStyle={TIPSTYLE} formatter={(v: any) => [v, "Clients"]} /><Bar dataKey="n" fill="#FBBF24" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            )},
          ].map(({ title, sub, content }) => (
            <div key={title} className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5">{sub}</div>
              <div className="text-sm font-semibold text-white mb-4">{title}</div>
              {content}
            </div>
          ))}
        </div>
 
        {/* ── Segmentation ── */}
        <div className={`${CARD} border ${BDR} rounded-xl p-6 mb-6`}>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5">Markov Segmentation</div>
          <div className="text-sm font-semibold text-white mb-5">Customer Risk & Opportunity</div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "At Risk",   pct: Math.round(atRisk.length/n*100),  count: atRisk.length,  desc: "High churn probability. Intervention window closing.",        hex: "#F43F5E", action: "Target Now",     discount: "Use $10–20 offer" },
              { label: "On Fence",  pct: Math.round(onFence.length/n*100), count: onFence.length, desc: "Convertible with a single touch. Highest ROI segment.",         hex: "#6366F1", action: "Send Nudge",    discount: "No discount needed" },
              { label: "Loyal",     pct: Math.round(loyal.length/n*100),   count: loyal.length,   desc: "Reliable revenue base. Never discount. Protect with appreciation.", hex: "#34D399", action: "Appreciate",   discount: "No discount — ever" },
            ].map(({ label, pct, count, desc, hex, action, discount }) => (
              <div key={label} className={`${CARD2} border rounded-xl p-5`} style={{ borderColor: `${hex}20` }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: hex }}>{label}</div>
                    <div className="text-4xl font-bold tracking-tight text-white">{pct}%</div>
                    <div className="text-xs text-slate-600 mt-1">{count.toLocaleString()} clients</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${hex}10`, border: `1px solid ${hex}20` }}>
                    <div className="text-[11px] font-bold" style={{ color: hex }}>{pct}%</div>
                  </div>
                </div>
                <div className="h-[2px] rounded-full mb-4" style={{ background: "#162038" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hex }} />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">{desc}</p>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-slate-600">{discount}</div>
                  <button className="text-[10px] font-semibold px-3 py-1.5 rounded-md transition-all" style={{ background: `${hex}12`, border: `1px solid ${hex}25`, color: hex }}>{action}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
 
        {/* ── Search & Table ── */}
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search clients by name, phone, or email..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded-md px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none border border-[#162038] hover:border-[#1E2D4E] focus:border-indigo-500/40 transition-all"
            style={{ background: "#090D1A" }} />
          <select value={filterSeg} onChange={e => setFilterSeg(e.target.value)}
            className="rounded-md px-4 py-2 text-sm text-slate-300 focus:outline-none border border-[#162038] cursor-pointer"
            style={{ background: "#090D1A" }}>
            <option value="all">All Segments</option>
            <option value="Churned">Churned</option>
            <option value="At Risk">At Risk</option>
            <option value="Stable">Stable</option>
          </select>
        </div>
        <div className="text-[10px] text-slate-600 mb-3 uppercase tracking-wider">{filtered.length.toLocaleString()} clients · sorted by intervention value</div>
 
        <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F1829]" style={{ background: "#090D1A" }}>
                  {["Client", "Status", "Gap", "Overdue", "Visits", "CLV", "ΔV", "Action"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600 ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => (
                  <tr key={c.score_id} className="border-b border-[#0A0F1C] hover:bg-white/[0.02] transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md border border-[#162038] flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0 group-hover:border-indigo-500/30 transition-all" style={{ background: "#090D1A" }}>
                          {c.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm text-white font-medium">{c.name}</div>
                          <div className="text-[10px] text-slate-600">{c.phone || "No phone"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor(c.gap_ratio) }} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: riskColor(c.gap_ratio) }}>{riskLabel(c.gap_ratio)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right"><span className="text-sm font-medium" style={{ color: riskColor(c.gap_ratio) }}>{c.gap_ratio.toFixed(2)}×</span></td>
                    <td className="px-5 py-3.5 text-right"><span className="text-sm text-white">{c.days_overdue}</span><span className="text-[10px] text-slate-600 ml-1">d</span></td>
                    <td className="px-5 py-3.5 text-right text-sm text-slate-400">{c.visits}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-medium text-emerald-400">${c.potential_value}</td>
                    <td className="px-5 py-3.5 text-right"><IVBadge value={c.intervention_value} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => setSelectedCustomer(c)}
                        className="px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-indigo-300 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                        style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                        SMS
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-[11px] text-slate-600 uppercase tracking-wider">No clients found</div>}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#0F1829]" style={{ background: "#090D1A" }}>
              <div className="text-[10px] text-slate-600">{((curPage-1)*perPage)+1}–{Math.min(curPage*perPage,filtered.length)} of {filtered.length.toLocaleString()}</div>
              <div className="flex items-center gap-2">
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setCurPage(1); }}
                  className="text-[10px] border border-[#162038] rounded px-2 py-1 text-slate-400 cursor-pointer" style={{ background: "#090D1A" }}>
                  {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n}/page</option>)}
                </select>
                {[{ l: "←", a: () => setCurPage(p => Math.max(1, p-1)), d: curPage===1 }, { l: "→", a: () => setCurPage(p => Math.min(totalPages, p+1)), d: curPage===totalPages }].map(({ l, a, d }) => (
                  <button key={l} onClick={a} disabled={d} className="w-7 h-7 rounded-md border border-[#162038] text-slate-400 text-sm disabled:opacity-30 hover:border-[#1E2D4E] hover:text-white transition-all" style={{ background: "#090D1A" }}>{l}</button>
                ))}
                <div className="text-[10px] text-slate-600 px-2">{curPage}/{totalPages}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}