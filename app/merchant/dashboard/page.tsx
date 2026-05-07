"use client";
 
import { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
 
interface Customer {
  score_id: string; user_id: string; name: string; phone: string; email: string | null;
  status: string; gap_ratio: number; days_overdue: number; visits: number;
  potential_value: string; churn_score: number | null; loyalty_score: number | null;
  last_visit: string; avg_gap_days: number; risk_segment: string;
  intervention_recommended: boolean; intervention_value: number; markov_state: string;
}
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface Recommendation { title: string; description: string; impact: string; actionLabel: string; confidence?: number; }
interface Summary { total: number; intervention_ready: number; total_intervention_value: number; sms_cost_per_message: number; }
type MarkovState = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";
 
function deriveMarkovState(c: Customer): MarkovState {
  if (c.visits <= 1) return "C";
  if (c.gap_ratio > 2.5 || c.status === "X") return "X";
  if (c.gap_ratio > 1.3) return "R_at_risk";
  if (c.gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
const MARKOV_META: Record<MarkovState, { label: string; color: string; bg: string; border: string; strategy: string; discountRule: string }> = {
  C: { label: "First Timer", color: "text-blue-400", bg: "bg-blue-900/30", border: "border-blue-600/40", strategy: "Rebook nudge before habit breaks at day 45. No discount needed.", discountRule: "No discount" },
  X: { label: "Churned", color: "text-red-400", bg: "bg-red-900/30", border: "border-red-600/40", strategy: "Aggressive win-back. Loss aversion + $20–30 discount.", discountRule: "$20–30 discount" },
  R_at_risk: { label: "At Risk", color: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-600/40", strategy: "Loyal customer drifting. Personalise + scarcity. $10–20 discount.", discountRule: "$10–20 discount" },
  R_on_fence: { label: "On the Fence", color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-600/40", strategy: "Gentle reminder only. No discount — may rebook without it.", discountRule: "No discount" },
  R_loyal: { label: "Loyal", color: "text-green-400", bg: "bg-green-900/30", border: "border-green-600/40", strategy: "Appreciation message only. Never discount loyal customers.", discountRule: "No discount" },
};
 
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "text-green-400 bg-green-900/30 border-green-600/40" : pct >= 60 ? "text-yellow-400 bg-yellow-900/30 border-yellow-600/40" : "text-orange-400 bg-orange-900/30 border-orange-600/40";
  const label = pct >= 80 ? "High confidence" : pct >= 60 ? "Medium confidence" : "Low confidence";
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${color}`}>
      <div className="flex gap-0.5 items-end">
        {[1,2,3,4,5].map(i => <div key={i} className={`w-1.5 rounded-sm ${i <= Math.round(pct/20) ? "opacity-100" : "opacity-20"}`} style={{ height: `${6+i*2}px`, backgroundColor: "currentColor" }} />)}
      </div>
      <span>{pct}% · {label}</span>
    </div>
  );
}
 
function InterventionBadge({ value }: { value: number }) {
  if (value <= 0) return <span className="text-purple-600 text-xs">—</span>;
  const color = value > 20 ? "text-green-400" : value > 5 ? "text-yellow-400" : "text-orange-400";
  return <div className={`text-xs font-semibold ${color}`}>+${value.toFixed(2)}<div className="text-purple-500 font-normal">ΔV</div></div>;
}
 
// ─── Morning Brief ────────────────────────────────────────────────────────────
 
function MorningBrief({ venueId }: { venueId: string }) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
 
  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/morning-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId }),
      });
      const data = await res.json();
      setBrief(data.brief || "");
      setGenerated(true);
      setCollapsed(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
 
  function formatBrief(text: string) {
    return (
      <div className="space-y-3">
        {text.split("\n").map((line, i) => {
          if (!line.trim()) return null;
          const hasEmoji = /^[📊🎯👥📈]/.test(line);
          if (hasEmoji) {
            const rest = line.slice(2).trim();
            const colonIdx = rest.indexOf("\n");
            return (
              <div key={i} className="bg-purple-900/30 rounded-xl px-4 py-3">
                <p className="text-white font-semibold text-sm">{line[0]} {rest}</p>
              </div>
            );
          }
          return <p key={i} className="text-purple-200 text-sm leading-relaxed px-1">{line}</p>;
        })}
      </div>
    );
  }
 
  return (
    <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-2xl border border-purple-700/40 mb-8 overflow-hidden">
      <div className="flex items-center justify-between px-8 py-5 border-b border-purple-800/30 bg-gradient-to-r from-purple-900/40 to-pink-900/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Morning Brief</h2>
            <p className="text-purple-300 text-xs">{today} · AI-generated from live data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {generated && (
            <button onClick={() => setCollapsed(c => !c)} className="px-3 py-1.5 rounded-lg border border-purple-700/40 text-purple-400 hover:text-white text-xs transition-colors">
              {collapsed ? "Show" : "Hide"}
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 shadow-lg">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</> : generated ? "Regenerate" : "Generate Today's Brief"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-8 py-6">
          {brief ? (
            formatBrief(brief)
          ) : (
            <div className="text-center py-6">
              <p className="text-purple-400 text-sm">Hit "Generate Today's Brief" for a daily intelligence summary — who to contact, what to focus on, and your revenue health score.</p>
            </div>
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
  const [error, setError] = useState<string | null>(null); const [aiStrategy, setAiStrategy] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markovState = deriveMarkovState(customer); const meta = MARKOV_META[markovState];
  const charCount = smsText.length;
  const charColor = charCount > 160 ? "text-red-400" : charCount > 140 ? "text-yellow-400" : "text-green-400";
  const firstName = customer.name?.split(" ")[0] || customer.name;
  const weeksOverdue = Math.round(customer.days_overdue / 7);
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  async function generateSMS() {
    setGenerating(true); setError(null);
    try {
      const res = await fetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer }) });
      if (!res.ok) throw new Error("failed");
      const data = await res.json(); setSmsText(data.message); if (data.strategy) setAiStrategy(data.strategy); textareaRef.current?.focus();
    } catch { setError("AI generation failed."); } finally { setGenerating(false); }
  }
  async function sendSMS() {
    if (!smsText.trim() || charCount > 160) return; setSending(true); setError(null);
    try {
      const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: customer.phone, message: smsText, customer_name: customer.name, customer_id: customer.user_id, venue_id: process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID, markov_state: markovState, risk_segment: customer.risk_segment, gap_ratio: customer.gap_ratio, days_overdue: customer.days_overdue }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "failed"); setSent(true); setTimeout(onClose, 2000);
    } catch (err: any) { setError(err.message || "Failed to send."); } finally { setSending(false); }
  }
  const getRiskStyle = (g: number) => g > 1.5 ? "bg-red-900/50 border-red-500/60 text-red-400" : g > 0.5 ? "bg-orange-900/50 border-orange-500/60 text-orange-400" : "bg-green-900/50 border-green-500/60 text-green-400";
  const getRiskLabel = (g: number) => g > 1.5 ? "Critical" : g > 0.5 ? "At Risk" : "Stable";
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] z-50 flex flex-col shadow-2xl" style={{ background: "linear-gradient(180deg, #0d0122 0%, #130828 100%)" }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-purple-800/40 bg-gradient-to-r from-purple-900/40 to-pink-900/20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></div>
            <div><h2 className="text-white font-semibold">Compose SMS</h2><p className="text-purple-400 text-xs">Powered by RydraAI · Markov + Behavioural Economics</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-purple-900/50 hover:bg-purple-800/60 flex items-center justify-center text-purple-400 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4">
            <div className="bg-purple-900/30 border border-purple-700/40 rounded-2xl p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">{customer.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1"><h3 className="text-white font-semibold">{customer.name}</h3><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getRiskStyle(customer.gap_ratio)}`}>{getRiskLabel(customer.gap_ratio)}</span></div>
                  <div className="text-purple-400 text-sm">{customer.phone || "No phone"}</div>
                  {customer.email && <div className="text-purple-500 text-xs">{customer.email}</div>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[{ label: "Gap Ratio", value: `${customer.gap_ratio.toFixed(1)}x`, color: "text-orange-400" }, { label: "Days Overdue", value: customer.days_overdue, color: "text-red-400" }, { label: "CLV", value: `$${customer.potential_value}`, color: "text-green-400" }, { label: "ΔV", value: customer.intervention_value > 0 ? `+$${customer.intervention_value.toFixed(2)}` : "—", color: customer.intervention_value > 0 ? "text-green-400" : "text-purple-500" }].map(({ label, value, color }) => (
                  <div key={label} className="bg-purple-900/40 rounded-xl p-2.5 text-center"><div className={`text-sm font-bold ${color}`}>{value}</div><div className="text-purple-500 text-xs mt-0.5">{label}</div></div>
                ))}
              </div>
              {customer.intervention_value > 0 && <div className="mt-3 pt-3 border-t border-purple-700/30 text-xs text-purple-400">ΔV = CLV × conversion_lift − $0.08 = <span className="text-green-400 font-medium">+${customer.intervention_value.toFixed(2)}</span></div>}
            </div>
          </div>
          <div className="px-6 pb-4">
            <div className={`rounded-2xl border p-4 ${meta.bg} ${meta.border}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Markov State</span><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>{meta.label}</span><span className="ml-auto text-xs text-purple-300">{meta.discountRule}</span></div>
              <p className="text-sm text-purple-200">{meta.strategy}</p>
              <div className="mt-3 pt-3 border-t border-purple-700/30 flex gap-4 text-xs text-purple-400 flex-wrap">
                <span>First name: <span className="text-white font-medium">{firstName}</span></span>
                <span><span className="text-white font-medium">{weeksOverdue}</span> weeks overdue</span>
                <span><span className="text-white font-medium">{customer.visits}</span> visits</span>
              </div>
            </div>
          </div>
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-purple-300">Message</label><div className="flex items-center gap-2"><span className={`text-xs font-mono font-medium ${charColor}`}>{charCount}/160</span>{charCount > 160 && <span className="text-xs text-red-400">Splits into 2 SMS</span>}</div></div>
            <textarea ref={textareaRef} value={smsText} onChange={e => setSmsText(e.target.value)} placeholder={`Write your message to ${firstName}...`} rows={5} maxLength={320} className="w-full bg-purple-900/30 border border-purple-700/40 hover:border-purple-600/60 focus:border-purple-500 rounded-xl px-4 py-3 text-white placeholder-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm leading-relaxed resize-none transition-colors" />
            <div className="mt-2 h-1 bg-purple-900/60 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${charCount > 160 ? "bg-red-500" : charCount > 140 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min((charCount/160)*100,100)}%` }} /></div>
            <button onClick={generateSMS} disabled={generating} className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-purple-600/50 bg-purple-900/30 hover:bg-purple-800/40 text-purple-200 hover:text-white text-sm font-medium transition-all disabled:opacity-50">
              {generating ? <><div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />Generating...</> : <>✦ Write with AI</>}
            </button>
            {aiStrategy && <p className="mt-2 text-xs text-purple-500"><span className="text-purple-400 font-medium">Applied: </span>{aiStrategy.slice(0,100)}…</p>}
          </div>
          {smsText && (
            <div className="px-6 pb-4">
              <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Preview</p>
              <div className="bg-gray-950 rounded-2xl p-4 border border-gray-800/80">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800"><div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">{firstName[0]}</div><div><div className="text-white text-xs font-medium">{customer.name}</div><div className="text-gray-500 text-xs">{customer.phone}</div></div><div className="ml-auto text-gray-600 text-xs">now</div></div>
                <div className="flex justify-end"><div className="max-w-[80%] bg-green-600 rounded-2xl rounded-tr-sm px-3 py-2"><p className="text-white text-xs">{smsText}</p></div></div>
              </div>
            </div>
          )}
          {error && <div className="mx-6 mb-4 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3"><p className="text-red-300 text-sm">{error}</p></div>}
        </div>
        <div className="flex-shrink-0 border-t border-purple-800/40 px-6 py-4 bg-purple-950/50">
          {sent ? (
            <div className="flex items-center justify-center gap-2 py-3 bg-green-900/40 border border-green-600/40 rounded-xl"><svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-green-400 font-medium">Sent to {customer.name}</span></div>
          ) : (
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-purple-700/40 text-purple-400 hover:text-white hover:border-purple-600/60 hover:bg-purple-900/30 transition-all text-sm font-medium">Cancel</button>
              <button onClick={sendSMS} disabled={!smsText.trim() || charCount > 160 || sending || !customer.phone || customer.phone === "No phone"} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
                {sending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send SMS</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
 
function renderInlineBold(text: string) {
  if (!text.includes("**")) return <>{text}</>;
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, j) => j % 2 === 1 ? <span key={j} className="font-semibold text-white">{p}</span> : p)}</>;
}
 
function formatMessage(content: string) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {content.split("\n").map((line, i) => {
        const nb = line.match(/^(\d+)\.\s\*\*(.+?)\*\*[:\s—-]*(.*)/);
        if (nb) return <div key={i} className="flex gap-3 items-start py-1"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">{nb[1]}</span><div><span className="font-semibold text-white">{nb[2]}</span>{nb[3] && <span className="text-purple-200"> — {nb[3]}</span>}</div></div>;
        const n = line.match(/^(\d+)\.\s+(.*)/);
        if (n) return <div key={i} className="flex gap-3 items-start py-0.5"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-800 text-purple-200 text-xs flex items-center justify-center font-semibold mt-0.5">{n[1]}</span><span className="text-purple-100">{renderInlineBold(n[2])}</span></div>;
        if (line.match(/^[-•*]\s/)) return <div key={i} className="flex gap-2 items-start py-0.5"><span className="text-purple-400 mt-1.5 flex-shrink-0 text-xs">◆</span><span className="text-purple-100">{renderInlineBold(line.replace(/^[-•*]\s/, ""))}</span></div>;
        if (line.match(/^#{1,3}\s/) || (line.endsWith(":") && line.length < 50 && !line.includes("."))) return <p key={i} className="font-semibold text-white text-sm pt-2 pb-0.5 border-b border-purple-700/40">{line.replace(/^#{1,3}\s/, "").replace(/:$/, "")}</p>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-purple-100">{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}
 
const SUGGESTED_PROMPTS = ["Who are my top 5 at-risk customers?","What's the total CLV of on-fence customers?","How many customers are intervention-ready?","Who has the highest churn score?","Which customers haven't visited in 90+ days?","What's my revenue breakdown by segment?","Give me a summary of overall health"];
const FALLBACK_RECS: Recommendation[] = [
  { title: "Target At-Risk Segment", description: "Send personalised SMS to customers with gap_ratio > 1.3. Focus on top 5 by CLV first.", impact: "+$840 potential", actionLabel: "Send SMS", confidence: 0.85 },
  { title: "Win Back Churned Clients", description: "$20 discount to customers lapsed 112+ days. Loss aversion framing works best.", impact: "+$420 potential", actionLabel: "Launch Campaign", confidence: 0.72 },
  { title: "First-Timer Follow-Up", description: "Rebook reminders at day 35-45 before habit breaks. No discount needed.", impact: "+18% conversion", actionLabel: "Send SMS", confidence: 0.91 },
];
 
export default function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSegment, setFilterSegment] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => { fetchDemandIntelligence(); }, []);
  useEffect(() => { if (customers.length > 0 && aiRecommendations.length === 0) generateAIRecommendations(); }, [customers]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatLoading]);
 
  async function fetchDemandIntelligence() {
    try {
      const res = await fetch(`/api/intelligence/at-risk-customers?venue_id=${VENUE_ID}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setCustomers(data.customers || []); setSummary(data.summary || null);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }
 
  async function generateAIRecommendations() {
    setLoadingRecommendations(true);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue_id: VENUE_ID, type: "recommendations" }) });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const recs = (data.recommendations || []).map((r: Recommendation, i: number) => ({ ...r, confidence: r.confidence ?? [0.85, 0.72, 0.91][i % 3] }));
      setAiRecommendations(recs.length > 0 ? recs : FALLBACK_RECS);
    } catch { setAiRecommendations(FALLBACK_RECS); } finally { setLoadingRecommendations(false); }
  }
 
  async function sendChatMessage(message: string) {
    if (!message.trim() || chatLoading) return;
    setChatInput(""); setChatMessages(prev => [...prev, { role: "user", content: message.trim() }]); setChatLoading(true);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue_id: VENUE_ID, type: "chat", query: message.trim() }) });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch { setChatMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]); } finally { setChatLoading(false); }
  }
 
  function calculateStats(d: Customer[]) {
    const atRisk = d.filter(c => c.gap_ratio > 1.5); const onFence = d.filter(c => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
    const loyal = d.filter(c => c.gap_ratio <= 0.5); const n = d.length || 1;
    return {
      totalValue: d.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0),
      avgChurn: d.reduce((s, c) => s + (c.churn_score || 0), 0) / n,
      avgGapRatio: d.reduce((s, c) => s + c.gap_ratio, 0) / n,
      atRisk: atRisk.length, onFence: onFence.length, loyal: loyal.length,
      interventionReady: d.filter(c => c.intervention_value > 0).length,
      interventionValue: summary?.total_intervention_value ?? d.reduce((s, c) => s + (c.intervention_value || 0), 0),
      atRiskPct: d.length > 0 ? (atRisk.length / d.length) * 100 : 0,
      onFencePct: d.length > 0 ? (onFence.length / d.length) * 100 : 0,
      loyalPct: d.length > 0 ? (loyal.length / d.length) * 100 : 0,
      gapRatioBuckets: { "0-0.5": d.filter(c => c.gap_ratio <= 0.5).length, "0.5-1": d.filter(c => c.gap_ratio > 0.5 && c.gap_ratio <= 1).length, "1-1.5": d.filter(c => c.gap_ratio > 1 && c.gap_ratio <= 1.5).length, "1.5-2": d.filter(c => c.gap_ratio > 1.5 && c.gap_ratio <= 2).length, "2+": d.filter(c => c.gap_ratio > 2).length },
      overdueCategories: { "0-30": d.filter(c => c.days_overdue <= 30).length, "31-60": d.filter(c => c.days_overdue > 30 && c.days_overdue <= 60).length, "61-90": d.filter(c => c.days_overdue > 60 && c.days_overdue <= 90).length, "91-180": d.filter(c => c.days_overdue > 90 && c.days_overdue <= 180).length, "180+": d.filter(c => c.days_overdue > 180).length },
    };
  }
 
  const stats = useMemo(() => calculateStats(customers), [customers, summary]);
  const riskData = [{ name: "At Risk", value: stats.atRisk, color: "#ef4444" }, { name: "On the Fence", value: stats.onFence, color: "#a855f7" }, { name: "Loyal", value: stats.loyal, color: "#3b82f6" }];
  const gapData = Object.entries(stats.gapRatioBuckets).map(([range, count]) => ({ range, count }));
  const overdueData = Object.entries(stats.overdueCategories).map(([range, count]) => ({ range, count }));
  const filteredCustomers = useMemo(() => {
    let f = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm) || (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())));
    if (filterSegment !== "all") f = f.filter(c => c.risk_segment === filterSegment);
    return f;
  }, [customers, searchTerm, filterSegment]);
  const paginatedCustomers = useMemo(() => { const s = (currentPage-1)*itemsPerPage; return filteredCustomers.slice(s, s+itemsPerPage); }, [filteredCustomers, currentPage, itemsPerPage]);
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  useEffect(() => setCurrentPage(1), [searchTerm, filterSegment]);
  const getRiskColor = (g: number) => g > 1.5 ? "text-red-400" : g > 0.5 ? "text-orange-400" : "text-green-400";
  const getRiskBadge = (g: number) => g > 1.5 ? { label: "Critical", cls: "bg-red-900/40 border-red-500/60 text-red-400" } : g > 0.5 ? { label: "At Risk", cls: "bg-orange-900/40 border-orange-500/60 text-orange-400" } : { label: "Stable", cls: "bg-green-900/40 border-green-500/60 text-green-400" };
  const visibleRecommendations = showAllSuggestions ? aiRecommendations : aiRecommendations.slice(0, 3);
  const tooltipStyle = { backgroundColor: "#1e1b4b", border: "1px solid #6366f1", borderRadius: "8px", color: "#fff" };
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="text-center"><div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" /><p className="text-slate-400 font-light">Loading intelligence...</p></div>
    </div>
  );
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
      {selectedCustomer && <SmsDrawer customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />}
 
      {/* ── Header ── */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
            <div><h1 className="text-2xl font-semibold">Demand Intelligence</h1><p className="text-purple-300 text-xs">AI-powered customer recovery · Alkami Barbershop</p></div>
          </div>
 
          {/* ── 5 Tabs ── */}
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            <div className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Dashboard
            </div>
            <a href="/merchant/outreach" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>Outreach
            </a>
            <a href="/merchant/campaign" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>Campaign
            </a>
            <a href="/merchant/clients" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Clients
            </a>
            <a href="/merchant/barber" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Barbers
            </a>
          </div>
 
          <button onClick={() => document.getElementById("rydra-ai")?.scrollIntoView({ behavior: "smooth" })}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl transition-all text-sm font-medium shadow-lg shadow-purple-500/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Ask RydraAI
          </button>
        </div>
      </div>
 
      <div className="max-w-[1800px] mx-auto px-8 py-8">
 
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
          {[
            { label: "Total Clients", value: customers.length.toLocaleString(), sub: `${stats.atRisk.toLocaleString()} critical`, color: "purple", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
            { label: "Potential Revenue", value: `$${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: "Total customer CLV", color: "green", d: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Avg Gap Ratio", value: `${stats.avgGapRatio.toFixed(2)}x`, sub: "Overdue multiplier", color: "orange", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
            { label: "Intervention Value", value: `$${stats.interventionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `ΔV across ${stats.interventionReady} customers · $0.08/SMS`, color: "amber", d: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
            { label: "Avg Churn Risk", value: `${(stats.avgChurn * 10).toFixed(1)}/10`, sub: "Churn probability score", color: "red", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
          ].map(({ label, value, sub, color, d }) => (
            <div key={label} className={`bg-gradient-to-br from-${color}-900/30 to-${color}-800/20 rounded-2xl p-6 border border-${color}-700/30`}>
              <div className="flex items-start justify-between mb-4">
                <div><div className={`text-${color}-300 text-xs mb-1 uppercase tracking-wider`}>{label}</div><div className="text-3xl font-bold text-white">{value}</div></div>
                <div className={`w-11 h-11 rounded-xl bg-${color}-500/20 flex items-center justify-center`}><svg className={`w-5 h-5 text-${color}-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg></div>
              </div>
              <div className={`text-xs text-${color}-400`}>{sub}</div>
            </div>
          ))}
        </div>
 
        {/* ── Morning Brief ── */}
        <MorningBrief venueId={VENUE_ID} />
 
        {/* AI Recommendations */}
        <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 rounded-2xl border border-purple-800/30 p-8 mb-8">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0"><svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
            <div className="flex-1 min-w-0"><h2 className="text-xl font-semibold">AI-Powered Recommendations</h2><p className="text-purple-300 text-sm">Actions to optimise revenue and demand</p></div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={generateAIRecommendations} disabled={loadingRecommendations} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-700/40 bg-purple-900/30 hover:bg-purple-800/40 hover:border-purple-600/60 text-purple-300 hover:text-white text-sm font-medium transition-all disabled:opacity-40">
                <svg className={`w-4 h-4 ${loadingRecommendations ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh Suggestions
              </button>
              {aiRecommendations.length > 3 && <button onClick={() => setShowAllSuggestions(p => !p)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showAllSuggestions ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} /></svg>{showAllSuggestions ? "Show Less" : `View All (${aiRecommendations.length})`}</button>}
            </div>
          </div>
          {loadingRecommendations ? (
            <div className="text-center py-10"><div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3" /><p className="text-purple-400 text-sm">Generating AI insights...</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {visibleRecommendations.map((rec, idx) => (
                <div key={idx} className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-xl border border-purple-700/30 p-6 flex flex-col gap-3">
                  <h3 className="text-white font-semibold text-sm">{rec.title}</h3>
                  <p className="text-purple-300 text-sm leading-relaxed flex-1">{rec.description}</p>
                  <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>{rec.impact}</div>
                  <ConfidenceBadge confidence={rec.confidence ?? 0.75} />
                  <button className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-all mt-1">{rec.actionLabel}</button>
                </div>
              ))}
            </div>
          )}
        </div>
 
        {/* RydraAI Chat */}
        <div id="rydra-ai" className="rounded-2xl border border-purple-700/40 mb-8 overflow-hidden" style={{ background: "linear-gradient(135deg, #0d0122 0%, #130828 50%, #0d0122 100%)" }}>
          <div className="border-b border-purple-800/40 px-8 py-5 bg-gradient-to-r from-purple-900/40 to-pink-900/20">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 flex-shrink-0"><svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
              <div><h2 className="text-xl font-semibold text-white">Ask RydraAI</h2><p className="text-purple-300 text-sm">Query your full customer database in plain English</p></div>
              <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full flex-shrink-0"><div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-green-400 text-xs font-medium">Live · {customers.length.toLocaleString()} customers</span></div>
            </div>
          </div>
          <div className="flex" style={{ height: "560px" }}>
            <div className="w-60 flex-shrink-0 border-r border-purple-800/30 p-4 flex flex-col gap-1.5 overflow-y-auto">
              <p className="text-xs font-semibold text-purple-500 uppercase tracking-wider mb-2 px-1">Try asking</p>
              {SUGGESTED_PROMPTS.map(p => <button key={p} onClick={() => sendChatMessage(p)} disabled={chatLoading} className="text-left text-xs text-purple-300 hover:text-white bg-purple-900/20 hover:bg-purple-800/40 border border-purple-800/30 hover:border-purple-600/50 rounded-xl px-3 py-2.5 transition-all leading-snug disabled:opacity-40">{p}</button>)}
              {chatMessages.length > 0 && <button onClick={() => setChatMessages([])} className="mt-auto text-xs text-purple-600 hover:text-purple-400 transition-colors px-1 py-2 text-left">Clear conversation</button>}
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-700/30 flex items-center justify-center"><svg className="w-8 h-8 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg></div>
                    <div><p className="text-white font-medium">RydraAI is ready</p><p className="text-purple-500 text-sm mt-1 max-w-xs">Full access to all {customers.length.toLocaleString()} records.</p></div>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1"><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-gradient-to-br from-purple-600 to-pink-600 rounded-tr-sm" : "bg-purple-900/50 border border-purple-700/40 rounded-tl-sm"}`}>{msg.role === "user" ? <p className="text-sm leading-relaxed text-white">{msg.content}</p> : formatMessage(msg.content)}</div>
                    {msg.role === "user" && <div className="w-7 h-7 rounded-lg bg-purple-700/50 flex items-center justify-center flex-shrink-0 mt-1"><svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>}
                  </div>
                ))}
                {chatLoading && <div className="flex gap-3 justify-start"><div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1"><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div><div className="bg-purple-900/50 border border-purple-700/40 rounded-2xl rounded-tl-sm px-4 py-3"><div className="flex gap-1.5 items-center h-5">{[0,150,300].map(d => <div key={d} className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div></div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-purple-800/30 p-4 bg-purple-950/30">
                <form onSubmit={e => { e.preventDefault(); sendChatMessage(chatInput); }} className="flex gap-2">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={chatLoading} placeholder="Ask about your customers..." className="flex-1 bg-purple-900/40 border border-purple-700/40 hover:border-purple-600/60 focus:border-purple-500 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm transition-colors" />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 rounded-xl px-4 py-2.5 transition-all flex items-center gap-2"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg><span className="text-white text-sm font-medium">Send</span></button>
                </form>
              </div>
            </div>
          </div>
        </div>
 
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6"><h3 className="text-base font-semibold mb-4 text-white">Risk Distribution</h3><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">{riskData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend /></PieChart></ResponsiveContainer></div>
          <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6"><h3 className="text-base font-semibold mb-4 text-white">Gap Ratio Distribution</h3><ResponsiveContainer width="100%" height={250}><BarChart data={gapData}><XAxis dataKey="range" stroke="#a78bfa" fontSize={12} /><YAxis stroke="#a78bfa" fontSize={12} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" fill="#a855f7" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></div>
          <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6"><h3 className="text-base font-semibold mb-4 text-white">Days Overdue Distribution</h3><ResponsiveContainer width="100%" height={250}><BarChart data={overdueData}><XAxis dataKey="range" stroke="#f59e0b" fontSize={12} /><YAxis stroke="#f59e0b" fontSize={12} /><Tooltip contentStyle={{ ...tooltipStyle, border: "1px solid #f59e0b" }} /><Bar dataKey="count" fill="#f59e0b" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></div>
        </div>
 
        {/* Segmentation */}
        <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 rounded-2xl border border-purple-800/30 p-8 mb-8">
          <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center"><svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg></div><div><h2 className="text-xl font-semibold">Customer Risk & Opportunity Segmentation</h2><p className="text-purple-300 text-sm">Predicted customer segments based on behavioural patterns</p></div></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-gradient-to-br from-red-950/60 to-red-900/30 rounded-xl border border-red-700/40 p-6"><div className="flex items-center gap-2 mb-4"><svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg><h3 className="text-white font-semibold">At Risk</h3></div><div className="text-5xl font-bold text-red-400 mb-2">{Math.round(stats.atRiskPct)}%</div><p className="text-red-300 text-sm mb-6">Churn Risk — Clients likely to leave without intervention</p><button className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 rounded-lg font-medium transition-all text-sm">Target Now</button></div>
            <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-xl border border-purple-600/40 p-6 relative"><div className="absolute top-4 right-4 px-2.5 py-1 bg-yellow-500 rounded-full text-xs font-bold text-yellow-950">High Value</div><div className="flex items-center gap-2 mb-4"><svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg><h3 className="text-white font-semibold">On the Fence</h3></div><div className="text-5xl font-bold text-purple-400 mb-2">{Math.round(stats.onFencePct)}%</div><p className="text-purple-300 text-sm mb-6">Conversion Opportunity — Close to rebooking but not converted</p><button className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-medium transition-all text-sm">Send Offer</button></div>
            <div className="bg-gradient-to-br from-blue-950/60 to-blue-900/30 rounded-xl border border-blue-700/40 p-6"><div className="flex items-center gap-2 mb-4"><svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg><h3 className="text-white font-semibold">Loyal Customers</h3></div><div className="text-5xl font-bold text-blue-400 mb-2">{Math.round(stats.loyalPct)}%</div><p className="text-blue-300 text-sm mb-6">Return Probability — High likelihood to rebook without incentives</p><button className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 rounded-lg font-medium transition-all text-sm">Do Not Discount</button></div>
          </div>
        </div>
 
        {/* Search & Filter */}
        <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-5 mb-5">
          <div className="flex flex-col md:flex-row gap-3">
            <input type="text" placeholder="Search clients by name, phone, or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
            <select value={filterSegment} onChange={e => setFilterSegment(e.target.value)} className="bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-sm"><option value="all">All Risk Segments</option><option value="Churned">Churned</option><option value="At Risk">At Risk</option><option value="Stable">Stable</option></select>
          </div>
          <div className="mt-3 text-xs text-purple-400">Showing {filteredCustomers.length.toLocaleString()} of {customers.length.toLocaleString()} clients{summary && <span className="ml-3">· Total ΔV: <span className="text-green-400 font-medium">${summary.total_intervention_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>}</div>
        </div>
 
        {/* Customer Table */}
        <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-purple-800/30 bg-purple-900/30">{["Client","Risk Level","Days Overdue","Visits","CLV","ΔV (SMS ROI)","Churn","Action"].map((h,i) => <th key={h} className={`px-6 py-4 text-xs font-semibold text-purple-300 uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}>{h === "ΔV (SMS ROI)" ? <span title="CLV × conversion lift − $0.08">{h} ⓘ</span> : h}</th>)}</tr></thead>
              <tbody>
                {paginatedCustomers.map(customer => {
                  const { label, cls } = getRiskBadge(customer.gap_ratio);
                  return (
                    <tr key={customer.score_id} className="border-b border-purple-800/20 hover:bg-purple-900/20 transition-colors">
                      <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-purple-800/60 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">{customer.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}</div><div><div className="text-white font-medium text-sm">{customer.name}</div><div className="text-xs text-purple-400 mt-0.5">{customer.phone || "No phone"}</div>{customer.email && <div className="text-xs text-purple-500">{customer.email}</div>}</div></div></td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{label}</span><span className={`text-sm font-medium ${getRiskColor(customer.gap_ratio)}`}>{customer.gap_ratio.toFixed(2)}x</span></div></td>
                      <td className="px-6 py-4 text-right"><div className="text-white font-medium text-sm">{customer.days_overdue}</div><div className="text-xs text-purple-500">days</div></td>
                      <td className="px-6 py-4 text-right"><div className="text-white font-medium text-sm">{customer.visits}</div><div className="text-xs text-purple-500">visits</div></td>
                      <td className="px-6 py-4 text-right"><div className="text-green-400 font-semibold text-sm">${customer.potential_value}</div></td>
                      <td className="px-6 py-4 text-right"><InterventionBadge value={customer.intervention_value} /></td>
                      <td className="px-6 py-4 text-right"><div className="text-white font-medium text-sm">{customer.churn_score ? (customer.churn_score * 10).toFixed(1) : "—"}</div><div className="text-xs text-purple-500">/10</div></td>
                      <td className="px-6 py-4 text-right"><button onClick={() => setSelectedCustomer(customer)} className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-semibold rounded-lg transition-all shadow-md shadow-purple-500/20 flex items-center gap-1.5 ml-auto"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>Send SMS</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredCustomers.length === 0 && <div className="text-center py-16 text-purple-500 text-sm">No clients found.</div>}
          {filteredCustomers.length > 0 && (
            <div className="border-t border-purple-800/30 bg-purple-900/20 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-purple-400">Showing {((currentPage-1)*itemsPerPage)+1}–{Math.min(currentPage*itemsPerPage,filteredCustomers.length)} of {filteredCustomers.length.toLocaleString()}</div>
                <div className="flex items-center gap-2">
                  <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="bg-purple-900/30 border border-purple-700/50 rounded-lg px-3 py-1.5 text-xs text-white cursor-pointer">{[25,50,100,250].map(n => <option key={n} value={n}>{n} / page</option>)}</select>
                  {[{label:"First",action:()=>setCurrentPage(1),disabled:currentPage===1},{label:"Prev",action:()=>setCurrentPage(p=>Math.max(1,p-1)),disabled:currentPage===1},{label:"Next",action:()=>setCurrentPage(p=>Math.min(totalPages,p+1)),disabled:currentPage===totalPages},{label:"Last",action:()=>setCurrentPage(totalPages),disabled:currentPage===totalPages}].map(({label,action,disabled})=><button key={label} onClick={action} disabled={disabled} className="px-3 py-1.5 rounded-lg bg-purple-900/30 border border-purple-700/50 text-white text-xs disabled:opacity-30 hover:bg-purple-800/40 transition-colors">{label}</button>)}
                  <div className="px-3 py-1.5 bg-purple-800/40 border border-purple-600/50 rounded-lg text-white text-xs font-medium">{currentPage} / {totalPages}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}