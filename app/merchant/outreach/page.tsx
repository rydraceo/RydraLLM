"use client";
 
import { useState, useEffect, useMemo } from "react";
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface OutreachRecord {
  id: string;
  venue_id: string;
  customer_id: string | null;
  customer_name: string | null;
  phone: string | null;
  message: string;
  status: string;
  message_id: string | null;
  cost: number | null;
  markov_state: string | null;
  risk_segment: string | null;
  gap_ratio: number | null;
  days_overdue: number | null;
  sent_at: string;
}
 
interface Stats {
  total: number;
  sent: number;
  failed: number;
  totalCost: number;
  byState: Record<string, number>;
}
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
const MARKOV_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  C:          { label: "First Timer",   color: "text-blue-400",   bg: "bg-blue-900/30",   border: "border-blue-600/40" },
  X:          { label: "Churned",       color: "text-red-400",    bg: "bg-red-900/30",    border: "border-red-600/40" },
  R_at_risk:  { label: "At Risk",       color: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-600/40" },
  R_on_fence: { label: "On the Fence",  color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-600/40" },
  R_loyal:    { label: "Loyal",         color: "text-green-400",  bg: "bg-green-900/30",  border: "border-green-600/40" },
};
 
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
 
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
 
// ─── Expanded Message Modal ───────────────────────────────────────────────────
 
function MessageModal({ record, onClose }: { record: OutreachRecord; onClose: () => void }) {
  const state = record.markov_state ? MARKOV_LABELS[record.markov_state] : null;
 
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
 
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-purple-700/40 overflow-hidden shadow-2xl"
          style={{ background: "linear-gradient(135deg, #0d0122 0%, #130828 100%)" }}>
 
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-purple-800/40 bg-gradient-to-r from-purple-900/40 to-pink-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold">
                {(record.customer_name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div>
                <h3 className="text-white font-semibold">{record.customer_name || "Unknown"}</h3>
                <p className="text-purple-400 text-xs">{record.phone}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-purple-900/50 hover:bg-purple-800/60 flex items-center justify-center text-purple-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
 
          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Meta row */}
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                record.status === "failed"
                  ? "bg-red-900/40 border-red-600/40 text-red-400"
                  : "bg-green-900/40 border-green-600/40 text-green-400"
              }`}>
                {record.status === "failed" ? "Failed" : "Sent"}
              </span>
              {state && (
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${state.bg} ${state.border} ${state.color}`}>
                  {state.label}
                </span>
              )}
              {record.cost && (
                <span className="text-xs px-2.5 py-1 rounded-full border border-purple-700/40 bg-purple-900/30 text-purple-300">
                  ${record.cost.toFixed(4)} AUD
                </span>
              )}
              <span className="text-xs text-purple-500 ml-auto">{formatDate(record.sent_at)}</span>
            </div>
 
            {/* Stats */}
            {(record.gap_ratio !== null || record.days_overdue !== null) && (
              <div className="grid grid-cols-3 gap-2">
                {record.gap_ratio !== null && (
                  <div className="bg-purple-900/30 rounded-xl p-2.5 text-center">
                    <div className="text-orange-400 font-bold text-sm">{record.gap_ratio.toFixed(1)}x</div>
                    <div className="text-purple-500 text-xs">Gap Ratio</div>
                  </div>
                )}
                {record.days_overdue !== null && (
                  <div className="bg-purple-900/30 rounded-xl p-2.5 text-center">
                    <div className="text-red-400 font-bold text-sm">{record.days_overdue}</div>
                    <div className="text-purple-500 text-xs">Days Overdue</div>
                  </div>
                )}
                {record.risk_segment && (
                  <div className="bg-purple-900/30 rounded-xl p-2.5 text-center">
                    <div className="text-purple-300 font-bold text-xs truncate">{record.risk_segment}</div>
                    <div className="text-purple-500 text-xs">Segment</div>
                  </div>
                )}
              </div>
            )}
 
            {/* Message */}
            <div>
              <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Message sent</p>
              <div className="bg-gray-950 rounded-2xl p-4 border border-gray-800/80">
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-green-600 rounded-2xl rounded-tr-sm px-3 py-2">
                    <p className="text-white text-sm leading-relaxed">{record.message}</p>
                  </div>
                </div>
              </div>
            </div>
 
            {record.message_id && (
              <p className="text-xs text-purple-600">Message ID: {record.message_id}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
 
export default function OutreachPage() {
  const [outreach, setOutreach] = useState<OutreachRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<OutreachRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterState, setFilterState] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
 
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => { fetchOutreach(); }, []);
 
  async function fetchOutreach() {
    try {
      const res = await fetch(`/api/outreach/history?venue_id=${VENUE_ID}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOutreach(data.outreach || []);
      setStats(data.stats || null);
    } catch (e) {
      console.error("[Outreach Page]", e);
    } finally {
      setLoading(false);
    }
  }
 
  const filtered = useMemo(() => {
    return outreach.filter(r => {
      const matchesSearch =
        !searchTerm ||
        r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.phone?.includes(searchTerm) ||
        r.message.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesState = filterState === "all" || r.markov_state === filterState;
      const matchesStatus = filterStatus === "all" || r.status === filterStatus;
      return matchesSearch && matchesState && matchesStatus;
    });
  }, [outreach, searchTerm, filterState, filterStatus]);
 
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-light">Loading outreach history...</p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
 
      {selectedRecord && (
        <MessageModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
 
      {/* Header */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Outreach History</h1>
              <p className="text-purple-300 text-xs">All SMS campaigns · Alkami Barbershop</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchOutreach}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-900/40 hover:bg-purple-800/50 border border-purple-700/40 hover:border-purple-600/60 rounded-xl transition-all text-sm text-purple-300 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <a
              href="/merchant/dashboard"
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl transition-all text-sm font-medium shadow-lg shadow-purple-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Dashboard
            </a>
          </div>
        </div>
      </div>
 
      <div className="max-w-[1800px] mx-auto px-8 py-8">
 
        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-2xl p-6 border border-purple-700/30">
              <div className="text-purple-300 text-xs uppercase tracking-wider mb-1">Total Sent</div>
              <div className="text-4xl font-bold text-white">{stats.total.toLocaleString()}</div>
              <div className="text-xs text-purple-400 mt-2">All time messages</div>
            </div>
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-2xl p-6 border border-green-700/30">
              <div className="text-green-300 text-xs uppercase tracking-wider mb-1">Delivered</div>
              <div className="text-4xl font-bold text-white">{stats.sent.toLocaleString()}</div>
              <div className="text-xs text-green-400 mt-2">
                {stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(0) : 0}% success rate
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 rounded-2xl p-6 border border-red-700/30">
              <div className="text-red-300 text-xs uppercase tracking-wider mb-1">Failed</div>
              <div className="text-4xl font-bold text-white">{stats.failed.toLocaleString()}</div>
              <div className="text-xs text-red-400 mt-2">
                {stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(0) : 0}% failure rate
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 rounded-2xl p-6 border border-amber-700/30">
              <div className="text-amber-300 text-xs uppercase tracking-wider mb-1">Total Cost</div>
              <div className="text-4xl font-bold text-white">${stats.totalCost.toFixed(2)}</div>
              <div className="text-xs text-amber-400 mt-2">
                {stats.total > 0 ? `~$${(stats.totalCost / stats.total).toFixed(4)} per SMS` : "No messages yet"}
              </div>
            </div>
          </div>
        )}
 
        {/* Segment breakdown */}
        {stats && Object.keys(stats.byState).length > 0 && (
          <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 rounded-2xl border border-purple-800/30 p-6 mb-8">
            <h2 className="text-base font-semibold text-white mb-4">Messages by Markov State</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.byState).map(([state, count]) => {
                const meta = MARKOV_LABELS[state];
                if (!meta) return null;
                return (
                  <div key={state} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${meta.bg} ${meta.border}`}>
                    <span className={`text-sm font-semibold ${meta.color}`}>{count}</span>
                    <span className="text-purple-300 text-sm">{meta.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
 
        {/* Filters */}
        <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-5 mb-5">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by name, phone, or message..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <select value={filterState} onChange={e => setFilterState(e.target.value)}
              className="bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-sm">
              <option value="all">All Markov States</option>
              <option value="C">First Timer</option>
              <option value="R_at_risk">At Risk</option>
              <option value="R_on_fence">On the Fence</option>
              <option value="R_loyal">Loyal</option>
              <option value="X">Churned</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-purple-900/30 border border-purple-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-sm">
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="mt-3 text-xs text-purple-400">
            Showing {filtered.length.toLocaleString()} of {outreach.length.toLocaleString()} messages
          </div>
        </div>
 
        {/* Table */}
        <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 overflow-hidden">
 
          {outreach.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-16 h-16 rounded-2xl bg-purple-900/40 border border-purple-700/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-purple-400 font-medium">No messages sent yet</p>
              <p className="text-purple-600 text-sm mt-1">Messages will appear here after you send your first SMS from the dashboard.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-purple-800/30 bg-purple-900/30">
                    {["Client", "Markov State", "Message", "Status", "Cost", "Sent"].map((h, i) => (
                      <th key={h} className={`px-6 py-4 text-xs font-semibold text-purple-300 uppercase tracking-wider ${i >= 3 ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(record => {
                    const state = record.markov_state ? MARKOV_LABELS[record.markov_state] : null;
                    const isFailed = record.status === "failed";
                    return (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className="border-b border-purple-800/20 hover:bg-purple-900/20 transition-colors cursor-pointer"
                      >
                        {/* Client */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-800/60 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
                              {(record.customer_name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <div>
                              <div className="text-white font-medium text-sm">{record.customer_name || "Unknown"}</div>
                              <div className="text-xs text-purple-400">{record.phone}</div>
                            </div>
                          </div>
                        </td>
 
                        {/* Markov State */}
                        <td className="px-6 py-4">
                          {state ? (
                            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${state.bg} ${state.border} ${state.color}`}>
                              {state.label}
                            </span>
                          ) : (
                            <span className="text-purple-600 text-xs">—</span>
                          )}
                        </td>
 
                        {/* Message preview */}
                        <td className="px-6 py-4 max-w-xs">
                          <p className="text-purple-200 text-sm truncate">{record.message}</p>
                        </td>
 
                        {/* Status */}
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                            isFailed
                              ? "bg-red-900/40 border-red-600/40 text-red-400"
                              : "bg-green-900/40 border-green-600/40 text-green-400"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isFailed ? "bg-red-400" : "bg-green-400"}`} />
                            {isFailed ? "Failed" : "Sent"}
                          </span>
                        </td>
 
                        {/* Cost */}
                        <td className="px-6 py-4 text-right">
                          <span className="text-purple-300 text-sm">
                            {record.cost ? `$${record.cost.toFixed(4)}` : "—"}
                          </span>
                        </td>
 
                        {/* Sent at */}
                        <td className="px-6 py-4 text-right">
                          <div className="text-white text-sm">{timeAgo(record.sent_at)}</div>
                          <div className="text-xs text-purple-500">{formatDate(record.sent_at)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}