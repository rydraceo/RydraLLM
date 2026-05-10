"use client";
import { useState, useEffect, useCallback } from "react";
 
// ─── Royal Intelligence Tokens ────────────────────────────────────────────────
const BG    = "bg-[#0A0612]";
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const BDR   = "border-[#2A1852]";
const GOLD  = "#D4A017";
const GOLD2 = "#C9973A";
const PUR   = "#5B21B6";
const PUR_L = "#7C3AED";
const PUR_LL = "#A78BFA";
const MUT   = "#6B5C8A";
const NAV_BG = "rgba(10,6,18,0.97)";
const SURF  = "#0F0A1E";
const CARD_S = "#130C24";
 
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
 
const DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_S = ["M","T","W","T","F","S","S"];
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
 
function RydraLogo() {
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}>
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    </div>
  );
}
 
function NavBar() {
  return (
    <div className="border-b backdrop-blur-xl sticky top-0 z-30" style={{ background: NAV_BG, borderColor: "#2A1852" }}>
      <div className="max-w-[1500px] mx-auto px-8 h-14 flex items-center gap-6">
        <div className="flex items-center gap-3 flex-shrink-0">
          <RydraLogo />
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: MUT }}>Rydra</div>
            <div className="text-sm font-semibold text-white leading-none">Outreach</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map(t => (
            <a key={t.href} href={t.href}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={(t as any).active ? { background: PUR, color: "#fff" } : { color: PUR_LL }}>
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
 
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border rounded-full animate-spin" style={{ borderColor: "rgba(91,33,182,0.2)", borderTopColor: PUR_L }} /></div>;
 
  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { l: "Total Sent",  v: (stats?.total || 0),     acc: PUR_L },
          { l: "Delivered",   v: (stats?.delivered || 0), acc: "#34D399" },
          { l: "Failed",      v: (stats?.failed || 0),    acc: stats?.failed > 0 ? "#F43F5E" : "#2A1852" },
          { l: "Manual",      v: (stats?.manual || 0),    acc: "#38BDF8" },
          { l: "Autopilot",   v: (stats?.autopilot || 0), acc: GOLD },
        ].map(({ l, v, acc }) => (
          <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden`}>
            <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
            <div className="pl-3">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>{l}</div>
              <div className="text-2xl font-bold tracking-tight text-white">{v}</div>
            </div>
          </div>
        ))}
      </div>
 
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
          className="flex-1 min-w-48 rounded-lg px-4 py-2 text-sm text-white placeholder-[#6B5C8A] focus:outline-none"
          style={{ background: SURF, border: "1px solid #2A1852" }} />
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ background: SURF, borderColor: "#2A1852" }}>
          {[["all","All"],["delivered","Delivered"],["queued","Queued"],["failed","Failed"]].map(([v,l]) => (
            <button key={v} onClick={() => setStatusF(v)}
              className="px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all"
              style={statusF===v ? { background: PUR, color: "#fff" } : { color: PUR_LL }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ background: SURF, borderColor: "#2A1852" }}>
          {[["all","All Sources"],["manual","Manual"],["autopilot","Autopilot"]].map(([v,l]) => (
            <button key={v} onClick={() => setSourceF(v)}
              className="px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all"
              style={sourceF===v ? { background: PUR, color: "#fff" } : { color: PUR_LL }}>
              {l}
            </button>
          ))}
        </div>
      </div>
 
      <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: MUT }}>{filtered.length.toLocaleString()} messages</div>
 
      {filtered.length === 0 ? (
        <div className={`${CARD} border ${BDR} rounded-xl p-12 text-center`}>
          <div className="text-3xl mb-3">📭</div>
          <div className="text-sm font-semibold text-white mb-1">{messages.length === 0 ? "No messages sent yet" : "No messages match filters"}</div>
          {messages.length === 0 && <div className="text-xs mt-1" style={{ color: MUT }}>Messages appear here after sending from Clients, Campaign, or Autopilot</div>}
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
                className={`${CARD} border rounded-xl overflow-hidden transition-all cursor-pointer`}
                style={{ borderColor: isExp ? "#3A2268" : "#2A1852" }}
                onClick={() => setExpanded(isExp ? null : m.id)}>
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 border" style={{ background: SURF, borderColor: "#2A1852", color: PUR_LL }}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-white">{m.customer_name}</span>
                      {sm && <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${sm.hex}12`, color: sm.hex }}>{sm.label}</span>}
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: isAuto ? "rgba(212,160,23,0.12)" : "#2A1852", color: isAuto ? GOLD : MUT }}>
                        {isAuto ? `⚡ ${m.source_label}` : "Manual"}
                      </span>
                    </div>
                    <div className="text-[11px] truncate" style={{ color: MUT }}>{m.message}</div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end mb-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? "#34D399" : "#F43F5E" }} />
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ok ? "#34D399" : "#F43F5E" }}>{m.status}</span>
                      </div>
                      <div className="text-[9px]" style={{ color: MUT }}>{ago(m.created_at)}</div>
                    </div>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isExp?"rotate-180":""}`} style={{ color: MUT }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {isExp && (
                  <div className="border-t px-5 py-4 flex items-start gap-4" style={{ background: SURF, borderColor: "#2A1852" }}>
                    <div className="flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD2 }}>Full Message</div>
                      <div className="rounded-lg p-3 border text-sm leading-relaxed" style={{ background: CARD_S, borderColor: "#2A1852", color: "#C4B5FD" }}>{m.message}</div>
                      <div className="flex gap-4 mt-2 text-[9px]" style={{ color: MUT }}>
                        {m.gap_ratio && <span>Gap {m.gap_ratio.toFixed(2)}×</span>}
                        {m.days_overdue && <span>{m.days_overdue}d overdue</span>}
                        {m.rule_name && <span>Rule: {m.rule_name}</span>}
                        <span>{m.customer_phone}</span>
                      </div>
                    </div>
                    {m.customer_id && (
                      <a href={`/merchant/clients/${m.customer_id}`} onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
                        style={{ background: SURF, borderColor: "#3A2268", color: PUR_LL }}
                        onMouseOver={e => { (e.target as HTMLElement).style.background = PUR; (e.target as HTMLElement).style.color = "#fff"; }}
                        onMouseOut={e => { (e.target as HTMLElement).style.background = SURF; (e.target as HTMLElement).style.color = PUR_LL; }}>
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
  const [aiPrompt, setAiPrompt]     = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiPreview, setAiPreview]   = useState<Partial<Rule> | null>(null);
  const [aiError, setAiError]       = useState("");
 
  const BLANK: Partial<Rule> = { name:"", description:"", target_states:[], min_clv_cents:0, min_days_overdue:0, max_days_overdue:9999, min_gap_ratio:0, cooldown_days:21, max_sends_per_run:50, message_template:"", send_time:"10:00", send_days:["Monday","Tuesday","Wednesday","Thursday","Friday"], is_active:true };
  const COND_FIELDS: {label:string;field:keyof Rule;divisor?:number;placeholder:string}[] = [
    {label:"Min CLV ($)",field:"min_clv_cents",divisor:100,placeholder:"0"},
    {label:"Min days overdue",field:"min_days_overdue",placeholder:"0"},
    {label:"Max days overdue",field:"max_days_overdue",placeholder:"9999"},
    {label:"Cooldown (days)",field:"cooldown_days",placeholder:"21"},
    {label:"Min gap ratio",field:"min_gap_ratio",placeholder:"0"},
    {label:"Max sends/run",field:"max_sends_per_run",placeholder:"50"},
  ];
 
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/automation/rules?venue_id=${VENUE_ID}`); const d = await r.json(); setRules(d.rules || []); setStats(d.stats || null); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
 
  const toggleState = (s:string) => setForm(f => { const cur=f.target_states||[]; return {...f,target_states:cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]}; });
  const toggleDay   = (d:string) => setForm(f => { const cur=f.send_days||[]; return {...f,send_days:cur.includes(d)?cur.filter(x=>x!==d):[...cur,d]}; });
  function startEdit(r:Rule) { setEditingId(r.id); setForm({...r}); setAiPreview(null); }
  function startNew()        { setEditingId("new"); setForm({...BLANK}); setAiPreview(null); }
  function cancelEdit()      { setEditingId(null); setForm({}); }
 
  async function save() {
    if (!form.name||!form.message_template||!(form.target_states||[]).length) return;
    setSaving(true);
    try { const isNew=editingId==="new"; const res=await fetch(isNew?"/api/automation/rules":`/api/automation/rules/${editingId}`,{method:isNew?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,venue_id:VENUE_ID})}); if(res.ok){setEditingId(null);setForm({});load();} }
    catch {} finally { setSaving(false); }
  }
  async function toggleActive(rule:Rule) { await fetch(`/api/automation/rules/${rule.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:!rule.is_active})}); load(); }
  async function deleteRule(id:string) { await fetch(`/api/automation/rules/${id}`,{method:"DELETE"}); setDeleteConfirm(null); if(editingId===id){setEditingId(null);setForm({});} load(); }
  async function runRule(rule:Rule,dryRun:boolean) {
    const key=rule.id+(dryRun?"-dry":""); setRunningId(key); setRunResult(null);
    try { const r=await fetch("/api/cron/interventions",{method:"POST",headers:{"Content-Type":"application/json","x-cron-secret":"rydra-dev"},body:JSON.stringify({venue_id:VENUE_ID,rule_id:rule.id,dry_run:dryRun})}); const d=await r.json(); setRunResult({...d,rule_id:rule.id,is_dry:dryRun}); load(); }
    catch {} finally { setRunningId(null); }
  }
  async function generateMsgForForm() {
    if(!(form.target_states||[]).length) return; setGenLoading(true);
    try { const r=await fetch("/api/ai/campaign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({segment:(form.target_states||[]).map(s=>STATE_META[s]?.label||s).join(", "),markov_state:(form.target_states||[])[0],audience_size:50,avg_clv:Math.round((form.min_clv_cents||5000)/100),avg_days_overdue:form.min_days_overdue||30,campaign_goal:form.name||"Re-engage and rebook"})}); const d=await r.json(); setForm(f=>({...f,message_template:d.message||f.message_template})); }
    catch {} finally { setGenLoading(false); }
  }
  async function generateRule() {
    if(!aiPrompt.trim()) return; setAiLoading(true); setAiError(""); setAiPreview(null);
    try { const r=await fetch("/api/ai/generate-rule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:aiPrompt})}); const d=await r.json(); if(d.error){setAiError(d.error);}else{setAiPreview(d.rule);} }
    catch(e:any){setAiError(e.message);} finally{setAiLoading(false);}
  }
  async function createFromPreview() {
    if(!aiPreview) return; setSaving(true);
    try { const r=await fetch("/api/automation/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...aiPreview,venue_id:VENUE_ID})}); if(r.ok){setAiPreview(null);setAiPrompt("");load();} }
    catch {} finally{setSaving(false);}
  }
  function usePreviewAsTemplate() { if(!aiPreview) return; setForm({...BLANK,...aiPreview}); setEditingId("new"); setAiPreview(null); setAiPrompt(""); }
 
  const charCount = (form.message_template||"").length;
  const AI_EXAMPLES = ["Message at-risk clients who haven't visited in 3-6 weeks","Win back churned clients worth over $200 on Sunday evenings","Rebook first-timers between day 35-45 of no return","Gentle nudge for on-fence clients every 2 weeks"];
 
  function inBtn(style: object, hoverStyle: object, children: React.ReactNode, onClick: () => void, disabled?: boolean) {
    return (
      <button onClick={onClick} disabled={disabled}
        className="transition-all disabled:opacity-40 text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border flex items-center justify-center gap-1"
        style={style}
        onMouseOver={e => !disabled && Object.assign((e.currentTarget as HTMLElement).style, hoverStyle)}
        onMouseOut={e => Object.assign((e.currentTarget as HTMLElement).style, style)}>
        {children}
      </button>
    );
  }
 
  function EditForm({ isNew=false }:{isNew?:boolean}) {
    return (
      <div className="border-t p-5 space-y-4" style={{ borderColor: "#2A1852", background: SURF }}>
        <div className="grid grid-cols-2 gap-3">
          {[{l:"Rule Name *",k:"name",ph:"e.g. At Risk Recovery"},{l:"Description",k:"description",ph:"What this rule does..."}].map(({l,k,ph}) => (
            <div key={k}>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>{l}</div>
              <input value={(form as any)[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph}
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5C8A] focus:outline-none border"
                style={{ background: CARD_S, borderColor: "#2A1852" }} />
            </div>
          ))}
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: GOLD2 }}>Target States *</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATE_META).map(([key,{label,hex}])=>{
              const active=(form.target_states||[]).includes(key);
              return <button key={key} onClick={()=>toggleState(key)} className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
                style={{background:active?`${hex}15`:CARD_S,borderColor:active?`${hex}45`:"#2A1852",color:active?hex:MUT}}>{label}</button>;
            })}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: MUT }}>Conditions</div>
          <div className="grid grid-cols-3 gap-2">
            {COND_FIELDS.map(({label,field,divisor,placeholder})=>{
              const raw=(form[field] as number)||0; const display=divisor?raw/divisor:raw;
              return <div key={field}>
                <div className="text-[9px] mb-1" style={{ color: MUT }}>{label}</div>
                <input type="number" placeholder={placeholder} value={display||""}
                  onChange={e=>{const n=e.target.value===""?0:Number(e.target.value);setForm(f=>({...f,[field]:divisor?Math.round(n*divisor):n}));}}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none" style={{background:CARD_S,borderColor:"#2A1852"}} />;
              </div>;
            })}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: GOLD2 }}>Message Template *</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px]" style={{ color: MUT }}>[NAME] [BARBER]</span>
              <span className="text-[9px] font-mono font-bold" style={{ color: charCount>160?"#F43F5E":MUT }}>{charCount}/160</span>
            </div>
          </div>
          <textarea value={form.message_template||""} onChange={e=>setForm(f=>({...f,message_template:e.target.value}))} rows={2} maxLength={320}
            placeholder="Hey [NAME], the team at Alkami here — it's been a while. Reply YES to book in with [BARBER] this week."
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none resize-none leading-relaxed"
            style={{background:CARD_S,borderColor:"#2A1852"}} />
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-0.5 rounded-full" style={{background:"#2A1852"}}>
              <div className="h-full rounded-full transition-all" style={{width:`${Math.min((charCount/160)*100,100)}%`,background:charCount>160?"#F43F5E":PUR_L}} />
            </div>
            <button onClick={generateMsgForForm} disabled={genLoading||!(form.target_states||[]).length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border transition-all"
              style={{background:CARD_S,borderColor:"#3A2268",color:PUR_LL}}>
              {genLoading?<><div className="w-2.5 h-2.5 border rounded-full animate-spin" style={{borderColor:"rgba(167,139,250,0.3)",borderTopColor:PUR_LL}}/>Generating...</>:"✦ AI Write"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: MUT }}>Send Days</div>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day,i)=>{ const active=(form.send_days||[]).includes(day); return <button key={day} onClick={()=>toggleDay(day)} title={day}
                className="py-2 rounded-lg text-[9px] font-bold uppercase transition-all border"
                style={{background:active?"rgba(91,33,182,0.2)":CARD_S,borderColor:active?"rgba(91,33,182,0.5)":"#2A1852",color:active?"#C4B5FD":MUT}}>{DAY_S[i]}</button>; })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Send Time (AEST)</div>
              <input type="time" value={form.send_time||"10:00"} onChange={e=>setForm(f=>({...f,send_time:e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none" style={{background:CARD_S,borderColor:"#2A1852"}} />
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: MUT }}>Status</div>
              <button onClick={()=>setForm(f=>({...f,is_active:!f.is_active}))}
                className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
                style={{background:form.is_active?"rgba(52,211,153,0.1)":CARD_S,borderColor:form.is_active?"rgba(52,211,153,0.35)":"#2A1852",color:form.is_active?"#34D399":MUT}}>
                {form.is_active?"Active":"Inactive"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1 border-t" style={{ borderColor: "#2A1852" }}>
          <button onClick={cancelEdit} className="px-4 py-2.5 rounded-lg border text-sm transition-all" style={{background:CARD_S,borderColor:"#2A1852",color:PUR_LL}}>Cancel</button>
          <button onClick={save} disabled={saving||!form.name||!form.message_template||!(form.target_states||[]).length}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{background:PUR,boxShadow:"0 4px 20px rgba(212,160,23,0.12)"}}>
            {saving?"Saving...":isNew?"Create Rule":"Save Changes"}
          </button>
        </div>
      </div>
    );
  }
 
  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border rounded-full animate-spin" style={{ borderColor: "rgba(91,33,182,0.2)", borderTopColor: PUR_L }} /></div>;
 
  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[{l:"Active Rules",v:stats.active_rules,acc:PUR_L},{l:"Sent (30d)",v:(stats.sent_30d||0).toLocaleString(),acc:"#34D399"},{l:"Rebooked (30d)",v:(stats.rebooked_30d||0).toLocaleString(),acc:GOLD},{l:"Revenue Recovered",v:`$${(stats.revenue_30d||0).toLocaleString(undefined,{maximumFractionDigits:0})}`,acc:GOLD}].map(({l,v,acc})=>(
            <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden`}>
              <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{background:acc}} />
              <div className="pl-3"><div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{color:MUT}}>{l}</div><div className="text-2xl font-bold tracking-tight text-white">{v}</div></div>
            </div>
          ))}
        </div>
      )}
 
      {/* How it works */}
      <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-4" style={{ color: GOLD2 }}>How Autopilot works</div>
        <div className="grid grid-cols-5 gap-4">
          {[{n:"1",t:"Nightly check",d:"Runs every night at 9am AEST. Evaluates every client against every active rule."},{n:"2",t:"State matching",d:"Filters by Markov state, CLV threshold, days overdue, and gap ratio."},{n:"3",t:"Cooldown check",d:"Skips anyone contacted recently. No client is ever spammed by any rule."},{n:"4",t:"AI writes each SMS",d:"GPT-4o-mini writes a unique message per client — never a template verbatim."},{n:"5",t:"Send + log",d:"Fires via ClickSend. Every send logged with full attribution tracking."}].map(({n,t,d})=>(
            <div key={n} className="flex flex-col gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold" style={{background:"rgba(212,160,23,0.12)",border:"1px solid rgba(212,160,23,0.3)",color:GOLD}}>{n}</div>
              <div className="text-xs font-semibold text-white">{t}</div>
              <div className="text-[10px] leading-relaxed" style={{color:PUR_LL}}>{d}</div>
            </div>
          ))}
        </div>
      </div>
 
      {/* AI Generator */}
      <div className="rounded-xl overflow-hidden border" style={{background:`linear-gradient(135deg,rgba(91,33,182,0.08),rgba(212,160,23,0.04))`,borderColor:"rgba(212,160,23,0.25)"}}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:"linear-gradient(135deg,#5B21B6,#D4A017)"}}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">AI Rule Generator</div>
              <div className="text-[10px]" style={{color:"rgba(212,160,23,0.7)"}}>Describe any rule in plain English — AI builds the complete configuration</div>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {AI_EXAMPLES.map(ex=>(
              <button key={ex} onClick={()=>setAiPrompt(ex)} className="text-[9px] border px-2.5 py-1 rounded-lg transition-all"
                style={{background:"rgba(212,160,23,0.06)",borderColor:"rgba(212,160,23,0.2)",color:"rgba(212,160,23,0.8)"}}>
                {ex}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!aiLoading)generateRule();}}
              placeholder="e.g. Contact churned clients worth over $200 who haven't visited in 3+ months, every Sunday evening..."
              className="flex-1 rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B5C8A] border focus:outline-none transition-all"
              style={{background:"rgba(10,6,18,0.8)",borderColor:"rgba(212,160,23,0.25)"}} />
            <button onClick={generateRule} disabled={aiLoading||!aiPrompt.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all flex-shrink-0"
              style={{background:PUR,boxShadow:"0 2px 16px rgba(212,160,23,0.15)"}}>
              {aiLoading?<><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin"/>Building...</>:<>✦ Generate Rule</>}
            </button>
          </div>
          {aiError && <div className="mt-2 text-[10px] text-rose-400 px-1">{aiError}</div>}
        </div>
        {aiPreview && (
          <div className="border-t px-5 py-4" style={{borderColor:"rgba(212,160,23,0.2)",background:"rgba(10,6,18,0.6)"}}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{color:GOLD}}>Generated Rule Preview</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><div className="text-[9px] mb-0.5" style={{color:MUT}}>Name</div><div className="text-sm font-semibold text-white">{aiPreview.name}</div></div>
              <div><div className="text-[9px] mb-0.5" style={{color:MUT}}>Description</div><div className="text-xs" style={{color:"#C4B5FD"}}>{aiPreview.description}</div></div>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              {(aiPreview.target_states||[]).map(s=>{const sm=STATE_META[s];if(!sm)return null;return<span key={s} className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{background:`${sm.hex}15`,color:sm.hex}}>{sm.label}</span>;})}
              {[aiPreview.min_clv_cents&&aiPreview.min_clv_cents>0&&`CLV > $${(aiPreview.min_clv_cents||0)/100}`,aiPreview.min_days_overdue&&`${aiPreview.min_days_overdue}+ days`,`cooldown ${aiPreview.cooldown_days}d`,`${aiPreview.send_time} AEST`].filter(Boolean).map((t,i)=>(
                <span key={i} className="text-[9px] border px-2 py-0.5 rounded" style={{background:SURF,borderColor:"#2A1852",color:MUT}}>{t as string}</span>
              ))}
            </div>
            <div className="rounded-lg px-3 py-2.5 border mb-4 text-sm leading-relaxed italic" style={{background:SURF,borderColor:"#2A1852",color:"#C4B5FD"}}>"{aiPreview.message_template}"</div>
            <div className="flex gap-2">
              <button onClick={()=>{setAiPreview(null);setAiPrompt("");}} className="px-4 py-2 rounded-lg border text-sm transition-all" style={{background:SURF,borderColor:"#2A1852",color:PUR_LL}}>Discard</button>
              <button onClick={usePreviewAsTemplate} className="px-4 py-2 rounded-lg border text-sm font-medium transition-all" style={{background:"rgba(91,33,182,0.12)",borderColor:"rgba(91,33,182,0.35)",color:PUR_LL}}>Edit first →</button>
              <button onClick={createFromPreview} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{background:PUR,boxShadow:"0 2px 12px rgba(212,160,23,0.12)"}}>
                {saving?"Creating...":"✓ Create This Rule"}
              </button>
            </div>
          </div>
        )}
      </div>
 
      {/* Run result */}
      {runResult && (
        <div className="rounded-xl border px-5 py-3.5 flex items-center gap-3"
          style={{background:runResult.is_dry?"rgba(91,33,182,0.06)":"rgba(52,211,153,0.06)",borderColor:runResult.is_dry?"rgba(91,33,182,0.25)":"rgba(52,211,153,0.25)"}}>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:runResult.is_dry?PUR_LL:"#34D399"}} />
          <div className="flex-1 text-sm" style={{color:runResult.is_dry?"#C4B5FD":"#6EE7B7"}}>
            {runResult.is_dry?`Dry run — ${(runResult.results?.[0]?.matched||0).toLocaleString()} clients match, ${(runResult.results?.[0]?.targeted||0)} would be contacted`:`Done — ${(runResult.total_sent||0).toLocaleString()} messages sent`}
          </div>
          <button onClick={()=>setRunResult(null)} style={{color:MUT}}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}
 
      {/* Rules header */}
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold uppercase tracking-widest" style={{color:MUT}}>{rules.length} rule{rules.length!==1?"s":""} — evaluates nightly at 9am AEST</div>
        {editingId!=="new" && (
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all" style={{background:PUR,boxShadow:"0 2px 12px rgba(212,160,23,0.12)"}}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Rule
          </button>
        )}
      </div>
 
      {/* New rule card */}
      {editingId==="new" && (
        <div className={`${CARD} rounded-xl overflow-hidden border`} style={{borderColor:"rgba(212,160,23,0.3)"}}>
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{background:GOLD,boxShadow:`0 0 6px ${GOLD}`}} />
            <span className="text-sm font-semibold text-white">New Rule</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{background:"rgba(212,160,23,0.12)",color:GOLD}}>Editing</span>
          </div>
          <EditForm isNew />
        </div>
      )}
 
      {/* Rules list */}
      {rules.length===0 && editingId!=="new" ? (
        <div className={`${CARD} border ${BDR} rounded-xl p-10 text-center`}>
          <div className="text-3xl mb-3">⚡</div>
          <div className="text-sm font-semibold text-white mb-1">No rules yet</div>
          <div className="text-xs mb-4 max-w-xs mx-auto" style={{color:MUT}}>Use the AI generator above or create a rule manually.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule=>{
            const isEditing=editingId===rule.id;
            const isRunning=runningId===rule.id||runningId===rule.id+"-dry";
            const s7=rule.stats_7d||{sent:0,rebooked:0,conversion_rate:0};
            const convPct=s7.conversion_rate*100;
            return (
              <div key={rule.id} className={`${CARD} rounded-xl overflow-hidden transition-all border`}
                style={{borderColor:isEditing?"rgba(212,160,23,0.35)":rule.is_active?"#3A2268":"#2A1852"}}>
                <div className="flex items-start gap-3 px-5 py-4">
                  <div className="flex-shrink-0 pt-1.5">
                    <div className="w-2 h-2 rounded-full cursor-pointer transition-all" title="Click to toggle" onClick={()=>toggleActive(rule)}
                      style={{background:rule.is_active?GOLD:"#2A1852",boxShadow:rule.is_active?`0 0 6px ${GOLD}`:"none"}} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-white">{rule.name}</span>
                      {rule.target_states.map(s=>{const sm=STATE_META[s];if(!sm)return null;return<span key={s} className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{background:`${sm.hex}12`,color:sm.hex}}>{sm.label}</span>;})}
                      {!rule.is_active&&<span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{background:"#2A1852",color:MUT}}>Paused</span>}
                    </div>
                    {rule.description&&<div className="text-[10px] mb-2" style={{color:PUR_LL}}>{rule.description}</div>}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {[rule.min_clv_cents>0&&`CLV > $${rule.min_clv_cents/100}`,rule.min_days_overdue>0&&`${rule.min_days_overdue}+ days`,rule.max_days_overdue<9999&&`max ${rule.max_days_overdue}d`,`cooldown ${rule.cooldown_days}d`,`max ${rule.max_sends_per_run}/run`].filter(Boolean).map((tag,i)=>(
                        <span key={i} className="text-[9px] border px-2 py-0.5 rounded" style={{background:SURF,borderColor:"#2A1852",color:MUT}}>{tag as string}</span>
                      ))}
                    </div>
                    <div className="text-[10px] italic truncate mb-2" style={{color:MUT}}>"{rule.message_template}"</div>
                    <div className="flex items-center gap-4 text-[9px]">
                      <span style={{color:MUT}}>7d sent <span className="text-white font-semibold">{s7.sent}</span></span>
                      <span style={{color:MUT}}>rebooked <span className="font-semibold" style={{color:"#34D399"}}>{s7.rebooked}</span></span>
                      {s7.sent>0&&<span style={{color:MUT}}>conv <span className="font-semibold" style={{color:convPct>=25?GOLD:convPct>=12?PUR_LL:"#F43F5E"}}>{convPct.toFixed(0)}%</span></span>}
                      <span style={{color:MUT}}>all-time <span className="text-white font-semibold">{rule.total_sent}</span></span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0 min-w-[90px]">
                    {[
                      {label:rule.is_active?"Active":"Inactive",onClick:()=>toggleActive(rule),style:{background:rule.is_active?"rgba(212,160,23,0.1)":SURF,borderColor:rule.is_active?"rgba(212,160,23,0.35)":"#2A1852",color:rule.is_active?GOLD:MUT}},
                      {label:runningId===rule.id?"Running":"Run Now",onClick:()=>runRule(rule,false),disabled:isRunning,style:{background:SURF,borderColor:"#3A2268",color:PUR_LL}},
                      {label:runningId===rule.id+"-dry"?"Simulating":"Dry Run",onClick:()=>runRule(rule,true),disabled:isRunning,style:{background:SURF,borderColor:"#2A1852",color:MUT}},
                      {label:isEditing?"Close":"Edit",onClick:()=>isEditing?cancelEdit():startEdit(rule),style:{background:isEditing?"rgba(212,160,23,0.1)":SURF,borderColor:isEditing?"rgba(212,160,23,0.3)":"#2A1852",color:isEditing?GOLD:MUT}},
                    ].map(({label,onClick,disabled,style})=>(
                      <button key={label} onClick={onClick} disabled={disabled as any}
                        className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center justify-center gap-1 transition-all"
                        style={style as any}>{label}</button>
                    ))}
                    {deleteConfirm===rule.id?(
                      <div className="flex gap-1">
                        <button onClick={()=>deleteRule(rule.id)} className="flex-1 px-1 py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all" style={{background:SURF,borderColor:"rgba(244,63,94,0.35)",color:"#F43F5E"}}>Confirm</button>
                        <button onClick={()=>setDeleteConfirm(null)} className="px-2 py-1.5 rounded-lg text-[9px] border" style={{background:SURF,borderColor:"#2A1852",color:MUT}}>✕</button>
                      </div>
                    ):(
                      <button onClick={()=>setDeleteConfirm(rule.id)} className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all" style={{background:SURF,borderColor:"#2A1852",color:MUT}}>Delete</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-7 border-t" style={{background:SURF,borderColor:"#160C30"}}>
                  {DAYS.map((day,i)=>{ const active=rule.send_days.includes(day); return <div key={day} className="py-1.5 text-center text-[8px] font-bold uppercase border-r last:border-r-0" style={{background:active?"rgba(212,160,23,0.08)":"transparent",color:active?GOLD2:"#2A1852",borderColor:"#160C30"}} title={day}>{DAY_S[i]}</div>; })}
                </div>
                <div className="px-5 py-1.5 border-t flex items-center justify-between" style={{background:SURF,borderColor:"#160C30"}}>
                  <div className="text-[9px]" style={{color:MUT}}>{rule.send_days.length===7?"Every day":rule.send_days.length===5&&!rule.send_days.includes("Saturday")?"Weekdays":rule.send_days.slice(0,3).join(", ")+(rule.send_days.length>3?` +${rule.send_days.length-3}`:"")}</div>
                  <div className="text-[9px]" style={{color:MUT}}>{rule.send_time} AEST</div>
                </div>
                {isEditing&&<EditForm/>}
              </div>
            );
          })}
        </div>
      )}
 
      {/* Cron */}
      <div className="rounded-xl border px-5 py-4 flex items-start gap-3" style={{background:SURF,borderColor:"#2A1852"}}>
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{color:GOLD}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{color:GOLD2}}>Vercel Cron — required for nightly automation</div>
          <div className="font-mono text-[10px] rounded px-2 py-1 border inline-block" style={{background:CARD_S,borderColor:"#2A1852",color:"#34D399"}}>
            {'"crons": [{ "path": "/api/cron/interventions", "schedule": "0 23 * * *" }]'}
          </div>
          <div className="text-[9px] mt-1" style={{color:MUT}}>23:00 UTC = 9am AEST · Set <code style={{color:GOLD}}>CRON_SECRET</code> in Vercel env vars</div>
        </div>
      </div>
    </div>
  );
}
 
export default function OutreachPage() {
  const [tab, setTab] = useState<"history"|"autopilot">("history");
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      <NavBar />
      <div className="max-w-[1500px] mx-auto px-8 py-8">
        <div className="mb-6">
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{color:GOLD2}}>Alkami Barbershop · Canberra</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Outreach</h1>
        </div>
        <div className="flex gap-1 mb-6 border-b" style={{borderColor:"#2A1852"}}>
          <button onClick={()=>setTab("history")}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px"
            style={tab==="history"?{borderColor:GOLD,color:GOLD}:{borderColor:"transparent",color:MUT}}>
            History
          </button>
          <button onClick={()=>setTab("autopilot")}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px flex items-center gap-2"
            style={tab==="autopilot"?{borderColor:GOLD,color:GOLD}:{borderColor:"transparent",color:MUT}}>
            Autopilot
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{background:"rgba(212,160,23,0.12)",color:GOLD}}>AUTO</span>
          </button>
        </div>
        {tab==="history" ? <HistoryTab /> : <AutopilotTab />}
      </div>
    </div>
  );
}