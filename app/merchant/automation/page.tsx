"use client";
import { useState, useEffect } from "react";
 
const BG    = "bg-[#0A0612]";
const CARD  = "bg-[#130C24]";
const BDR   = "border-[#2A1852]";
const BDR2  = "border-[#3A2268]";
const GOLD  = "#D4A017";
const GOLD2 = "#C9973A";
const PUR   = "#5B21B6";
const PUR_L = "#7C3AED";
const PUR_LL = "#A78BFA";
const MUT   = "#6B5C8A";
 
const NAV = [
  { href: "/merchant/dashboard",  label: "Dashboard"  },
  { href: "/merchant/outreach",   label: "Outreach"   },
  { href: "/merchant/campaign",   label: "Campaign"   },
  { href: "/merchant/clients",    label: "Clients"    },
  { href: "/merchant/barber",     label: "Barbers"    },
  { href: "/merchant/automation", label: "Autopilot", active: true },
];
 
const STATE_META: Record<string, { label: string; hex: string }> = {
  C:          { label: "First Timers", hex: "#38BDF8" },
  X:          { label: "Churned",      hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",      hex: "#FB923C" },
  R_on_fence: { label: "On Fence",     hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",        hex: "#34D399" },
};
 
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
 
interface Rule {
  id: string;
  name: string;
  description: string;
  target_states: string[];
  min_clv_cents: number;
  min_days_overdue: number;
  max_days_overdue: number;
  min_gap_ratio: number;
  cooldown_days: number;
  max_sends_per_run: number;
  message_template: string;
  send_time: string;
  send_days: string[];
  is_active: boolean;
  is_paused: boolean;
  total_sent: number;
  total_rebooked: number;
  last_run_at: string | null;
  stats_7d?: { sent: number; rebooked: number; conversion_rate: number };
}
 
const EMPTY_RULE: Partial<Rule> = {
  name: "",
  description: "",
  target_states: [],
  min_clv_cents: 0,
  min_days_overdue: 0,
  max_days_overdue: 9999,
  min_gap_ratio: 0,
  cooldown_days: 21,
  max_sends_per_run: 50,
  message_template: "",
  send_time: "10:00",
  send_days: ["Monday","Tuesday","Wednesday","Thursday","Friday"],
  is_active: true,
};
 
// ─── Rule Builder Modal ───────────────────────────────────────────────────────
function RuleBuilder({
  rule, onClose, onSaved, venueId,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSaved: () => void;
  venueId: string;
}) {
  const [form, setForm] = useState<Partial<Rule>>(rule ? { ...rule } : EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const charCount = (form.message_template || "").length;
 
  function toggleState(s: string) {
    setForm(f => {
      const cur = f.target_states || [];
      return { ...f, target_states: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] };
    });
  }
 
  function toggleDay(d: string) {
    setForm(f => {
      const cur = f.send_days || [];
      return { ...f, send_days: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] };
    });
  }
 
  async function generateTemplate() {
    if (!(form.target_states || []).length) return;
    setGenLoading(true);
    try {
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment: (form.target_states || []).map(s => STATE_META[s]?.label || s).join(", "),
          markov_state: (form.target_states || [])[0],
          audience_size: 50,
          avg_clv: Math.round((form.min_clv_cents || 5000) / 100),
          avg_days_overdue: form.min_days_overdue || 30,
          campaign_goal: form.name || "Re-engage and rebook",
        }),
      });
      const data = await res.json();
      setForm(f => ({ ...f, message_template: data.message || f.message_template }));
    } catch {} finally { setGenLoading(false); }
  }
 
  async function save() {
    if (!form.name || !form.message_template || !(form.target_states || []).length) return;
    setSaving(true);
    try {
      const url = rule ? `/api/automation/rules/${rule.id}` : "/api/automation/rules";
      const method = rule ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, venue_id: venueId }),
      });
      if (res.ok) { onSaved(); onClose(); }
    } catch {} finally { setSaving(false); }
  }
 
  const isValid = !!(form.name && form.message_template && (form.target_states || []).length);
 
  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div
          className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: "#05080F", borderColor: "#3A2268" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "#2A1852" }}>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">
                {rule ? "Edit Rule" : "New Automation Rule"}
              </div>
              <div className="text-sm font-semibold text-white">Configure when + who + what to send</div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md border flex items-center justify-center text-slate-500 hover:text-white transition-all"
              style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
 
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
 
            {/* Name */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Rule Name</div>
              <input
                value={form.name || ""}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. At Risk Recovery"
                className="w-full rounded-md px-4 py-2.5 text-sm text-white placeholder-slate-600 border focus:outline-none transition-all"
                style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
              />
            </div>
 
            {/* Target states */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Target Markov States</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(STATE_META).map(([key, { label, hex }]) => {
                  const active = (form.target_states || []).includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleState(key)}
                      className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border"
                      style={{
                        background: active ? `${hex}18` : "#0F0A1E",
                        borderColor: active ? `${hex}40` : "#2A1852",
                        color: active ? hex : "#64748B",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
 
            {/* Conditions */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Trigger Conditions</div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Min CLV ($)", field: "min_clv_cents" as const, divisor: 100, placeholder: "0" },
                  { label: "Cooldown (days)", field: "cooldown_days" as const, placeholder: "21" },
                  { label: "Days Overdue — Min", field: "min_days_overdue" as const, placeholder: "0" },
                  { label: "Days Overdue — Max", field: "max_days_overdue" as const, placeholder: "9999" },
                  { label: "Min Gap Ratio (×)", field: "min_gap_ratio" as const, placeholder: "0" },
                  { label: "Max sends per run", field: "max_sends_per_run" as const, placeholder: "50" },
                ] as { label: string; field: keyof Rule; divisor?: number; placeholder: string }[]).map(({ label, field, divisor, placeholder }) => (
                  <div key={field}>
                    <div className="text-[9px] text-slate-600 mb-1">{label}</div>
                    <input
                      type="number"
                      placeholder={placeholder}
                      value={divisor ? (((form[field] as number) || 0) / divisor) : ((form[field] as number) || "")}
                      onChange={e => {
                        const val = e.target.value === "" ? 0 : Number(e.target.value);
                        setForm(f => ({ ...f, [field]: divisor ? Math.round(val * divisor) : val }));
                      }}
                      className="w-full rounded-md px-3 py-2 text-sm text-white border focus:outline-none"
                      style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
                    />
                  </div>
                ))}
              </div>
            </div>
 
            {/* Message template */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Message Template</div>
                <span className={`text-[9px] font-mono ${charCount > 160 ? "text-rose-400" : "text-slate-600"}`}>
                  {charCount}/160
                </span>
              </div>
              <textarea
                value={form.message_template || ""}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={3}
                placeholder="Hey [NAME], the team at Alkami here — it's been a while. Reply YES to book in with [BARBER] this week."
                className="w-full rounded-md px-4 py-3 text-sm text-white placeholder-slate-600 border focus:outline-none resize-none leading-relaxed"
                style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
              />
              <div className="h-0.5 rounded-full mt-1.5 mb-2" style={{ background: "#2A1852" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((charCount / 160) * 100, 100)}%`,
                    background: charCount > 160 ? "#F43F5E" : "#7C3AED",
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-700">Use [NAME] and [BARBER] · AI personalises each individual send</span>
                <button
                  onClick={generateTemplate}
                  disabled={genLoading || !(form.target_states || []).length}
                  className="ml-auto px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center gap-1.5 transition-all"
                  style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#6B5C8A" }}
                >
                  {genLoading ? (
                    <>
                      <div className="w-2.5 h-2.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : "✦ Generate with AI"}
                </button>
              </div>
            </div>
 
            {/* Schedule */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Schedule</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-[9px] text-slate-600 mb-1">Send Time (AEST)</div>
                  <input
                    type="time"
                    value={form.send_time || "10:00"}
                    onChange={e => setForm(f => ({ ...f, send_time: e.target.value }))}
                    className="w-full rounded-md px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
                  />
                </div>
                <div>
                  <div className="text-[9px] text-slate-600 mb-1">Status</div>
                  <button
                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    className="w-full py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border"
                    style={{
                      background: form.is_active ? "rgba(52,211,153,0.08)" : "#0F0A1E",
                      borderColor: form.is_active ? "rgba(52,211,153,0.3)" : "#2A1852",
                      color: form.is_active ? "#34D399" : "#64748B",
                    }}
                  >
                    {form.is_active ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>
              <div className="text-[9px] text-slate-600 mb-1.5">Send Days</div>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(day => {
                  const active = (form.send_days || []).includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className="px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all border"
                      style={{
                        background: active ? "rgba(91,33,182,0.2)" : "#0F0A1E",
                        borderColor: active ? "rgba(91,33,182,0.45)" : "#2A1852",
                        color: active ? "#A78BFA" : "#475569",
                      }}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
 
          {/* Footer */}
          <div className="flex-shrink-0 border-t px-6 py-4 flex gap-3" style={{ background: "#0F0A1E", borderColor: "#2A1852" }}>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-md border text-slate-400 text-sm font-medium hover:text-white transition-all"
              style={{ borderColor: "#2A1852" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !isValid}
              className="flex-[2] py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-all"
              style={{ background: "#5B21B6", boxShadow: "0 4px 20px rgba(212,160,23,0.12)" }}
            >
              {saving ? "Saving..." : rule ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AutomationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [runningRule, setRunningRule] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
 
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/automation/rules?venue_id=${VENUE_ID}`);
      const data = await res.json();
      setRules(data.rules || []);
      setStats(data.stats || null);
    } catch {} finally { setLoading(false); }
  }
 
  useEffect(() => { load(); }, []);
 
  function openCreate() { setEditingRule(null); setShowBuilder(true); setRunResult(null); }
  function openEdit(rule: Rule) { setEditingRule(rule); setShowBuilder(true); setRunResult(null); }
 
  async function toggleActive(rule: Rule) {
    await fetch(`/api/automation/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    load();
  }
 
  async function deleteRule(id: string) {
    await fetch(`/api/automation/rules/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    load();
  }
 
  async function runNow(rule: Rule, dryRun = false) {
    const key = dryRun ? rule.id + "-dry" : rule.id;
    setRunningRule(key);
    setRunResult(null);
    try {
      const res = await fetch("/api/cron/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": "rydra-dev" },
        body: JSON.stringify({ venue_id: VENUE_ID, rule_id: rule.id, dry_run: dryRun }),
      });
      const data = await res.json();
      setRunResult({ ...data, is_dry: dryRun });
      load();
    } catch {} finally { setRunningRule(null); }
  }
 
  if (loading) return (
    <div className={`min-h-screen ${BG} flex items-center justify-center`}>
      <div className="text-center">
        <div className="w-10 h-10 border border-[#7C3AED]/20 border-t-[#7C3AED] rounded-full animate-spin mx-auto mb-3" />
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading autopilot</div>
      </div>
    </div>
  );
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
 
      {showBuilder && (
        <RuleBuilder
          rule={editingRule}
          onClose={() => setShowBuilder(false)}
          onSaved={load}
          venueId={VENUE_ID}
        />
      )}
 
      {/* Nav */}
      <div
        className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30"
        style={{ background: "rgba(10,6,18,0.97)" }}
      >
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div>
              <div className="text-sm font-semibold text-white leading-none">Autopilot</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => (
              <a
                key={tab.href}
                href={tab.href}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  (tab as any).active
                    ? "bg-[#5B21B6] text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {tab.label}
              </a>
            ))}
          </nav>
          <button
            onClick={openCreate}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold text-white transition-all"
            style={{ background: "#5B21B6", boxShadow: "0 2px 12px rgba(91,33,182,0.3)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Rule
          </button>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* Title */}
        <div className="mb-8">
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#C9973A" }}>
            Alkami Barbershop · Intervention Engine
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Autopilot</h1>
          <p className="text-sm text-slate-500 mt-1">
            Rules fire nightly at 9am AEST. AI writes a unique message per client — no template is ever sent verbatim.
          </p>
        </div>
 
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {([
              { l: "Active Rules",      v: stats.active_rules,                                                                 acc: "#7C3AED" },
              { l: "Sent (30d)",        v: stats.sent_30d.toLocaleString(),                                                    acc: "#34D399" },
              { l: "Rebooked (30d)",    v: stats.rebooked_30d.toLocaleString(),                                                acc: "#FBBF24" },
              { l: "Revenue Recovered", v: `$${(stats.revenue_30d || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, acc: "#D4A017" },
            ] as const).map(({ l, v, acc }) => (
              <div key={l} className={`${CARD} border ${BDR} rounded-xl p-5 relative overflow-hidden`}>
                <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
                <div className="pl-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{l}</div>
                  <div className="text-3xl font-bold tracking-tight text-white">{v}</div>
                </div>
              </div>
            ))}
          </div>
        )}
 
        {/* Run result banner */}
        {runResult && (
          <div
            className="rounded-xl border px-5 py-4 mb-6 flex items-start gap-4"
            style={{
              background: runResult.is_dry ? "rgba(91,33,182,0.1)" : "rgba(52,211,153,0.06)",
              borderColor: runResult.is_dry ? "rgba(91,33,182,0.3)" : "rgba(52,211,153,0.25)",
            }}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: runResult.is_dry ? "rgba(91,33,182,0.2)" : "rgba(52,211,153,0.15)" }}
            >
              {runResult.is_dry ? (
                <svg className="w-4 h-4 text-[#A78BFA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <div className={`text-sm font-semibold mb-1 ${runResult.is_dry ? "text-[#C4B5FD]" : "text-emerald-300"}`}>
                {runResult.is_dry
                  ? `Dry Run — ${runResult.total_sent} messages would be sent`
                  : `Done — ${runResult.total_sent} messages sent`}
              </div>
              <div className="space-y-1">
                {(runResult.results || []).map((r: any, i: number) => (
                  <div key={i} className="text-[10px] text-slate-400">
                    <span className="font-medium text-white">{r.rule_name}</span>
                    {" — "}
                    {r.matched} matched · {r.targeted} targeted · {r.sent} {runResult.is_dry ? "would send" : "sent"}
                    {r.failed > 0 && <span className="text-rose-400 ml-2">{r.failed} failed</span>}
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-slate-600 mt-1.5">Completed in {runResult.elapsed_seconds}s</div>
            </div>
            <button onClick={() => setRunResult(null)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
 
        {/* How it works */}
        <div className={`${CARD} border ${BDR} rounded-xl p-5 mb-6`}>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">How it works</div>
          <div className="grid grid-cols-5 gap-4">
            {[
              { step: "1", title: "Nightly check", desc: "Runs every night at 9am AEST. Evaluates every client against every active rule." },
              { step: "2", title: "State matching", desc: "Filters by Markov state, CLV, days overdue, and gap ratio." },
              { step: "3", title: "Cooldown check", desc: "Skips anyone contacted recently. No client is ever spammed." },
              { step: "4", title: "AI writes each message", desc: "GPT-4o-mini writes a unique SMS per client based on their individual data — not a template." },
              { step: "5", title: "Send + log", desc: "Fires via ClickSend. Every send logged with full attribution tracking." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-[#A78BFA]"
                  style={{ background: "rgba(91,33,182,0.18)", border: "1px solid rgba(91,33,182,0.3)" }}
                >
                  {step}
                </div>
                <div className="text-xs font-semibold text-white">{title}</div>
                <div className="text-[10px] text-slate-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
 
        {/* Rules list */}
        {rules.length === 0 ? (
          <div className={`${CARD} border ${BDR} rounded-xl p-12 text-center`}>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(91,33,182,0.12)", border: "1px solid rgba(99,102,241,0.18)" }}
            >
              <svg className="w-6 h-6 text-[#7C3AED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white mb-1">No rules yet</div>
            <div className="text-xs text-slate-600 mb-5 max-w-xs mx-auto">
              Create your first rule and Rydra will handle client recovery on autopilot every night.
            </div>
            <button
              onClick={openCreate}
              className="px-5 py-2.5 rounded-md text-sm font-semibold text-white"
              style={{ background: "#5B21B6", boxShadow: "0 4px 20px rgba(212,160,23,0.12)" }}
            >
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">
              {rules.length} rule{rules.length !== 1 ? "s" : ""} — runs nightly at 9am AEST
            </div>
 
            {rules.map(rule => {
              const isRunning = runningRule === rule.id || runningRule === rule.id + "-dry";
              const s7 = rule.stats_7d || { sent: 0, rebooked: 0, conversion_rate: 0 };
              const convPct = s7.conversion_rate * 100;
 
              return (
                <div
                  key={rule.id}
                  className={`${CARD} border rounded-xl overflow-hidden transition-all`}
                  style={{ borderColor: rule.is_active && !rule.is_paused ? "#3A2268" : "#2A1852" }}
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
 
                      {/* Status dot */}
                      <div className="flex-shrink-0 pt-1.5">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: rule.is_active && !rule.is_paused ? "#34D399" : rule.is_paused ? "#FBBF24" : "#2A1852",
                            boxShadow: rule.is_active && !rule.is_paused ? "0 0 6px rgba(52,211,153,0.5)" : "none",
                          }}
                        />
                      </div>
 
                      <div className="flex-1 min-w-0">
                        {/* Title + state badges */}
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-white">{rule.name}</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {rule.target_states.map(s => {
                              const sm = STATE_META[s];
                              if (!sm) return null;
                              return (
                                <span
                                  key={s}
                                  className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{ background: `${sm.hex}12`, color: sm.hex }}
                                >
                                  {sm.label}
                                </span>
                              );
                            })}
                          </div>
                          {!rule.is_active && (
                            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-slate-600" style={{ background: "#2A1852" }}>
                              Inactive
                            </span>
                          )}
                          {rule.is_paused && (
                            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-amber-400" style={{ background: "rgba(251,191,36,0.1)" }}>
                              Paused
                            </span>
                          )}
                        </div>
 
                        {rule.description && (
                          <div className="text-[10px] text-slate-500 mb-3">{rule.description}</div>
                        )}
 
                        {/* Condition chips */}
                        <div className="flex gap-2 flex-wrap mb-3">
                          {[
                            rule.min_clv_cents > 0 && `CLV > $${rule.min_clv_cents / 100}`,
                            rule.min_days_overdue > 0 && `${rule.min_days_overdue}+ days overdue`,
                            rule.max_days_overdue < 9999 && `max ${rule.max_days_overdue}d`,
                            `cooldown ${rule.cooldown_days}d`,
                            `max ${rule.max_sends_per_run}/run`,
                          ].filter(Boolean).map((tag, i) => (
                            <span
                              key={i}
                              className="text-[9px] text-slate-600 border px-2 py-0.5 rounded"
                              style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
                            >
                              {tag as string}
                            </span>
                          ))}
                        </div>
 
                        {/* Message preview */}
                        <div
                          className="rounded-md px-3 py-2 border mb-3"
                          style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
                        >
                          <div className="text-[8px] text-slate-700 uppercase tracking-wider mb-1">Template</div>
                          <p className="text-xs text-slate-400 leading-relaxed">{rule.message_template}</p>
                        </div>
 
                        {/* Stats */}
                        <div className="flex items-center gap-5 text-[10px]">
                          <div>
                            <span className="text-slate-600">7d sent </span>
                            <span className="text-white font-semibold">{s7.sent}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">7d rebooked </span>
                            <span className="text-emerald-400 font-semibold">{s7.rebooked}</span>
                          </div>
                          {s7.sent > 0 && (
                            <div>
                              <span className="text-slate-600">conversion </span>
                              <span
                                className="font-semibold"
                                style={{ color: convPct >= 30 ? "#34D399" : convPct >= 15 ? "#FBBF24" : "#F43F5E" }}
                              >
                                {convPct.toFixed(0)}%
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-slate-600">all-time </span>
                            <span className="text-white font-semibold">{rule.total_sent}</span>
                          </div>
                          {rule.last_run_at && (
                            <div className="text-slate-600">
                              last run{" "}
                              {new Date(rule.last_run_at).toLocaleDateString("en-AU", {
                                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>
                      </div>
 
                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 flex-shrink-0 min-w-[88px]">
                        <button
                          onClick={() => toggleActive(rule)}
                          className="px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all border"
                          style={{
                            background: rule.is_active ? "rgba(52,211,153,0.06)" : "#0F0A1E",
                            borderColor: rule.is_active ? "rgba(52,211,153,0.3)" : "#2A1852",
                            color: rule.is_active ? "#34D399" : "#64748B",
                          }}
                        >
                          {rule.is_active ? "Active" : "Inactive"}
                        </button>
 
                        <button
                          onClick={() => runNow(rule, false)}
                          disabled={isRunning}
                          className="px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center justify-center gap-1.5 transition-all"
                          style={{ background: "#0F0A1E", borderColor: "#3A2268", color: "#A78BFA" }}
                        >
                          {runningRule === rule.id ? (
                            <><div className="w-2.5 h-2.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />Running...</>
                          ) : "Run Now"}
                        </button>
 
                        <button
                          onClick={() => runNow(rule, true)}
                          disabled={isRunning}
                          className="px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider disabled:opacity-40 border flex items-center justify-center gap-1.5 transition-all"
                          style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#6B5C8A" }}
                        >
                          {runningRule === rule.id + "-dry" ? (
                            <><div className="w-2.5 h-2.5 border border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />Simulating...</>
                          ) : "Dry Run"}
                        </button>
 
                        <button
                          onClick={() => openEdit(rule)}
                          className="px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all"
                          style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#6B5C8A" }}
                        >
                          Edit
                        </button>
 
                        {deleteConfirm === rule.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="flex-1 px-2 py-1 rounded-md text-[8px] font-bold uppercase border transition-all"
                              style={{ background: "#0A0612", borderColor: "rgba(244,63,94,0.3)", color: "#F43F5E" }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 rounded-md text-[8px] border"
                              style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#6B5C8A" }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(rule.id)}
                            className="px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all"
                            style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#6B5C8A" }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
 
                  {/* Send-days bar */}
                  <div
                    className="flex border-t px-5 py-2 gap-1"
                    style={{ background: "#0F0A1E", borderColor: "#1A1030" }}
                  >
                    {DAYS.map(day => {
                      const active = rule.send_days.includes(day);
                      return (
                        <div
                          key={day}
                          className="flex-1 text-center text-[8px] font-bold uppercase py-1 rounded"
                          style={{
                            background: active ? "rgba(91,33,182,0.18)" : "transparent",
                            color: active ? "#A78BFA" : "#334155",
                          }}
                        >
                          {day.slice(0, 1)}
                        </div>
                      );
                    })}
                    <div className="ml-3 text-[9px] text-slate-700 flex items-center whitespace-nowrap">
                      {rule.send_time} AEST
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
 
        {/* Vercel cron reminder */}
        <div className={`mt-6 ${CARD} border ${BDR} rounded-xl p-5`}>
          <div className="flex items-start gap-3">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
            >
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#C9973A" }}>Vercel Cron Configuration</div>
              <div className="text-xs text-slate-400 mb-2">
                Add this to your <code className="text-[#A78BFA] bg-[#7C3AED]/10 px-1 py-0.5 rounded text-[10px]">vercel.json</code> to enable nightly automation:
              </div>
              <div
                className="rounded-md px-4 py-3 border font-mono text-xs text-emerald-400"
                style={{ background: "#0F0A1E", borderColor: "#2A1852" }}
              >
                {'"crons": [{ "path": "/api/cron/interventions", "schedule": "0 23 * * *" }]'}
              </div>
              <div className="text-[9px] text-slate-600 mt-1.5">
                23:00 UTC = 9:00am AEST. Set <code className="text-amber-400 text-[9px]">CRON_SECRET</code> in Vercel environment variables.
              </div>
            </div>
          </div>
        </div>
 
      </div>
    </div>
  );
}