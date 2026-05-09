"use client";
import { useState, useEffect, useCallback } from "react";
 
const BG   = "bg-[#050810]";
const CARD  = "bg-[#0C1120]";
const BDR   = "border-[#162038]";
 
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/outreach",  label: "Outreach", active: true },
  { href: "/merchant/campaign",  label: "Campaign"  },
  { href: "/merchant/clients",   label: "Clients"   },
  { href: "/merchant/barber",    label: "Barbers"   },
];
 
const STATE_META: Record<string, { label: string; hex: string }> = {
  C:          { label: "First Timer", hex: "#38BDF8" },
  X:          { label: "Churned",     hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",     hex: "#FB923C" },
  R_on_fence: { label: "On Fence",    hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",       hex: "#34D399" },
};
 
const DAYS     = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_S    = ["M","T","W","T","F","S","S"];
const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
interface SmsMessage {
  id: string; source: string; source_label: string;
  customer_id: string; customer_name: string; customer_phone: string;
  message: string; status: string; markov_state: string;
  gap_ratio: number; days_overdue: number; message_cost: string;
  created_at: string; rule_name: string | null;
}
 
interface Rule {
  id: string; name: string; description: string;
  target_states: string[]; min_clv_cents: number;
  min_days_overdue: number; max_days_overdue: number;
  min_gap_ratio: number; cooldown_days: number; max_sends_per_run: number;
  message_template: string; send_time: string; send_days: string[];
  is_active: boolean; total_sent: number; total_rebooked: number;
  last_run_at: string | null;
  stats_7d?: { sent: number; rebooked: number; conversion_rate: number };
}
 
// ─── Shared NavBar ────────────────────────────────────────────────────────────
function NavBar() {
  return (
    <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(5,8,16,0.96)" }}>
      <div className="max-w-[1500px] mx-auto px-8 h-14 flex items-center gap-6">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div>
            <div className="text-sm font-semibold text-white leading-none">Outreach</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map(t => (
            <a key={t.href} href={t.href}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(t as any).active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>
              {t.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
 
// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [stats, setStats]       = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusF, setStatusF]   = useState("all");
  const [sourceF, setSourceF]   = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
 
  useEffect(() => {
    setLoading(true);
    fetch(`/api/outreach/history?venue_id=${VENUE_ID}`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages || []); setStats(d.stats || null); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);
 
  const filtered = messages.filter(m => {
    const q = search.toLowerCase();
    if (q && !m.customer_name?.toLowerCase().includes(q) && !m.customer_phone?.includes(q)) return false;
    if (statusF !== "all" && m.status !== statusF) return false;
    if (sourceF !== "all" && m.source !== sourceF) return false;
    return true;
  });
 
  function ago(s: string) {
    const diff = (Date.now() - new Date(s).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.round(diff/60)}m ago`;
    if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
    return new Date(s).toLocaleDateString("en-AU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
  }
 
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
 
  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { l: "Total Sent",  v: (stats?.total || 0),      acc: "#6366F1" },
          { l: "Delivered",   v: (stats?.delivered || 0),  acc: "#34D399" },
          { l: "Failed",      v: (stats?.failed || 0),     acc: stats?.failed > 0 ? "#F43F5E" : "#334155" },
          { l: "Manual",      v: (stats?.manual || 0),     acc: "#38BDF8" },
          { l: "Autopilot",   v: (stats?.autopilot || 0),  acc: "#A78BFA" },
        ].map(({ l, v, acc }) => (
          <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden`}>
            <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
            <div className="pl-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">{l}</div>
              <div className="text-2xl font-bold tracking-tight text-white">{v}</div>
            </div>
          </div>
        ))}
      </div>
 
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
          className="flex-1 min-w-48 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-600 border border-[#162038] focus:border-indigo-500/40 focus:outline-none" style={{ background: "#090D1A" }} />
        <div className="flex items-center gap-1 rounded-lg border border-[#162038] p-1" style={{ background: "#090D1A" }}>
          {[["all","All"],["delivered","Delivered"],["queued","Queued"],["failed","Failed"]].map(([v,l]) => (
            <button key={v} onClick={() => setStatusF(v)}
              className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${statusF===v?"bg-indigo-600 text-white":"text-slate-500 hover:text-white"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#162038] p-1" style={{ background: "#090D1A" }}>
          {[["all","All Sources"],["manual","Manual"],["autopilot","Autopilot"]].map(([v,l]) => (
            <button key={v} onClick={() => setSourceF(v)}
              className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${sourceF===v?"bg-indigo-600 text-white":"text-slate-500 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      </div>
 
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">{filtered.length.toLocaleString()} messages</div>
 
      {filtered.length === 0 ? (
        <div className={`${CARD} border ${BDR} rounded-xl p-12 text-center`}>
          <div className="text-3xl mb-3">📭</div>
          <div className="text-sm font-semibold text-white mb-1">{messages.length === 0 ? "No messages sent yet" : "No messages match filters"}</div>
          {messages.length === 0 && <div className="text-xs text-slate-600 mt-1">Messages appear here after sending from Clients, Campaign, or Autopilot</div>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const sm = STATE_META[m.markov_state] || null;
            const ok = ["delivered","queued","sent"].includes(m.status);
            const isExp = expanded === m.id;
            const isAuto = m.source === "autopilot";
            const initials = m.customer_name?.split(" ").map((n:string) => n[0]).slice(0,2).join("").toUpperCase() || "??";
            return (
              <div key={m.id}
                className={`${CARD} border rounded-xl overflow-hidden transition-all hover:border-[#1E2D4E] cursor-pointer`}
                style={{ borderColor: isExp ? "#1E2D4E" : "#162038" }}
                onClick={() => setExpanded(isExp ? null : m.id)}>
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0 border border-[#162038]" style={{ background: "#090D1A" }}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-white">{m.customer_name}</span>
                      {sm && <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${sm.hex}12`, color: sm.hex }}>{sm.label}</span>}
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: isAuto ? "rgba(167,139,250,0.12)" : "#162038", color: isAuto ? "#A78BFA" : "#64748B" }}>
                        {isAuto ? `⚡ ${m.source_label}` : "Manual"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{m.message}</div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end mb-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "#34D399" : "#F43F5E" }} />
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ok ? "#34D399" : "#F43F5E" }}>{m.status}</span>
                      </div>
                      <div className="text-[9px] text-slate-600">{ago(m.created_at)}</div>
                    </div>
                    <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform ${isExp?"rotate-180":""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {isExp && (
                  <div className="border-t border-[#162038] px-5 py-4 flex items-start gap-4" style={{ background: "#090D1A" }}>
                    <div className="flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Full Message</div>
                      <div className="rounded-lg p-3 border border-[#162038] text-sm text-slate-200 leading-relaxed" style={{ background: "#0C1120" }}>{m.message}</div>
                      <div className="flex gap-4 mt-2 text-[9px] text-slate-600">
                        {m.gap_ratio && <span>Gap {m.gap_ratio.toFixed(2)}×</span>}
                        {m.days_overdue && <span>{m.days_overdue}d overdue</span>}
                        {m.rule_name && <span>Rule: {m.rule_name}</span>}
                        <span>{m.customer_phone}</span>
                      </div>
                    </div>
                    {m.customer_id && (
                      <a href={`/merchant/clients/${m.customer_id}`} onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-[10px] font-semibold border hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                        style={{ background: "#090D1A", borderColor: "#1E2D4E", color: "#818CF8" }}>
                        View Client →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
 
// ─── Autopilot Tab ────────────────────────────────────────────────────────────
function AutopilotTab() {
  const [rules, setRules]           = useState<Rule[]>([]);
  const [stats, setStats]           = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | "new" | null>(null);
  const [form, setForm]             = useState<Partial<Rule>>({});
  const [saving, setSaving]         = useState(false);
  const [runningId, setRunningId]   = useState<string | null>(null);
  const [runResult, setRunResult]   = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
 
  // AI generator
  const [aiPrompt, setAiPrompt]     = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiPreview, setAiPreview]   = useState<Partial<Rule> | null>(null);
  const [aiError, setAiError]       = useState("");
 
  const BLANK: Partial<Rule> = {
    name:"", description:"", target_states:[],
    min_clv_cents:0, min_days_overdue:0, max_days_overdue:9999,
    min_gap_ratio:0, cooldown_days:21, max_sends_per_run:50,
    message_template:"", send_time:"10:00",
    send_days:["Monday","Tuesday","Wednesday","Thursday","Friday"],
    is_active:true,
  };
 
  const COND_FIELDS: {label:string;field:keyof Rule;divisor?:number;placeholder:string}[] = [
    {label:"Min CLV ($)",       field:"min_clv_cents",    divisor:100, placeholder:"0"},
    {label:"Min days overdue",  field:"min_days_overdue",              placeholder:"0"},
    {label:"Max days overdue",  field:"max_days_overdue",              placeholder:"9999"},
    {label:"Cooldown (days)",   field:"cooldown_days",                 placeholder:"21"},
    {label:"Min gap ratio",     field:"min_gap_ratio",                 placeholder:"0"},
    {label:"Max sends/run",     field:"max_sends_per_run",             placeholder:"50"},
  ];
 
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/automation/rules?venue_id=${VENUE_ID}`);
      const d = await r.json();
      setRules(d.rules || []);
      setStats(d.stats || null);
    } catch {} finally { setLoading(false); }
  }, []);
 
  useEffect(() => { load(); }, [load]);
 
  const toggleState = (s:string) => setForm(f => {
    const cur = f.target_states || [];
    return { ...f, target_states: cur.includes(s) ? cur.filter(x=>x!==s) : [...cur,s] };
  });
  const toggleDay = (d:string) => setForm(f => {
    const cur = f.send_days || [];
    return { ...f, send_days: cur.includes(d) ? cur.filter(x=>x!==d) : [...cur,d] };
  });
 
  function startEdit(rule:Rule) { setEditingId(rule.id); setForm({...rule}); setAiPreview(null); }
  function startNew()           { setEditingId("new");   setForm({...BLANK}); setAiPreview(null); }
  function cancelEdit()         { setEditingId(null);    setForm({}); }
 
  async function save() {
    if (!form.name || !form.message_template || !(form.target_states||[]).length) return;
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/automation/rules" : `/api/automation/rules/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({...form, venue_id:VENUE_ID}),
      });
      if (res.ok) { setEditingId(null); setForm({}); load(); }
    } catch {} finally { setSaving(false); }
  }
 
  async function toggleActive(rule:Rule) {
    await fetch(`/api/automation/rules/${rule.id}`, {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:!rule.is_active})});
    load();
  }
 
  async function deleteRule(id:string) {
    await fetch(`/api/automation/rules/${id}`,{method:"DELETE"});
    setDeleteConfirm(null);
    if (editingId===id) { setEditingId(null); setForm({}); }
    load();
  }
 
  async function runRule(rule:Rule, dryRun:boolean) {
    const key = rule.id+(dryRun?"-dry":"");
    setRunningId(key); setRunResult(null);
    try {
      const r = await fetch("/api/cron/interventions",{method:"POST",headers:{"Content-Type":"application/json","x-cron-secret":"rydra-dev"},body:JSON.stringify({venue_id:VENUE_ID,rule_id:rule.id,dry_run:dryRun})});
      const d = await r.json();
      setRunResult({...d,rule_id:rule.id,is_dry:dryRun});
      load();
    } catch {} finally { setRunningId(null); }
  }
 
  async function generateMsgForForm() {
    if (!(form.target_states||[]).length) return;
    setGenLoading(true);
    try {
      const r = await fetch("/api/ai/campaign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({segment:(form.target_states||[]).map(s=>STATE_META[s]?.label||s).join(", "),markov_state:(form.target_states||[])[0],audience_size:50,avg_clv:Math.round((form.min_clv_cents||5000)/100),avg_days_overdue:form.min_days_overdue||30,campaign_goal:form.name||"Re-engage and rebook"})});
      const d = await r.json();
      setForm(f=>({...f,message_template:d.message||f.message_template}));
    } catch {} finally { setGenLoading(false); }
  }
 
  // AI rule generator
  async function generateRule() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setAiError(""); setAiPreview(null);
    try {
      const r = await fetch("/api/ai/generate-rule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:aiPrompt})});
      const d = await r.json();
      if (d.error) { setAiError(d.error); } else { setAiPreview(d.rule); }
    } catch (e:any) { setAiError(e.message); } finally { setAiLoading(false); }
  }
 
  async function createFromPreview() {
    if (!aiPreview) return;
    setSaving(true);
    try {
      const r = await fetch("/api/automation/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...aiPreview,venue_id:VENUE_ID})});
      if (r.ok) { setAiPreview(null); setAiPrompt(""); load(); }
    } catch {} finally { setSaving(false); }
  }
 
  function usePreviewAsTemplate() {
    if (!aiPreview) return;
    setForm({...BLANK,...aiPreview});
    setEditingId("new");
    setAiPreview(null);
    setAiPrompt("");
  }
 
  const charCount = (form.message_template||"").length;
 
  const AI_EXAMPLES = [
    "Message at-risk clients who haven't visited in 3-6 weeks",
    "Win back churned clients worth over $200 on Sunday evenings",
    "Rebook first-timers between day 35-45 of no return",
    "Gentle nudge for on-fence clients every 2 weeks",
    "Re-engage loyal clients who've been away over 60 days",
  ];
 
  function EditForm({ isNew=false }:{isNew?:boolean}) {
    return (
      <div className="border-t border-[#162038] p-5 space-y-4" style={{background:"#090D1A"}}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Rule Name *</div>
            <input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. At Risk Recovery"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-[#162038] focus:border-indigo-500/40 focus:outline-none" style={{background:"#0C1120"}} />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Description</div>
            <input value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What this rule does..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 border border-[#162038] focus:border-indigo-500/40 focus:outline-none" style={{background:"#0C1120"}} />
          </div>
        </div>
 
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Target States *</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATE_META).map(([key,{label,hex}])=>{
              const active=(form.target_states||[]).includes(key);
              return <button key={key} onClick={()=>toggleState(key)} className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
                style={{background:active?`${hex}15`:"#0C1120",borderColor:active?`${hex}45`:"#162038",color:active?hex:"#64748B"}}>{label}</button>;
            })}
          </div>
        </div>
 
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Conditions</div>
          <div className="grid grid-cols-3 gap-2">
            {COND_FIELDS.map(({label,field,divisor,placeholder})=>{
              const raw=(form[field] as number)||0;
              const display=divisor?raw/divisor:raw;
              return <div key={field}>
                <div className="text-[9px] text-slate-600 mb-1">{label}</div>
                <input type="number" placeholder={placeholder} value={display||""}
                  onChange={e=>{const n=e.target.value===""?0:Number(e.target.value);setForm(f=>({...f,[field]:divisor?Math.round(n*divisor):n}));}}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white border border-[#162038] focus:border-indigo-500/40 focus:outline-none" style={{background:"#0C1120"}} />;
              </div>;
            })}
          </div>
        </div>
 
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Message Template *</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-700">[NAME] [BARBER]</span>
              <span className={`text-[9px] font-mono font-bold ${charCount>160?"text-rose-400":"text-slate-600"}`}>{charCount}/160</span>
            </div>
          </div>
          <textarea value={form.message_template||""} onChange={e=>setForm(f=>({...f,message_template:e.target.value}))} rows={2} maxLength={320}
            placeholder="Hey [NAME], the team at Alkami here — it's been a while. Reply YES to book in with [BARBER] this week."
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 border border-[#162038] focus:border-indigo-500/40 focus:outline-none resize-none leading-relaxed" style={{background:"#0C1120"}} />
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-0.5 rounded-full" style={{background:"#162038"}}>
              <div className="h-full rounded-full transition-all" style={{width:`${Math.min((charCount/160)*100,100)}%`,background:charCount>160?"#F43F5E":"#6366F1"}} />
            </div>
            <button onClick={generateMsgForForm} disabled={genLoading||!(form.target_states||[]).length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border transition-all"
              style={{background:"#0C1120",borderColor:"#1E2D4E",color:"#818CF8"}}>
              {genLoading?<><div className="w-2.5 h-2.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"/>Generating...</>:"✦ AI Write"}
            </button>
          </div>
        </div>
 
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Send Days</div>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day,i)=>{
                const active=(form.send_days||[]).includes(day);
                return <button key={day} onClick={()=>toggleDay(day)} title={day}
                  className="py-2 rounded-lg text-[9px] font-bold uppercase transition-all border"
                  style={{background:active?"rgba(99,102,241,0.2)":"#0C1120",borderColor:active?"rgba(99,102,241,0.5)":"#162038",color:active?"#A5B4FC":"#475569"}}>
                  {DAY_S[i]}
                </button>;
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Send Time (AEST)</div>
              <input type="time" value={form.send_time||"10:00"} onChange={e=>setForm(f=>({...f,send_time:e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm text-white border border-[#162038] focus:border-indigo-500/40 focus:outline-none" style={{background:"#0C1120"}} />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">Status</div>
              <button onClick={()=>setForm(f=>({...f,is_active:!f.is_active}))}
                className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
                style={{background:form.is_active?"rgba(52,211,153,0.1)":"#0C1120",borderColor:form.is_active?"rgba(52,211,153,0.35)":"#162038",color:form.is_active?"#34D399":"#64748B"}}>
                {form.is_active?"Active":"Inactive"}
              </button>
            </div>
          </div>
        </div>
 
        <div className="flex gap-2 pt-1 border-t border-[#162038]">
          <button onClick={cancelEdit} className="px-4 py-2.5 rounded-lg border border-[#162038] text-slate-400 text-sm hover:text-white transition-all" style={{background:"#0C1120"}}>Cancel</button>
          <button onClick={save} disabled={saving||!form.name||!form.message_template||!(form.target_states||[]).length}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{background:"#4F46E5"}}>
            {saving?"Saving...":isNew?"Create Rule":"Save Changes"}
          </button>
        </div>
      </div>
    );
  }
 
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>;
 
  return (
    <div className="space-y-6">
 
      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            {l:"Active Rules",      v:stats.active_rules,                                                                         acc:"#6366F1"},
            {l:"Sent (30d)",        v:(stats.sent_30d||0).toLocaleString(),                                                       acc:"#34D399"},
            {l:"Rebooked (30d)",    v:(stats.rebooked_30d||0).toLocaleString(),                                                   acc:"#FBBF24"},
            {l:"Revenue Recovered", v:`$${(stats.revenue_30d||0).toLocaleString(undefined,{maximumFractionDigits:0})}`,          acc:"#34D399"},
          ].map(({l,v,acc})=>(
            <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden`}>
              <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{background:acc}} />
              <div className="pl-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">{l}</div>
                <div className="text-2xl font-bold tracking-tight text-white">{v}</div>
              </div>
            </div>
          ))}
        </div>
      )}
 
      {/* ── How it works ── */}
      <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">How Autopilot works</div>
        <div className="grid grid-cols-5 gap-4">
          {[
            {n:"1",t:"Nightly check",        d:"Runs every night at 9am AEST. Evaluates every client against every active rule."},
            {n:"2",t:"State matching",       d:"Filters by Markov state, CLV threshold, days overdue, and gap ratio."},
            {n:"3",t:"Cooldown check",       d:"Skips anyone contacted recently. No client is ever spammed by any rule."},
            {n:"4",t:"AI writes each SMS",   d:"GPT-4o-mini writes a unique message per client based on their individual data — never a template verbatim."},
            {n:"5",t:"Send + log",           d:"Fires via ClickSend. Every send logged with full attribution tracking for the Revenue Recovery Report."},
          ].map(({n,t,d})=>(
            <div key={n} className="flex flex-col gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-indigo-400"
                style={{background:"rgba(99,102,241,0.12)",border:"1px solid rgba(99,102,241,0.25)"}}>
                {n}
              </div>
              <div className="text-xs font-semibold text-white">{t}</div>
              <div className="text-[10px] text-slate-500 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
      </div>
 
      {/* ── AI Rule Generator ── */}
      <div className="rounded-xl overflow-hidden border" style={{background:"linear-gradient(135deg,rgba(79,70,229,0.08),rgba(99,102,241,0.04))",borderColor:"rgba(99,102,241,0.25)"}}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">AI Rule Generator</div>
              <div className="text-[10px] text-indigo-300/70">Describe any rule in plain English — AI builds the complete configuration</div>
            </div>
          </div>
 
          {/* Example prompts */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {AI_EXAMPLES.map(ex=>(
              <button key={ex} onClick={()=>setAiPrompt(ex)}
                className="text-[9px] text-indigo-300/70 hover:text-indigo-200 border px-2.5 py-1 rounded-lg transition-all hover:border-indigo-500/40"
                style={{background:"rgba(99,102,241,0.06)",borderColor:"rgba(99,102,241,0.18)"}}>
                {ex}
              </button>
            ))}
          </div>
 
          <div className="flex gap-2">
            <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!aiLoading)generateRule();}}
              placeholder="e.g. Contact churned clients worth over $200 who haven't visited in 3+ months, every Sunday evening..."
              className="flex-1 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 border focus:outline-none transition-all"
              style={{background:"rgba(9,13,26,0.8)",borderColor:"rgba(99,102,241,0.25)"}} />
            <button onClick={generateRule} disabled={aiLoading||!aiPrompt.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all flex-shrink-0"
              style={{background:"#4F46E5",boxShadow:"0 2px 16px rgba(99,102,241,0.3)"}}>
              {aiLoading?<><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin"/>Building...</>:<>✦ Generate Rule</>}
            </button>
          </div>
 
          {aiError && (
            <div className="mt-2 text-[10px] text-rose-400 px-1">{aiError}</div>
          )}
        </div>
 
        {/* AI preview */}
        {aiPreview && (
          <div className="border-t px-5 py-4" style={{borderColor:"rgba(99,102,241,0.2)",background:"rgba(5,8,16,0.6)"}}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 mb-3">Generated Rule Preview</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[9px] text-slate-600 mb-0.5">Name</div>
                <div className="text-sm font-semibold text-white">{aiPreview.name}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-600 mb-0.5">Description</div>
                <div className="text-xs text-slate-300">{aiPreview.description}</div>
              </div>
            </div>
 
            <div className="flex gap-2 flex-wrap mb-3">
              {(aiPreview.target_states||[]).map(s=>{
                const sm=STATE_META[s]; if(!sm) return null;
                return <span key={s} className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{background:`${sm.hex}15`,color:sm.hex}}>{sm.label}</span>;
              })}
              {[
                aiPreview.min_clv_cents && aiPreview.min_clv_cents>0 && `CLV > $${(aiPreview.min_clv_cents||0)/100}`,
                aiPreview.min_days_overdue && `${aiPreview.min_days_overdue}+ days overdue`,
                aiPreview.max_days_overdue && aiPreview.max_days_overdue<9999 && `max ${aiPreview.max_days_overdue}d`,
                `cooldown ${aiPreview.cooldown_days}d`,
                `${aiPreview.send_time} AEST`,
              ].filter(Boolean).map((t,i)=>(
                <span key={i} className="text-[9px] text-slate-500 border px-2 py-0.5 rounded" style={{background:"#090D1A",borderColor:"#162038"}}>{t as string}</span>
              ))}
            </div>
 
            <div className="rounded-lg px-3 py-2.5 border mb-4 text-sm text-slate-300 leading-relaxed italic" style={{background:"#090D1A",borderColor:"#162038"}}>
              "{aiPreview.message_template}"
            </div>
 
            <div className="flex gap-2">
              <button onClick={()=>{setAiPreview(null);setAiPrompt("");}} className="px-4 py-2 rounded-lg border border-[#162038] text-slate-400 text-sm hover:text-white transition-all" style={{background:"#090D1A"}}>Discard</button>
              <button onClick={usePreviewAsTemplate} className="px-4 py-2 rounded-lg border text-sm font-medium transition-all" style={{background:"rgba(99,102,241,0.1)",borderColor:"rgba(99,102,241,0.3)",color:"#818CF8"}}>Edit first →</button>
              <button onClick={createFromPreview} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{background:"#4F46E5"}}>
                {saving?"Creating...":"✓ Create This Rule"}
              </button>
            </div>
          </div>
        )}
      </div>
 
      {/* ── Run result ── */}
      {runResult && (
        <div className="rounded-xl border px-5 py-3.5 flex items-center gap-3"
          style={{background:runResult.is_dry?"rgba(99,102,241,0.06)":"rgba(52,211,153,0.06)",borderColor:runResult.is_dry?"rgba(99,102,241,0.25)":"rgba(52,211,153,0.25)"}}>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:runResult.is_dry?"#818CF8":"#34D399"}} />
          <div className="flex-1 text-sm" style={{color:runResult.is_dry?"#A5B4FC":"#6EE7B7"}}>
            {runResult.is_dry
              ? `Dry run — ${(runResult.results?.[0]?.matched||0).toLocaleString()} clients currently match, ${(runResult.results?.[0]?.targeted||0)} would be contacted`
              : `Done — ${(runResult.total_sent||0).toLocaleString()} messages sent`}
          </div>
          <button onClick={()=>setRunResult(null)} className="text-slate-600 hover:text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
 
      {/* ── Rules header ── */}
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
          {rules.length} rule{rules.length!==1?"s":""} — evaluates nightly at 9am AEST
        </div>
        {editingId!=="new" && (
          <button onClick={startNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
            style={{background:"#4F46E5",boxShadow:"0 2px 12px rgba(99,102,241,0.25)"}}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Rule
          </button>
        )}
      </div>
 
      {/* ── New rule card ── */}
      {editingId==="new" && (
        <div className={`${CARD} border border-indigo-500/30 rounded-xl overflow-hidden`}>
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="w-2 h-2 rounded-full bg-indigo-400" style={{boxShadow:"0 0 6px rgba(99,102,241,0.6)"}} />
            <span className="text-sm font-semibold text-white">New Rule</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 px-2 py-0.5 rounded" style={{background:"rgba(99,102,241,0.12)"}}>Editing</span>
          </div>
          <EditForm isNew />
        </div>
      )}
 
      {/* ── Rules list ── */}
      {rules.length===0 && editingId!=="new" ? (
        <div className={`${CARD} border ${BDR} rounded-xl p-10 text-center`}>
          <div className="text-3xl mb-3">⚡</div>
          <div className="text-sm font-semibold text-white mb-1">No rules yet</div>
          <div className="text-xs text-slate-600 mb-4 max-w-xs mx-auto">Use the AI generator above or create a rule manually.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule=>{
            const isEditing=editingId===rule.id;
            const isRunning=runningId===rule.id||runningId===rule.id+"-dry";
            const s7=rule.stats_7d||{sent:0,rebooked:0,conversion_rate:0};
            const convPct=s7.conversion_rate*100;
            return (
              <div key={rule.id} className={`${CARD} border rounded-xl overflow-hidden transition-all`}
                style={{borderColor:isEditing?"#4F46E5":rule.is_active?"#1E2D4E":"#162038"}}>
                <div className="flex items-start gap-3 px-5 py-4">
                  <div className="flex-shrink-0 pt-1.5">
                    <div className="w-2 h-2 rounded-full cursor-pointer transition-all" title="Click to toggle"
                      onClick={()=>toggleActive(rule)}
                      style={{background:rule.is_active?"#34D399":"#334155",boxShadow:rule.is_active?"0 0 6px rgba(52,211,153,0.5)":"none"}} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-white">{rule.name}</span>
                      {rule.target_states.map(s=>{const sm=STATE_META[s];if(!sm)return null;return<span key={s} className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{background:`${sm.hex}12`,color:sm.hex}}>{sm.label}</span>;})}
                      {!rule.is_active&&<span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{background:"#162038",color:"#64748B"}}>Paused</span>}
                    </div>
                    {rule.description&&<div className="text-[10px] text-slate-500 mb-2">{rule.description}</div>}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {[
                        rule.min_clv_cents>0&&`CLV > $${rule.min_clv_cents/100}`,
                        rule.min_days_overdue>0&&`${rule.min_days_overdue}+ days`,
                        rule.max_days_overdue<9999&&`max ${rule.max_days_overdue}d`,
                        `cooldown ${rule.cooldown_days}d`,
                        `max ${rule.max_sends_per_run}/run`,
                      ].filter(Boolean).map((tag,i)=>(
                        <span key={i} className="text-[9px] text-slate-600 border px-2 py-0.5 rounded" style={{background:"#090D1A",borderColor:"#162038"}}>{tag as string}</span>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500 italic truncate mb-2">"{rule.message_template}"</div>
                    <div className="flex items-center gap-4 text-[9px]">
                      <span className="text-slate-600">7d sent <span className="text-white font-semibold">{s7.sent}</span></span>
                      <span className="text-slate-600">rebooked <span className="text-emerald-400 font-semibold">{s7.rebooked}</span></span>
                      {s7.sent>0&&<span className="text-slate-600">conv <span className="font-semibold" style={{color:convPct>=25?"#34D399":convPct>=12?"#FBBF24":"#F43F5E"}}>{convPct.toFixed(0)}%</span></span>}
                      <span className="text-slate-600">all-time <span className="text-white font-semibold">{rule.total_sent}</span></span>
                      {rule.last_run_at&&<span className="text-slate-700">last {new Date(rule.last_run_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0 min-w-[90px]">
                    <button onClick={()=>toggleActive(rule)} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border"
                      style={{background:rule.is_active?"rgba(52,211,153,0.08)":"#090D1A",borderColor:rule.is_active?"rgba(52,211,153,0.3)":"#162038",color:rule.is_active?"#34D399":"#64748B"}}>
                      {rule.is_active?"Active":"Inactive"}
                    </button>
                    <button onClick={()=>runRule(rule,false)} disabled={isRunning} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center justify-center gap-1 transition-all"
                      style={{background:"#090D1A",borderColor:"#1E2D4E",color:"#818CF8"}}>
                      {runningId===rule.id?<><div className="w-2.5 h-2.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"/>Running</>:"Run Now"}
                    </button>
                    <button onClick={()=>runRule(rule,true)} disabled={isRunning} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center justify-center gap-1 transition-all"
                      style={{background:"#090D1A",borderColor:"#162038",color:"#475569"}}>
                      {runningId===rule.id+"-dry"?<><div className="w-2.5 h-2.5 border border-slate-500/30 border-t-slate-400 rounded-full animate-spin"/>Sim...</>:"Dry Run"}
                    </button>
                    <button onClick={()=>isEditing?cancelEdit():startEdit(rule)} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all"
                      style={{background:isEditing?"rgba(99,102,241,0.1)":"#090D1A",borderColor:isEditing?"rgba(99,102,241,0.4)":"#162038",color:isEditing?"#818CF8":"#475569"}}>
                      {isEditing?"Close":"Edit"}
                    </button>
                    {deleteConfirm===rule.id?(
                      <div className="flex gap-1">
                        <button onClick={()=>deleteRule(rule.id)} className="flex-1 px-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all"
                          style={{background:"#090D1A",borderColor:"rgba(244,63,94,0.35)",color:"#F43F5E"}}>Confirm</button>
                        <button onClick={()=>setDeleteConfirm(null)} className="px-2 py-1.5 rounded-lg text-[9px] border"
                          style={{background:"#090D1A",borderColor:"#162038",color:"#64748B"}}>✕</button>
                      </div>
                    ):(
                      <button onClick={()=>setDeleteConfirm(rule.id)} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all hover:border-rose-500/30 hover:text-rose-400"
                        style={{background:"#090D1A",borderColor:"#162038",color:"#475569"}}>Delete</button>
                    )}
                  </div>
                </div>
 
                {/* Day strip */}
                <div className="grid grid-cols-7 border-t" style={{background:"#090D1A",borderColor:"#0F1529"}}>
                  {DAYS.map((day,i)=>{
                    const active=rule.send_days.includes(day);
                    return <div key={day} className="py-1.5 text-center text-[8px] font-bold uppercase border-r border-[#0F1529] last:border-r-0"
                      style={{background:active?"rgba(99,102,241,0.1)":"transparent",color:active?"#818CF8":"#1E293B"}} title={day}>
                      {DAY_S[i]}
                    </div>;
                  })}
                </div>
                <div className="px-5 py-1.5 border-t flex items-center justify-between" style={{background:"#090D1A",borderColor:"#0F1529"}}>
                  <div className="text-[9px] text-slate-700">{rule.send_days.length===7?"Every day":rule.send_days.length===5&&!rule.send_days.includes("Saturday")?"Weekdays":rule.send_days.slice(0,3).join(", ")+(rule.send_days.length>3?` +${rule.send_days.length-3}`:"")}</div>
                  <div className="text-[9px] text-slate-700">{rule.send_time} AEST</div>
                </div>
 
                {isEditing&&<EditForm/>}
              </div>
            );
          })}
        </div>
      )}
 
      {/* Cron reminder */}
      <div className={`rounded-xl border ${BDR} px-5 py-4 flex items-start gap-3`} style={{background:"#090D1A"}}>
        <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Vercel Cron — required for nightly automation</div>
          <div className="font-mono text-[10px] text-emerald-400 rounded px-2 py-1 border border-[#162038] inline-block" style={{background:"#0C1120"}}>
            {'"crons": [{ "path": "/api/cron/interventions", "schedule": "0 23 * * *" }]'}
          </div>
          <div className="text-[9px] text-slate-700 mt-1">23:00 UTC = 9am AEST · Set <code className="text-amber-400">CRON_SECRET</code> in Vercel env vars</div>
        </div>
      </div>
    </div>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OutreachPage() {
  const [tab, setTab] = useState<"history"|"autopilot">("history");
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      <NavBar />
      <div className="max-w-[1500px] mx-auto px-8 py-8">
        <div className="mb-6">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Canberra</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Outreach</h1>
        </div>
        <div className="flex gap-1 mb-6 border-b border-[#162038]">
          <button onClick={()=>setTab("history")}
            className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${tab==="history"?"border-indigo-500 text-indigo-400":"border-transparent text-slate-600 hover:text-slate-300"}`}>
            History
          </button>
          <button onClick={()=>setTab("autopilot")}
            className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-2 ${tab==="autopilot"?"border-indigo-500 text-indigo-400":"border-transparent text-slate-600 hover:text-slate-300"}`}>
            Autopilot
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{background:"rgba(99,102,241,0.15)",color:"#818CF8"}}>AUTO</span>
          </button>
        </div>
        {tab==="history" ? <HistoryTab /> : <AutopilotTab />}
      </div>
    </div>
  );
}