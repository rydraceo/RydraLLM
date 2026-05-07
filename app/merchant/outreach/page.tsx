"use client";
import { useState, useEffect } from "react";
 
const BG  = "bg-[#050810]";
const CARD = "bg-[#0C1120]";
const BDR  = "border-[#162038]";
const BDR2 = "border-[#1E2D4E]";
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
 
interface Message {
  id: string; customer_name: string; customer_phone: string;
  message: string; status: string; markov_state: string;
  gap_ratio: number; days_overdue: number; message_cost: string;
  created_at: string; customer_id: string;
}
 
export default function OutreachHistoryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/outreach/history?venue_id=${VENUE_ID}`)
      .then(r => r.json()).then(d => setMessages(d.messages || [])).catch(console.error).finally(() => setLoading(false));
  }, []);
 
  const filtered = messages.filter(m => {
    if (search && !m.customer_name?.toLowerCase().includes(search.toLowerCase()) && !m.customer_phone?.includes(search)) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (stateFilter !== "all" && m.markov_state !== stateFilter) return false;
    return true;
  });
 
  const totalCost = messages.reduce((s, m) => s + parseFloat(m.message_cost || "0"), 0);
  const delivered = messages.filter(m => ["delivered","queued","sent"].includes(m.status)).length;
  const failed = messages.filter(m => m.status === "failed").length;
 
  if (loading) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="w-10 h-10 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading outreach</div></div></div>;
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(5,8,16,0.96)" }}>
        <div className="max-w-[1600px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></div>
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none">Outreach History</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => <a key={tab.href} href={tab.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>{tab.label}</a>)}
          </nav>
        </div>
      </div>
 
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="mb-8">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Canberra</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SMS Outreach History</h1>
        </div>
 
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { l: "Total Sent",    v: messages.length, acc: "#6366F1" },
            { l: "Delivered",     v: delivered,         acc: "#34D399" },
            { l: "Failed",        v: failed,            acc: failed > 0 ? "#F43F5E" : "#162038" },
            { l: "Total Spend",   v: `$${totalCost.toFixed(2)}`, acc: "#FBBF24" },
          ].map(({ l, v, acc }) => (
            <div key={l} className={`${CARD} border ${BDR} rounded-xl p-5 relative overflow-hidden`}>
              <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
              <div className="pl-3"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{l}</div><div className="text-3xl font-bold tracking-tight text-white">{v}</div></div>
            </div>
          ))}
        </div>
 
        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
            className="flex-1 min-w-48 rounded-md px-4 py-2 text-sm text-white placeholder-slate-600 border border-[#162038] hover:border-[#1E2D4E] focus:border-indigo-500/40 focus:outline-none transition-all" style={{ background: "#090D1A" }} />
          <div className="flex gap-1">
            {[["all","All Status"],["delivered","Delivered"],["queued","Queued"],["failed","Failed"]].map(([v,l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`px-3 py-2 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${statusFilter === v ? "bg-indigo-600 text-white" : "border border-[#162038] text-slate-500 hover:text-slate-200"}`}
                style={statusFilter !== v ? { background: "#090D1A" } : {}}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[["all","All States"],["X","Churned"],["R_at_risk","At Risk"],["R_on_fence","On Fence"],["C","First Timer"],["R_loyal","Loyal"]].map(([v,l]) => (
              <button key={v} onClick={() => setStateFilter(v)}
                className={`px-3 py-2 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${stateFilter === v ? "bg-indigo-600 text-white" : "border border-[#162038] text-slate-500 hover:text-slate-200"}`}
                style={stateFilter !== v ? { background: "#090D1A" } : {}}>{l}</button>
            ))}
          </div>
        </div>
 
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">{filtered.length.toLocaleString()} messages</div>
 
        {/* Table */}
        <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F1829]" style={{ background: "#090D1A" }}>
                  {["Client","State","Status","Gap","Overdue","Cost","Sent","Message"].map((h,i) => (
                    <th key={h} className={`px-5 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600 ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const sm = STATE_META[m.markov_state] || { label: m.markov_state || "—", hex: "#6366F1" };
                  const isDelivered = ["delivered","queued","sent"].includes(m.status);
                  const isExp = expanded === m.id;
                  return (
                    <>
                      <tr key={m.id} onClick={() => setExpanded(isExp ? null : m.id)}
                        className="border-b border-[#0A0F1C] hover:bg-white/[0.02] cursor-pointer transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-medium text-white">{m.customer_name || "Unknown"}</div>
                          <div className="text-[10px] text-slate-600">{m.customer_phone || "—"}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: sm.hex }} />
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sm.hex }}>{sm.label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: isDelivered ? "#34D399" : "#F43F5E" }} />
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: isDelivered ? "#34D399" : "#F43F5E" }}>{m.status}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm" style={{ color: m.gap_ratio > 1.5 ? "#F43F5E" : m.gap_ratio > 1 ? "#FB923C" : "#34D399" }}>{m.gap_ratio?.toFixed(2) || "—"}×</td>
                        <td className="px-5 py-3.5 text-right text-sm text-slate-400">{m.days_overdue || 0}<span className="text-[9px] text-slate-700">d</span></td>
                        <td className="px-5 py-3.5 text-right text-[10px] text-slate-600">${m.message_cost || "0.08"}</td>
                        <td className="px-5 py-3.5 text-right text-[10px] text-slate-600">{new Date(m.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-[10px] text-indigo-400">{isExp ? "Hide ↑" : "Show ↓"}</span>
                        </td>
                      </tr>
                      {isExp && (
                        <tr key={`${m.id}-exp`} className="border-b border-[#0A0F1C]">
                          <td colSpan={8} className="px-5 py-4" style={{ background: "#090D1A" }}>
                            <div className="flex items-start gap-4">
                              <div className="flex-1">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Message</div>
                                <div className="rounded-lg p-3 border border-[#162038] text-sm text-slate-300 leading-relaxed" style={{ background: "#0C1120" }}>{m.message}</div>
                              </div>
                              <a href={`/merchant/clients/${m.customer_id}`} className="flex-shrink-0 px-3.5 py-1.5 rounded-md text-[10px] font-semibold text-indigo-400 border border-[#1E2D4E] hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all" style={{ background: "#090D1A" }}>View Client →</a>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-[9px] font-bold uppercase tracking-widest text-slate-700">{messages.length === 0 ? "No messages sent yet" : "No messages match filters"}</div>}
        </div>
      </div>
    </div>
  );
}