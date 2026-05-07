"use client";
 
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
 
// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  score_id: string; user_id: string; name: string; phone: string; email: string | null;
  gap_ratio: number; days_overdue: number; visits: number; potential_value: string;
  churn_score: number | null; loyalty_score: number | null;
  intervention_value: number; markov_state: string; risk_segment: string;
  avg_gap_days: number; last_visit: string;
}
 
interface GeneratedMsg {
  customer_id: string;
  message: string;
  status: "pending" | "generating" | "done" | "error" | "sent" | "sending";
}
 
// ─── Constants ────────────────────────────────────────────────────────────────
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard",  icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/merchant/outreach",  label: "Outreach",   icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { href: "/merchant/campaign",  label: "Campaign",   icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  { href: "/merchant/clients",   label: "Clients",    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", active: true },
  { href: "/merchant/barber",    label: "Barbers",    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];
 
const STATE_META: Record<string, { label: string; cls: string; color: string; emoji: string }> = {
  C:          { label: "First Timer", cls: "bg-blue-900/40 border-blue-600/50 text-blue-400",     color: "text-blue-400",   emoji: "🌱" },
  X:          { label: "Churned",     cls: "bg-red-900/40 border-red-600/50 text-red-400",         color: "text-red-400",    emoji: "⚠️" },
  R_at_risk:  { label: "At Risk",     cls: "bg-orange-900/40 border-orange-600/50 text-orange-400", color: "text-orange-400", emoji: "🔥" },
  R_on_fence: { label: "On Fence",    cls: "bg-yellow-900/40 border-yellow-600/50 text-yellow-400", color: "text-yellow-400", emoji: "⚖️" },
  R_loyal:    { label: "Loyal",       cls: "bg-green-900/40 border-green-600/50 text-green-400",   color: "text-green-400",  emoji: "⭐" },
};
 
type SortKey = "name" | "gap_ratio" | "days_overdue" | "potential_value" | "churn_score" | "intervention_value" | "visits";
 
// ─── Personalised Bulk Send Modal ─────────────────────────────────────────────
function PersonalisedSendModal({
  selected, customers, onClose, venueId,
}: {
  selected: Set<string>; customers: Customer[]; onClose: () => void; venueId: string;
}) {
  const targets = customers.filter(c => selected.has(c.user_id) && c.phone && c.phone !== "No phone");
  const noPhone = customers.filter(c => selected.has(c.user_id) && (!c.phone || c.phone === "No phone"));
 
  const [step, setStep] = useState<"review" | "generating" | "send" | "sending" | "done">("review");
  const [messages, setMessages] = useState<GeneratedMsg[]>(
    targets.map(c => ({ customer_id: c.user_id, message: "", status: "pending" }))
  );
  const [genProgress, setGenProgress] = useState(0);
  const [sendProgress, setSendProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
 
  const generated = messages.filter(m => m.status === "done" || m.status === "sent" || m.status === "sending").length;
  const allGenerated = messages.every(m => m.status === "done" || m.status === "sent" || m.status === "sending" || m.status === "error");
 
  async function generateAll() {
    setStep("generating");
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, status: "generating" } : m));
      try {
        const res = await fetch("/api/ai/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: {
              name: c.name, phone: c.phone, markov_state: c.markov_state,
              gap_ratio: c.gap_ratio, days_overdue: c.days_overdue,
              visits: c.visits, potential_value: c.potential_value,
              intervention_value: c.intervention_value, risk_segment: c.risk_segment,
            },
          }),
        });
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.customer_id === c.user_id ? { ...m, message: data.message || "", status: "done" } : m
        ));
      } catch {
        setMessages(prev => prev.map(m =>
          m.customer_id === c.user_id ? { ...m, status: "error" } : m
        ));
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
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: c.phone, message: msg.message,
            customer_name: c.name, customer_id: c.user_id,
            venue_id: venueId, markov_state: c.markov_state,
            risk_segment: c.risk_segment, gap_ratio: c.gap_ratio,
            days_overdue: c.days_overdue,
          }),
        });
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
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={step === "done" ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-purple-700/40 shadow-2xl overflow-hidden" style={{ background: "linear-gradient(180deg,#0d0122,#130828)" }}>
 
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-purple-800/40 bg-purple-900/30 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg">Personalised Bulk SMS</h2>
                <p className="text-purple-400 text-xs">AI writes a unique message for each client — not a template</p>
              </div>
            </div>
            {step !== "generating" && step !== "sending" && (
              <button onClick={onClose} className="w-8 h-8 rounded-lg bg-purple-900/50 flex items-center justify-center text-purple-400 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
 
          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-purple-800/30 bg-purple-950/30 flex-shrink-0">
            {[
              { label: "Selected", value: selected.size, color: "text-white" },
              { label: "Reachable", value: targets.length, color: "text-green-400" },
              { label: "No phone", value: noPhone.length, color: noPhone.length > 0 ? "text-red-400" : "text-purple-600" },
              { label: "Est. cost", value: `$${(targets.length * 0.08).toFixed(2)}`, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-purple-900/30 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-purple-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
 
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
 
            {/* Step: Review / Send */}
            {(step === "review" || step === "generating" || step === "send" || step === "sending" || step === "done") && (
              <>
                {/* No phone warning */}
                {noPhone.length > 0 && (
                  <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-red-400 text-xs"><span className="font-semibold">{noPhone.length} clients</span> will be skipped — no phone number on file.</p>
                  </div>
                )}
 
                {/* Progress bar for generating */}
                {step === "generating" && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-300 text-sm font-medium">Generating personalised messages...</span>
                      <span className="text-purple-400 text-sm">{generated}/{targets.length}</span>
                    </div>
                    <div className="h-2 bg-purple-900/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-300" style={{ width: `${genProgress}%` }} />
                    </div>
                    <p className="text-purple-500 text-xs mt-2">Each message is unique — personalised with name, visit history, and Markov state strategy</p>
                  </div>
                )}
 
                {/* Sending progress */}
                {step === "sending" && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-purple-300 text-sm font-medium">Sending messages...</span>
                      <span className="text-purple-400 text-sm">{sentCount}/{targets.length}</span>
                    </div>
                    <div className="h-2 bg-purple-900/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-600 to-emerald-600 rounded-full transition-all duration-300" style={{ width: `${sendProgress}%` }} />
                    </div>
                  </div>
                )}
 
                {/* Done banner */}
                {step === "done" && (
                  <div className="bg-green-900/30 border border-green-600/40 rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
                    <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <div><div className="text-green-400 font-semibold">All messages sent!</div><div className="text-green-600 text-xs">{sentCount} personalised SMS delivered · ${(sentCount * 0.08).toFixed(2)} total cost</div></div>
                  </div>
                )}
 
                {/* Client message list */}
                <div className="space-y-3">
                  {targets.map(c => {
                    const msg = messages.find(m => m.customer_id === c.user_id);
                    const sm = STATE_META[c.markov_state] || STATE_META.R_at_risk;
                    const isEditing = editingId === c.user_id;
                    return (
                      <div key={c.user_id} className="bg-purple-900/20 border border-purple-800/30 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-800/60 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
                            {c.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-medium text-sm">{c.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sm.cls}`}>{sm.emoji} {sm.label}</span>
                              {msg?.status === "sent" && <span className="text-xs text-green-400 font-medium flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Sent</span>}
                              {msg?.status === "sending" && <span className="text-xs text-blue-400 animate-pulse">Sending...</span>}
                              {msg?.status === "error" && <span className="text-xs text-red-400">Failed</span>}
                            </div>
                            <div className="text-purple-500 text-xs">{c.phone} · {c.days_overdue}d overdue · CLV ${c.potential_value}</div>
                          </div>
                          {/* Status icon */}
                          <div className="flex-shrink-0">
                            {msg?.status === "pending" && <div className="w-6 h-6 rounded-full bg-purple-800/40 border border-purple-700/40" />}
                            {msg?.status === "generating" && <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />}
                            {msg?.status === "done" && <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>}
                            {msg?.status === "sent" && <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>}
                          </div>
                        </div>
 
                        {/* Message preview / edit */}
                        {msg?.message && (
                          <div className="ml-12">
                            {isEditing ? (
                              <div>
                                <textarea
                                  value={msg.message}
                                  onChange={e => setMessages(prev => prev.map(m => m.customer_id === c.user_id ? { ...m, message: e.target.value } : m))}
                                  rows={3}
                                  maxLength={160}
                                  className="w-full bg-purple-900/40 border border-purple-600/50 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                                />
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-purple-600 text-xs">{msg.message.length}/160</span>
                                  <button onClick={() => setEditingId(null)} className="text-xs text-purple-400 hover:text-white">Done editing</button>
                                </div>
                              </div>
                            ) : (
                              <div className="relative group">
                                <div className="bg-green-600 rounded-2xl rounded-tl-sm px-3 py-2 inline-block max-w-full">
                                  <p className="text-white text-xs leading-relaxed">{msg.message}</p>
                                </div>
                                {(step === "send") && (
                                  <button onClick={() => setEditingId(c.user_id)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-purple-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {msg?.status === "pending" && (
                          <div className="ml-12 h-8 bg-purple-900/30 rounded-xl animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
 
          {/* Footer actions */}
          <div className="flex-shrink-0 border-t border-purple-800/40 px-6 py-4 bg-purple-950/30">
            {step === "review" && (
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-purple-700/40 text-purple-400 text-sm font-medium hover:text-white hover:bg-purple-900/30 transition-all">Cancel</button>
                <button onClick={generateAll} disabled={targets.length === 0}
                  className="flex-[3] py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-purple-500/20">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
                  Generate {targets.length} Personalised Messages
                </button>
              </div>
            )}
            {step === "generating" && (
              <div className="flex items-center justify-center gap-2 py-3 text-purple-400 text-sm">
                <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                Writing personalised message {generated + 1} of {targets.length}...
              </div>
            )}
            {step === "send" && (
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-purple-700/40 text-purple-400 text-sm font-medium hover:text-white transition-all">Cancel</button>
                <button onClick={generateAll} className="flex-1 py-3 rounded-xl border border-purple-600/50 text-purple-300 text-sm font-medium hover:bg-purple-900/30 transition-all flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Regenerate All
                </button>
                <button onClick={sendAll}
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Send {targets.filter(c => { const m = messages.find(m => m.customer_id === c.user_id); return m?.message && m.status !== "error"; }).length} Messages · ${(targets.length * 0.08).toFixed(2)}
                </button>
              </div>
            )}
            {step === "sending" && (
              <div className="flex items-center justify-center gap-2 py-3 text-purple-400 text-sm">
                <div className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                Sending {sentCount + 1} of {targets.length}...
              </div>
            )}
            {step === "done" && (
              <button onClick={onClose} className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all">Done</button>
            )}
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
 
  // Selection state
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
    let f = customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
    );
    if (stateFilter !== "all") f = f.filter(c => c.markov_state === stateFilter);
    f.sort((a, b) => {
      let av: any = a[sortKey as keyof Customer];
      let bv: any = b[sortKey as keyof Customer];
      if (sortKey === "potential_value") { av = parseFloat(av); bv = parseFloat(bv); }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return f;
  }, [customers, search, stateFilter, sortKey, sortDir]);
 
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
 
  // Selection helpers
  function toggleSelect(userId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }
 
  function selectByState(state: string) {
    const ids = customers.filter(c => c.markov_state === state).map(c => c.user_id);
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }
 
  function selectFiltered() {
    const ids = filtered.map(c => c.user_id);
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }
 
  function clearSelection() { setSelected(new Set()); }
 
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()); }
 
  function handleRowClick(c: Customer) {
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(c.user_id) ? next.delete(c.user_id) : next.add(c.user_id);
        return next;
      });
    } else {
      router.push(`/merchant/clients/${c.user_id}`);
    }
  }
 
  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? null : (
    <svg className="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
    </svg>
  );
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
 
  const selectedWithPhone = customers.filter(c => selected.has(c.user_id) && c.phone && c.phone !== "No phone").length;
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-32">
      {showModal && (
        <PersonalisedSendModal
          selected={selected}
          customers={customers}
          onClose={() => setShowModal(false)}
          venueId={VENUE_ID}
        />
      )}
 
      {/* Header */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-8 py-5 flex items-center gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div><h1 className="text-2xl font-semibold">Client Intelligence</h1><p className="text-purple-300 text-xs">Full client profiles · {customers.length.toLocaleString()} records · Alkami Barbershop</p></div>
          </div>
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            {NAV.map(tab => (
              <a key={tab.href} href={tab.href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${(tab as any).active ? "bg-purple-600 text-white" : "text-purple-300 hover:text-white hover:bg-purple-800/50"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
                {tab.label}
              </a>
            ))}
          </div>
          {/* Select mode toggle */}
          <div className="ml-auto flex-shrink-0">
            {selectMode ? (
              <button onClick={exitSelectMode} className="flex items-center gap-2 px-4 py-2.5 border border-purple-600/50 bg-purple-900/30 hover:bg-purple-800/40 rounded-xl text-purple-300 hover:text-white text-sm font-medium transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Exit Selection
              </button>
            ) : (
              <button onClick={() => setSelectMode(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white text-sm font-semibold transition-all shadow-lg shadow-purple-500/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Select Clients
              </button>
            )}
          </div>
        </div>
      </div>
 
      <div className="max-w-[1800px] mx-auto px-8 py-8">
 
        {/* Search + filter */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, phone, or email..."
            className="flex-1 bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
          <div className="flex gap-2 flex-wrap">
            {[["all", "All"], ["X", "Churned"], ["R_at_risk", "At Risk"], ["R_on_fence", "On Fence"], ["C", "First Timer"], ["R_loyal", "Loyal"]].map(([val, label]) => (
              <button key={val} onClick={() => { setStateFilter(val); setPage(1); }}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${stateFilter === val ? "bg-purple-600 border-purple-500 text-white" : "border-purple-800/40 text-purple-400 hover:text-white hover:bg-purple-800/40"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
 
        {/* Select mode quick-select strip */}
        {selectMode && (
          <div className="bg-purple-950/50 border border-purple-700/40 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-purple-300 text-xs font-semibold uppercase tracking-wider mr-2">Quick Select:</span>
              {[
                { state: "X",          label: "All Churned",     emoji: "⚠️", color: "border-red-700/50 text-red-400 hover:bg-red-900/30" },
                { state: "R_at_risk",  label: "All At Risk",     emoji: "🔥", color: "border-orange-700/50 text-orange-400 hover:bg-orange-900/30" },
                { state: "R_on_fence", label: "All On Fence",    emoji: "⚖️", color: "border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/30" },
                { state: "C",          label: "All First Timers",emoji: "🌱", color: "border-blue-700/50 text-blue-400 hover:bg-blue-900/30" },
                { state: "R_loyal",    label: "All Loyal",       emoji: "⭐", color: "border-green-700/50 text-green-400 hover:bg-green-900/30" },
              ].map(({ state, label, emoji, color }) => (
                <button key={state} onClick={() => selectByState(state)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${color}`}>
                  {emoji} {label}
                  <span className="ml-1 text-purple-500">({customers.filter(c => c.markov_state === state).length})</span>
                </button>
              ))}
              <button onClick={selectFiltered} className="px-3 py-1.5 rounded-xl border border-purple-600/50 text-purple-300 text-xs font-medium hover:bg-purple-800/30 transition-all">
                Select current view ({filtered.length})
              </button>
              {selected.size > 0 && (
                <button onClick={clearSelection} className="px-3 py-1.5 rounded-xl border border-purple-800/40 text-purple-500 text-xs hover:text-purple-300 transition-all ml-auto">
                  Clear selection
                </button>
              )}
            </div>
            {selected.size > 0 && (
              <div className="mt-3 pt-3 border-t border-purple-800/30 flex items-center gap-2 text-xs">
                <span className="text-purple-300 font-medium">{selected.size} selected</span>
                <span className="text-purple-600">·</span>
                <span className="text-green-400 font-medium">{selectedWithPhone} with phone</span>
                <span className="text-purple-600">·</span>
                <span className="text-purple-400">Click rows to toggle · Click column headers to sort</span>
              </div>
            )}
          </div>
        )}
 
        <div className="text-xs text-purple-500 mb-4">
          Showing {filtered.length.toLocaleString()} clients
          {selectMode ? <span className="ml-2 text-purple-400">· <span className="text-purple-200 font-medium">Selection mode active</span> — click any row to select</span> : <span> · Click any row for full profile · Sort by column header</span>}
        </div>
 
        {/* Table */}
        <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-purple-800/30 bg-purple-900/30">
                  {selectMode && (
                    <th className="px-4 py-4 w-10">
                      <div className="w-4 h-4 rounded border border-purple-600/50" />
                    </th>
                  )}
                  {[
                    { label: "Client",       key: "name" as SortKey },
                    { label: "State",        key: null },
                    { label: "Gap Ratio",    key: "gap_ratio" as SortKey },
                    { label: "Days Overdue", key: "days_overdue" as SortKey },
                    { label: "Visits",       key: "visits" as SortKey },
                    { label: "CLV",          key: "potential_value" as SortKey },
                    { label: "Churn",        key: "churn_score" as SortKey },
                    { label: "ΔV",           key: "intervention_value" as SortKey },
                    { label: "Last Visit",   key: null },
                  ].map(({ label, key }) => (
                    <th key={label} onClick={() => key && toggleSort(key)}
                      className={`px-5 py-4 text-xs font-semibold text-purple-300 uppercase tracking-wider text-left ${key ? "cursor-pointer hover:text-white" : ""}`}>
                      {label}{key && <SortIcon k={key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => {
                  const meta = STATE_META[c.markov_state] || STATE_META.R_at_risk;
                  const isSelected = selected.has(c.user_id);
                  const churnDisplay = c.churn_score ? (c.churn_score * 10).toFixed(1) : "—";
                  const churnColor = (c.churn_score || 0) > 0.5 ? "text-red-400" : (c.churn_score || 0) > 0.3 ? "text-orange-400" : "text-green-400";
                  const lastVisit = c.last_visit ? new Date(c.last_visit).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";
                  return (
                    <tr key={c.score_id}
                      onClick={() => handleRowClick(c)}
                      className={`border-b border-purple-800/20 cursor-pointer transition-colors group ${isSelected ? "bg-purple-600/20 border-purple-600/30" : "hover:bg-purple-900/30"}`}>
                      {selectMode && (
                        <td className="px-4 py-3.5" onClick={e => toggleSelect(c.user_id, e)}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-purple-600 border-purple-500" : "border-purple-600/50 hover:border-purple-500"}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${isSelected ? "bg-purple-600 text-white" : "bg-purple-800/60 text-purple-300 group-hover:bg-purple-700/60"}`}>
                            {c.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div>
                            <div className={`font-medium text-sm transition-colors ${isSelected ? "text-purple-200" : "text-white group-hover:text-purple-200"}`}>{c.name}</div>
                            <div className="text-purple-500 text-xs">{c.phone || "No phone"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}>{meta.emoji} {meta.label}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-medium ${c.gap_ratio > 1.5 ? "text-red-400" : c.gap_ratio > 1.0 ? "text-orange-400" : "text-green-400"}`}>{c.gap_ratio.toFixed(2)}x</span>
                      </td>
                      <td className="px-5 py-3.5 text-white text-sm">{c.days_overdue}<span className="text-purple-500 text-xs ml-1">d</span></td>
                      <td className="px-5 py-3.5 text-white text-sm">{c.visits}</td>
                      <td className="px-5 py-3.5 text-green-400 font-semibold text-sm">${c.potential_value}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-medium ${churnColor}`}>{churnDisplay}</span>
                        <span className="text-purple-600 text-xs">/10</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {c.intervention_value > 0
                          ? <span className="text-green-400 text-sm font-semibold">+${c.intervention_value.toFixed(2)}</span>
                          : <span className="text-purple-600 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-purple-400 text-xs">{lastVisit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-16 text-purple-500">No clients found.</div>}
          {filtered.length > 0 && (
            <div className="border-t border-purple-800/30 bg-purple-900/20 px-6 py-4 flex items-center justify-between">
              <div className="text-xs text-purple-400">Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length.toLocaleString()}</div>
              <div className="flex items-center gap-2">
                {[{ l: "Prev", a: () => setPage(p => Math.max(1, p - 1)), d: page === 1 }, { l: "Next", a: () => setPage(p => Math.min(totalPages, p + 1)), d: page === totalPages }].map(({ l, a, d }) => (
                  <button key={l} onClick={a} disabled={d} className="px-3 py-1.5 rounded-lg bg-purple-900/30 border border-purple-700/50 text-white text-xs disabled:opacity-30 hover:bg-purple-800/40">{l}</button>
                ))}
                <span className="text-purple-400 text-xs">{page} / {totalPages}</span>
              </div>
            </div>
          )}
        </div>
      </div>
 
      {/* ── Floating action bar (selection mode) ── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-4 bg-gradient-to-r from-purple-900 to-purple-800 border border-purple-600/60 rounded-2xl px-6 py-4 shadow-2xl shadow-purple-500/30 backdrop-blur-sm">
            {/* Count */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">{selected.size}</div>
              <div>
                <div className="text-white font-semibold text-sm">{selected.size} clients selected</div>
                <div className="text-purple-400 text-xs">{selectedWithPhone} with phone · ${(selectedWithPhone * 0.08).toFixed(2)} estimated cost</div>
              </div>
            </div>
            <div className="h-8 w-px bg-purple-700/60" />
            {/* Segment counts */}
            <div className="flex items-center gap-2">
              {Object.entries(STATE_META).map(([key, meta]) => {
                const count = customers.filter(c => selected.has(c.user_id) && c.markov_state === key).length;
                if (count === 0) return null;
                return <div key={key} className={`text-xs font-medium px-2 py-1 rounded-lg bg-purple-900/60 ${meta.color}`}>{meta.emoji} {count}</div>;
              })}
            </div>
            <div className="h-8 w-px bg-purple-700/60" />
            {/* Actions */}
            <div className="flex items-center gap-2">
              <button onClick={clearSelection} className="px-3 py-2 rounded-xl border border-purple-700/50 text-purple-400 hover:text-white text-xs font-medium transition-all">
                Clear
              </button>
              <button onClick={() => setShowModal(true)} disabled={selectedWithPhone === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-purple-500/20">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
                AI Personalise + Send {selectedWithPhone} Messages
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}