"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
 
interface Customer {
  score_id: string; user_id: string; name: string; phone: string; email: string | null;
  gap_ratio: number; days_overdue: number; visits: number; potential_value: string;
  churn_score: number | null; loyalty_score: number | null;
  intervention_value: number; markov_state: string; risk_segment: string;
  avg_gap_days: number; last_visit: string;
}
interface GeneratedMsg {
  customer_id: string; message: string;
  status: "pending" | "generating" | "done" | "error" | "sent" | "sending";
}
 
const BG   = "bg-[#0A0612]";
const SURF = "bg-[#090D1A]";
const CARD = "bg-[#130C24]";
const BDR  = "border-[#2A1852]";
const BDR2 = "border-[#3A2268]";
 
const STATE_META: Record<string, { label: string; hex: string; shortLabel: string }> = {
  C:          { label: "First Timer", shortLabel: "New",     hex: "#38BDF8" },
  X:          { label: "Churned",     shortLabel: "Churned", hex: "#F43F5E" },
  R_at_risk:  { label: "At Risk",     shortLabel: "Risk",    hex: "#FB923C" },
  R_on_fence: { label: "On Fence",    shortLabel: "Fence",   hex: "#FBBF24" },
  R_loyal:    { label: "Loyal",       shortLabel: "Loyal",   hex: "#34D399" },
};
 
type SortKey = "name" | "gap_ratio" | "days_overdue" | "potential_value" | "churn_score" | "intervention_value" | "visits";
 
// ─── Personalised Bulk Send Modal ─────────────────────────────────────────────
function PersonalisedSendModal({ selected, customers, onClose, venueId }: { selected: Set<string>; customers: Customer[]; onClose: () => void; venueId: string }) {
  const targets = customers.filter(c => selected.has(c.user_id) && c.phone && c.phone !== "No phone");
  const noPhone = customers.filter(c => selected.has(c.user_id) && (!c.phone || c.phone === "No phone"));
  const [step, setStep] = useState<"review" | "generating" | "send" | "sending" | "done">("review");
  const [messages, setMessages] = useState<GeneratedMsg[]>(targets.map(c => ({ customer_id: c.user_id, message: "", status: "pending" })));
  const [genProgress, setGenProgress] = useState(0);
  const [sendProgress, setSendProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const generated = messages.filter(m => ["done","sent","sending"].includes(m.status)).length;
 
  async function generateAll() {
    setStep("generating");
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: "generating" } : m));
      try {
        const res = await fetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: { name: c.name, phone: c.phone, markov_state: c.markov_state, gap_ratio: c.gap_ratio, days_overdue: c.days_overdue, visits: c.visits, potential_value: c.potential_value, intervention_value: c.intervention_value, risk_segment: c.risk_segment } }) });
        const data = await res.json();
        setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, message: data.message || "", status: "done" } : m));
      } catch {
        setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: "error" } : m));
      }
      setGenProgress(Math.round(((i + 1) / targets.length) * 100));
      await new Promise(r => setTimeout(r, 200));
    }
    setStep("send");
  }
 
  async function sendAll() {
    setStep("sending");
    let sent = 0;
    for (const c of targets) {
      const msg = messages.find(m => m.customer_id === c.user_id);
      if (!msg || msg.status === "error" || !msg.message.trim()) continue;
      setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: "sending" } : m));
      try {
        const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: c.phone, message: msg.message, customer_name: c.name, customer_id: c.user_id, venue_id: venueId, markov_state: c.markov_state, risk_segment: c.risk_segment, gap_ratio: c.gap_ratio, days_overdue: c.days_overdue }) });
        setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: res.ok ? "sent" : "error" } : m));
        if (res.ok) { sent++; setSentCount(sent); }
      } catch {
        setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: "error" } : m));
      }
      setSendProgress(Math.round((sent / targets.length) * 100));
      await new Promise(r => setTimeout(r, 150));
    }
    setStep("done");
  }
 
  return (
    <>
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40" onClick={step === "done" ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-xl border border-[#3A2268] shadow-2xl overflow-hidden" style={{ background: "#05080F" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A1852] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-[#5B21B6] flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">AI Personalised Outreach</div>
                <div className="text-sm font-semibold text-white">Unique message per client — not a template</div>
              </div>
            </div>
            {!["generating","sending"].includes(step) && (
              <button onClick={onClose} className="w-7 h-7 rounded-md border border-[#2A1852] text-slate-500 hover:text-white flex items-center justify-center transition-all">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
 
          <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-[#0F1829] flex-shrink-0" style={{ background: "#0F0A1E" }}>
            {[{ l: "Selected", v: selected.size, c: "text-white" }, { l: "Reachable", v: targets.length, c: "text-emerald-400" }, { l: "No phone", v: noPhone.length, c: noPhone.length > 0 ? "text-rose-400" : "text-slate-600" }, { l: "Est. cost", v: `$${(targets.length * 0.08).toFixed(2)}`, c: "text-rose-400" }].map(({ l, v, c }) => (
              <div key={l} className="text-center py-1">
                <div className={`text-lg font-bold tracking-tight ${c}`}>{v}</div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">{l}</div>
              </div>
            ))}
          </div>
 
          <div className="flex-1 overflow-y-auto p-5">
            {noPhone.length > 0 && (
              <div className="rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 border" style={{ background: "rgba(244,63,94,0.06)", borderColor: "rgba(244,63,94,0.2)" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                <p className="text-rose-400 text-xs"><span className="font-semibold">{noPhone.length} clients</span> will be skipped — no phone on file</p>
              </div>
            )}
 
            {(step === "generating") && (
              <div className="mb-4 rounded-lg p-4 border border-[#2A1852]" style={{ background: "#0F0A1E" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Generating personalised messages...</span>
                  <span className="text-xs font-mono text-[#A78BFA]">{generated}/{targets.length}</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: "#2A1852" }}>
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${genProgress}%` }} />
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">Each message is unique — personalised with name, history, and strategy</p>
              </div>
            )}
 
            {step === "sending" && (
              <div className="mb-4 rounded-lg p-4 border border-[#2A1852]" style={{ background: "#0F0A1E" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Sending messages...</span>
                  <span className="text-xs font-mono text-emerald-400">{sentCount}/{targets.length}</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: "#2A1852" }}>
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${sendProgress}%` }} />
                </div>
              </div>
            )}
 
            {step === "done" && (
              <div className="rounded-lg px-5 py-4 mb-4 flex items-center gap-3 border" style={{ background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.2)" }}>
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <div><div className="text-emerald-400 font-semibold text-sm">All messages sent</div><div className="text-emerald-600 text-xs">{sentCount} personalised SMS · ${(sentCount * 0.08).toFixed(2)} total</div></div>
              </div>
            )}
 
            <div className="space-y-2">
              {targets.map(c => {
                const sm = STATE_META[c.markov_state] || STATE_META.R_at_risk;
                const msg = messages.find(m => m.customer_id === c.user_id);
                const isEditing = editingId === c.user_id;
                return (
                  <div key={c.user_id} className="rounded-lg border border-[#2A1852] p-4 hover:border-[#3A2268] transition-all" style={{ background: "#0F0A1E" }}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-md border border-[#2A1852] flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0" style={{ background: "#0C1120" }}>
                        {c.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{c.name}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${sm.hex}15`, color: sm.hex }}>{sm.shortLabel}</span>
                          {msg?.status === "sent" && <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">✓ Sent</span>}
                          {msg?.status === "sending" && <span className="text-[9px] text-[#A78BFA] animate-pulse font-semibold uppercase tracking-wider">Sending...</span>}
                          {msg?.status === "error" && <span className="text-[9px] text-rose-400 font-semibold uppercase tracking-wider">Failed</span>}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{c.phone} · {c.days_overdue}d overdue · CLV ${c.potential_value}</div>
                      </div>
                      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        {msg?.status === "pending" && <div className="w-3 h-3 rounded-full border border-[#2A1852]" />}
                        {msg?.status === "generating" && <div className="w-3 h-3 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />}
                        {msg?.status === "done" && <div className="w-4 h-4 rounded-full bg-indigo-500/20 border border-[#7C3AED]/40 flex items-center justify-center"><svg className="w-2.5 h-2.5 text-[#A78BFA]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>}
                        {msg?.status === "sent" && <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"><svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>}
                      </div>
                    </div>
 
                    {msg?.message && (
                      <div className="ml-11">
                        {isEditing ? (
                          <div>
                            <textarea value={msg.message} onChange={e => setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, message: e.target.value } : m))} rows={2} maxLength={160}
                              className="w-full rounded-md px-3 py-2 text-xs text-white focus:outline-none border border-[#3A2268] resize-none" style={{ background: "#0C1120" }} />
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] text-slate-600">{msg.message.length}/160</span>
                              <button onClick={() => setEditingId(null)} className="text-[9px] text-[#A78BFA] hover:text-[#C4B5FD]">Done</button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group flex items-start gap-2">
                            <div className="rounded-xl rounded-tl-sm px-3 py-2 inline-block" style={{ background: "#5B21B6" }}>
                              <p className="text-white text-xs leading-relaxed">{msg.message}</p>
                            </div>
                            {step === "send" && (
                              <button onClick={() => setEditingId(c.user_id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-600 hover:text-slate-300 mt-1 px-1.5 py-0.5 rounded border border-[#2A1852]">Edit</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {msg?.status === "pending" && (
                      <div className="ml-11 h-6 rounded-md bg-[#162038]/40 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
 
          <div className="flex-shrink-0 border-t border-[#0F1829] px-6 py-4" style={{ background: "#0F0A1E" }}>
            {step === "review" && (
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-md border border-[#2A1852] text-slate-400 text-sm font-medium hover:text-white hover:border-[#3A2268] transition-all">Cancel</button>
                <button onClick={generateAll} disabled={targets.length === 0}
                  className="flex-[3] py-2.5 rounded-md text-sm font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: "#5B21B6" }}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
                  Generate {targets.length} Personalised Messages
                </button>
              </div>
            )}
            {step === "generating" && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                <div className="w-3.5 h-3.5 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                Writing message {generated + 1} of {targets.length}
              </div>
            )}
            {step === "send" && (
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-md border border-[#2A1852] text-slate-400 text-sm font-medium hover:text-white transition-all">Cancel</button>
                <button onClick={generateAll} className="flex-1 py-2.5 rounded-md border border-[#3A2268] text-slate-300 text-sm font-medium hover:text-white transition-all flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Regenerate
                </button>
                <button onClick={sendAll}
                  className="flex-[2] py-2.5 rounded-md text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
                  style={{ background: "#059669" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Send {targets.filter(c => { const m = messages.find(m => m.customer_id === c.user_id); return m?.message && m.status !== "error"; }).length} Messages · ${(targets.length * 0.08).toFixed(2)}
                </button>
              </div>
            )}
            {step === "sending" && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                <div className="w-3.5 h-3.5 border border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                Sending {sentCount + 1} of {targets.length}
              </div>
            )}
            {step === "done" && <button onClick={onClose} className="w-full py-2.5 rounded-md text-sm font-semibold text-white transition-all" style={{ background: "#5B21B6" }}>Done</button>}
          </div>
        </div>
      </div>
    </>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("intervention_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const PER_PAGE = 50;
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/intelligence/at-risk-customers?venue_id=${VENUE_ID}`)
      .then(r => r.json()).then(d => setCustomers(d.customers || [])).catch(console.error).finally(() => setLoading(false));
  }, []);
 
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }
 
  const filtered = useMemo(() => {
    let f = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || (c.email && c.email.toLowerCase().includes(search.toLowerCase())));
    if (stateFilter !== "all") f = f.filter(c => c.markov_state === stateFilter);
    f.sort((a, b) => {
      let av: any = a[sortKey as keyof Customer]; let bv: any = b[sortKey as keyof Customer];
      if (sortKey === "potential_value") { av = parseFloat(av); bv = parseFloat(bv); }
      if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) av = -Infinity; if (bv == null) bv = -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return f;
  }, [customers, search, stateFilter, sortKey, sortDir]);
 
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
 
  function handleRowClick(c: Customer) {
    if (selectMode) { setSelected(prev => { const n = new Set(prev); n.has(c.user_id) ? n.delete(c.user_id) : n.add(c.user_id); return n; }); }
    else router.push(`/merchant/clients/${c.user_id}`);
  }
 
  function selectByState(state: string) { const ids = customers.filter(c => c.markov_state === state).map(c => c.user_id); setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; }); }
  function selectFiltered() { const ids = filtered.map(c => c.user_id); setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; }); }
  function clearSel() { setSelected(new Set()); }
  function exitSel() { setSelectMode(false); setSelected(new Set()); }
 
  const selectedWithPhone = customers.filter(c => selected.has(c.user_id) && c.phone && c.phone !== "No phone").length;
  const riskColor = (g: number) => g > 1.5 ? "#F43F5E" : g > 0.5 ? "#FB923C" : "#34D399";
 
  const SortArrow = ({ k }: { k: SortKey }) => sortKey !== k ? null : (
    <svg className="w-2.5 h-2.5 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
    </svg>
  );
 
  if (loading) return (
    <div className={`min-h-screen ${BG} flex items-center justify-center`}>
      <div className="text-center"><div className="w-10 h-10 border border-[#7C3AED]/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading clients</div></div>
    </div>
  );
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-28`}>
      {showModal && <PersonalisedSendModal selected={selected} customers={customers} onClose={() => setShowModal(false)} venueId={VENUE_ID} />}
 
      {/* Nav */}
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(10,6,18,0.97)" }}>
        <div className="max-w-[1800px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
            <div><div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none">Client Intelligence</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {[{ href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" }, { href: "/merchant/clients", label: "Clients", active: true }, { href: "/merchant/barber", label: "Barbers" }].map(tab => (
              <a key={tab.href} href={tab.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>{tab.label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[10px] text-slate-600">{customers.length.toLocaleString()} records</div>
            {selectMode ? (
              <button onClick={exitSel} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-400 border border-[#2A1852] hover:text-white hover:border-[#3A2268] transition-all">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Exit Selection
              </button>
            ) : (
              <button onClick={() => setSelectMode(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white transition-all" style={{ background: "rgba(91,33,182,0.2)", border: "1px solid rgba(91,33,182,0.35)" }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Select Clients
              </button>
            )}
          </div>
        </div>
      </div>
 
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        <div className="mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Canberra</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Client Intelligence</h1>
        </div>
 
        {/* Search + filter */}
        <div className="flex gap-3 mb-4">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, phone, or email..."
            className="flex-1 rounded-md px-4 py-2 text-sm text-white placeholder-slate-600 border border-[#2A1852] hover:border-[#3A2268] focus:border-[#7C3AED]/40 focus:outline-none transition-all" style={{ background: "#0F0A1E" }} />
          <div className="flex gap-1">
            {[["all","All"], ["X","Churned"], ["R_at_risk","At Risk"], ["R_on_fence","On Fence"], ["C","First Timer"], ["R_loyal","Loyal"]].map(([val, label]) => (
              <button key={val} onClick={() => { setStateFilter(val); setPage(1); }}
                className={`px-3 py-2 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${stateFilter === val ? "bg-[#5B21B6] text-white" : "text-slate-500 border border-[#2A1852] hover:text-white hover:border-[#3A2268]"}`}
                style={stateFilter !== val ? { background: "#0F0A1E" } : {}}>
                {label}
              </button>
            ))}
          </div>
        </div>
 
        {/* Select mode strip */}
        {selectMode && (
          <div className="rounded-lg border border-[#3A2268] px-5 py-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: "rgba(99,102,241,0.05)" }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#A78BFA] mr-1">Quick select</span>
            {[{ state: "X", label: "All Churned", hex: "#F43F5E" }, { state: "R_at_risk", label: "All At Risk", hex: "#FB923C" }, { state: "R_on_fence", label: "All On Fence", hex: "#FBBF24" }, { state: "C", label: "All First Timers", hex: "#38BDF8" }, { state: "R_loyal", label: "All Loyal", hex: "#34D399" }].map(({ state, label, hex }) => (
              <button key={state} onClick={() => selectByState(state)}
                className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all"
                style={{ background: `${hex}10`, border: `1px solid ${hex}25`, color: hex }}>
                {label} <span style={{ color: `${hex}60` }}>({customers.filter(c => c.markov_state === state).length})</span>
              </button>
            ))}
            <button onClick={selectFiltered} className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#3A2268] text-slate-400 hover:text-white transition-all" style={{ background: "#0F0A1E" }}>
              View ({filtered.length})
            </button>
            {selected.size > 0 && <button onClick={clearSel} className="ml-auto text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Clear selection</button>}
          </div>
        )}
 
        <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-4">
          {filtered.length.toLocaleString()} clients{selectMode && selected.size > 0 ? <span className="text-[#A78BFA] ml-2">· {selected.size} selected ({selectedWithPhone} with phone)</span> : ""}
          {!selectMode && " · click row to open profile · click header to sort"}
        </div>
 
        {/* Table */}
        <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F1829]" style={{ background: "#0F0A1E" }}>
                  {selectMode && <th className="px-4 py-3 w-8"><div className="w-3 h-3 rounded border border-[#2A1852]" /></th>}
                  {[
                    { l: "Client",       k: "name" as SortKey },
                    { l: "State",        k: null },
                    { l: "Gap Ratio",    k: "gap_ratio" as SortKey },
                    { l: "Days Overdue", k: "days_overdue" as SortKey },
                    { l: "Visits",       k: "visits" as SortKey },
                    { l: "CLV",          k: "potential_value" as SortKey },
                    { l: "Churn",        k: "churn_score" as SortKey },
                    { l: "ΔV",           k: "intervention_value" as SortKey },
                    { l: "Last Visit",   k: null },
                  ].map(({ l, k }) => (
                    <th key={l} onClick={() => k && toggleSort(k)}
                      className={`px-5 py-3 text-[9px] font-bold uppercase tracking-widest text-left text-slate-600 ${k ? "cursor-pointer hover:text-slate-300" : ""} transition-colors`}>
                      {l}{k && <SortArrow k={k} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => {
                  const sm = STATE_META[c.markov_state] || STATE_META.R_at_risk;
                  const isSel = selected.has(c.user_id);
                  const churnDisplay = c.churn_score ? (c.churn_score * 10).toFixed(1) : "—";
                  const churnColor = (c.churn_score || 0) > 0.5 ? "#F43F5E" : (c.churn_score || 0) > 0.3 ? "#FB923C" : "#34D399";
                  const lv = c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";
                  return (
                    <tr key={c.score_id} onClick={() => handleRowClick(c)}
                      className={`border-b border-[#0A0F1C] cursor-pointer transition-colors group ${isSel ? "bg-[#5B21B6]/[0.08]" : "hover:bg-white/[0.018]"}`}>
                      {selectMode && (
                        <td className="px-4 py-3.5">
                          <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all ${isSel ? "bg-[#5B21B6] border-[#7C3AED]" : "border-[#3A2268] hover:border-[#7C3AED]/50"}`}>
                            {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-md border flex items-center justify-center text-[9px] font-bold transition-all flex-shrink-0 ${isSel ? "bg-[#5B21B6]/30 border-[#7C3AED]/40 text-[#C4B5FD]" : "border-[#2A1852] text-slate-600 group-hover:border-[#3A2268]"}`} style={{ background: isSel ? undefined : "#0F0A1E" }}>
                            {c.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm text-white font-medium group-hover:text-indigo-100 transition-colors">{c.name}</div>
                            <div className="text-[10px] text-slate-600">{c.phone || "No phone"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: sm.hex }} />
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sm.hex }}>{sm.shortLabel}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium" style={{ color: riskColor(c.gap_ratio) }}>{c.gap_ratio.toFixed(2)}×</td>
                      <td className="px-5 py-3.5"><span className="text-sm text-white">{c.days_overdue}</span><span className="text-[9px] text-slate-600 ml-1">d</span></td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">{c.visits}</td>
                      <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">${c.potential_value}</td>
                      <td className="px-5 py-3.5"><span className="text-sm font-medium" style={{ color: churnColor }}>{churnDisplay}</span><span className="text-[9px] text-slate-600">/10</span></td>
                      <td className="px-5 py-3.5">{c.intervention_value > 0 ? <span className="text-xs font-bold text-emerald-400">+${c.intervention_value.toFixed(2)}</span> : <span className="text-[#162038]">—</span>}</td>
                      <td className="px-5 py-3.5 text-[10px] text-slate-600">{lv}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-[9px] font-bold uppercase tracking-widest text-slate-700">No clients found</div>}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#0F1829]" style={{ background: "#0F0A1E" }}>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider">{((page-1)*PER_PAGE)+1}–{Math.min(page*PER_PAGE,filtered.length)} of {filtered.length.toLocaleString()}</div>
              <div className="flex items-center gap-2">
                {[{ l: "←", a: () => setPage(p => Math.max(1,p-1)), d: page===1 }, { l: "→", a: () => setPage(p => Math.min(totalPages,p+1)), d: page===totalPages }].map(({ l, a, d }) => (
                  <button key={l} onClick={a} disabled={d} className="w-7 h-7 rounded border border-[#2A1852] text-slate-500 text-sm disabled:opacity-30 hover:border-[#3A2268] hover:text-white transition-all" style={{ background: "#0F0A1E" }}>{l}</button>
                ))}
                <span className="text-[9px] text-slate-600 px-1">{page}/{totalPages}</span>
              </div>
            </div>
          )}
        </div>
      </div>
 
      {/* Floating action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-4 rounded-xl px-6 py-3.5 border shadow-2xl" style={{ background: "#0C1120", borderColor: "#3A2268", boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(91,33,182,0.15)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[#5B21B6] flex items-center justify-center text-white font-bold text-xs">{selected.size}</div>
              <div>
                <div className="text-white font-semibold text-sm">{selected.size} clients selected</div>
                <div className="text-[10px] text-slate-600">{selectedWithPhone} reachable · ${(selectedWithPhone * 0.08).toFixed(2)} est.</div>
              </div>
            </div>
            <div className="w-px h-8 bg-[#162038]" />
            <div className="flex items-center gap-1.5">
              {Object.entries(STATE_META).map(([key, meta]) => {
                const count = customers.filter(c => selected.has(c.user_id) && c.markov_state === key).length;
                if (!count) return null;
                return <div key={key} className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: `${meta.hex}12`, color: meta.hex }}>{meta.shortLabel} {count}</div>;
              })}
            </div>
            <div className="w-px h-8 bg-[#162038]" />
            <div className="flex items-center gap-2">
              <button onClick={clearSel} className="px-3 py-1.5 rounded-md border border-[#2A1852] text-slate-500 hover:text-white text-xs font-medium transition-all hover:border-[#3A2268]">Clear</button>
              <button onClick={() => setShowModal(true)} disabled={selectedWithPhone === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-white text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: "#5B21B6", boxShadow: "0 4px 20px rgba(91,33,182,0.35)" }}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
                AI Personalise + Send {selectedWithPhone}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}