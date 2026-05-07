"use client";
 
import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useParams, useRouter } from "next/navigation";
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface BarberStats {
  total_revenue: number;
  services_revenue: number;
  avg_service_value: number;
  avg_appt_value: number;
  total_appts: number;
  services_sold: number;
  rebooked_clients: number;
  rebook_rate: number;
  pct_requested_by_client: number;
  total_clients: number;
  new_clients: number;
  returning_clients: number;
  pct_new_clients: number;
  pct_returning_clients: number;
  total_upsell_items: number;
  upsell_rate: number;
  occupancy_rate: number;
  avg_rating: number;
  review_count: number;
  pct_online: number;
  hourly_breakdown: { hour: string; sales_qty: number; gross_sales: number }[];
  period_label: string;
}
 
interface Barber {
  id: string;
  name: string;
  slug: string;
  role: string;
  color_from: string;
  color_to: string;
}
 
interface Opportunity {
  type: string;
  severity: string;
  label: string;
  detail: string;
  potential_extra_revenue: number;
}
 
interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
 
function StatCard({ label, value, sub, color = "purple" }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    green: "from-green-900/30 to-green-800/20 border-green-700/30 text-green-300",
    red: "from-red-900/30 to-red-800/20 border-red-700/30 text-red-300",
    amber: "from-amber-900/30 to-amber-800/20 border-amber-700/30 text-amber-300",
    blue: "from-blue-900/30 to-blue-800/20 border-blue-700/30 text-blue-300",
    purple: "from-purple-900/30 to-purple-800/20 border-purple-700/30 text-purple-300",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color] || colors.purple} rounded-2xl p-5 border`}>
      <div className="text-xs uppercase tracking-wider mb-1 opacity-70">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}
 
// ─── Mini Coach Widget ────────────────────────────────────────────────────────
 
function MiniCoach({ barber, stats, shopAvg, slug }: {
  barber: Barber; stats: BarberStats; shopAvg: any; slug: string;
}) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const firstName = barber.name.split(" ")[0];
 
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);
 
  async function generateBrief() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barber, stats, shop_avg: shopAvg, type: "daily_brief" }),
      });
      const data = await res.json();
      setBrief(data.response || "");
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
 
  async function sendMessage() {
    if (!input.trim() || chatLoading) return;
    const msg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber, stats, shop_avg: shopAvg,
          type: "coach_chat",
          messages: [...messages, { role: "user", content: msg }].map(m => ({ role: m.role, content: m.content })),
          query: msg,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch { setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong." }]); }
    finally { setChatLoading(false); }
  }
 
  const primaryOpp = stats.rebook_rate < 0.15 ? "rebooking" : stats.avg_service_value < 60 ? "upsell" : "loyalty";
  const oppLabel = primaryOpp === "rebooking" ? `Rebook rate ${(stats.rebook_rate * 100).toFixed(1)}% — below target` : primaryOpp === "upsell" ? `Avg service $${stats.avg_service_value.toFixed(0)} — upsell opportunity` : "Build client loyalty";
  const oppColor = primaryOpp === "rebooking" ? "text-red-400 bg-red-900/20 border-red-600/30" : primaryOpp === "upsell" ? "text-amber-400 bg-amber-900/20 border-amber-600/30" : "text-blue-400 bg-blue-900/20 border-blue-600/30";
 
  return (
    <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 border border-purple-700/40 rounded-2xl overflow-hidden">
      {/* Coach header */}
      <div className="bg-gradient-to-r from-purple-900/60 to-pink-900/30 border-b border-purple-800/40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold">RydraCoach</div>
            <div className="text-purple-400 text-xs">{firstName}'s personal AI sales trainer</div>
          </div>
        </div>
        <button
          onClick={() => router.push(`/merchant/barber/${slug}/coach`)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white text-sm font-medium transition-all shadow-lg shadow-purple-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Open Full Coach
        </button>
      </div>
 
      <div className="p-6">
        {/* Primary opportunity alert */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-5 ${oppColor}`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-sm font-medium">{oppLabel}</span>
        </div>
 
        {/* Daily brief */}
        <div className="mb-5">
          {brief ? (
            <div className="bg-purple-900/30 border border-purple-700/30 rounded-xl p-4 text-purple-100 text-sm leading-relaxed whitespace-pre-wrap">
              {brief}
            </div>
          ) : (
            <button
              onClick={generateBrief}
              disabled={loading}
              className="w-full py-3 bg-purple-900/40 border border-purple-700/40 hover:bg-purple-800/50 hover:border-purple-600/60 rounded-xl text-purple-300 hover:text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />Generating today's brief...</>
              ) : (
                <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>Generate {firstName}'s Daily Brief</>
              )}
            </button>
          )}
        </div>
 
        {/* Quick chat */}
        <div className="border-t border-purple-800/30 pt-4">
          <p className="text-xs text-purple-500 uppercase tracking-wider font-semibold mb-3">Ask your coach</p>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-purple-600 text-white" : "bg-purple-900/50 border border-purple-700/40 text-purple-100"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-1.5 px-3 py-2">
                {[0,100,200].map(d => <div key={d} className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              disabled={chatLoading}
              placeholder={`Ask ${firstName}'s coach...`}
              className="flex-1 bg-purple-900/40 border border-purple-700/40 rounded-xl px-3 py-2 text-white placeholder-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm"
            />
            <button onClick={sendMessage} disabled={chatLoading || !input.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-xl px-3 py-2 transition-all">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
 
          {/* Quick prompts */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["Give me the rebooking script", "What's my biggest opportunity?", "Set me a target for today"].map(p => (
              <button key={p} onClick={() => setInput(p)}
                className="text-xs text-purple-400 hover:text-white bg-purple-900/30 hover:bg-purple-800/40 border border-purple-800/30 rounded-lg px-2 py-1 transition-all">
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
 
export default function BarberDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.id as string;
 
  const [barber, setBarber] = useState<Barber | null>(null);
  const [stats, setStats] = useState<BarberStats | null>(null);
  const [shopAvg, setShopAvg] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/barber/${slug}?venue_id=${VENUE_ID}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        setBarber(data.barber);
        setStats(data.stats);
        setShopAvg(data.shop_avg);
        setOpportunities(data.opportunities || []);
      })
      .catch(e => { console.error(e); setError(e.message); })
      .finally(() => setLoading(false));
  }, [slug]);
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-purple-400">Loading {slug?.replace(/-/g, " ")}...</p>
      </div>
    </div>
  );
 
  if (error || !barber) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="text-center bg-purple-900/30 border border-purple-700/40 rounded-2xl p-8 max-w-md">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-white text-lg font-semibold mb-2">Barber not found</p>
        <p className="text-purple-400 text-sm mb-1">Slug: <code className="text-purple-300">{slug}</code></p>
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <p className="text-purple-500 text-xs mb-6">Make sure you've run the SQL seed in Supabase and the barbers table is populated.</p>
        <a href="/merchant/barber" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-sm font-medium transition-all">← Back to barbers</a>
      </div>
    </div>
  );
 
  const firstName = barber.name.split(" ")[0];
  const tooltipStyle = { backgroundColor: "#1e1b4b", border: "1px solid #6366f1", borderRadius: "8px", color: "#fff" };
  const shopRebook = shopAvg?.rebook_rate || 0.175;
  const shopService = shopAvg?.avg_service_value || 70;
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
 
      {/* ── Header ── */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{firstName}'s Dashboard</h1>
              <p className="text-purple-300 text-xs">Personal demand engine · Alkami Barbershop</p>
            </div>
          </div>
 
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            <a href="/merchant/dashboard" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Dashboard
            </a>
            <a href="/merchant/outreach" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              Outreach
            </a>
            <a href="/merchant/barber" className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Barbers
            </a>
          </div>
 
          <a href="/merchant/barber" className="flex-shrink-0 text-purple-400 hover:text-white text-sm flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            All barbers
          </a>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* ── Barber Profile ── */}
        <div className="flex items-center gap-6 mb-8 bg-gradient-to-r from-purple-900/30 to-purple-800/20 rounded-2xl border border-purple-700/30 p-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-xl"
            style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}>
            {getInitials(barber.name)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">{barber.name}</h2>
            <p className="text-purple-300 capitalize">{barber.role} · Alkami Barbershop, Canberra</p>
            {stats && (
              <div className="flex items-center gap-2 mt-2">
                {[1,2,3,4,5].map(i => <svg key={i} className={`w-4 h-4 ${i <= Math.round(stats.avg_rating) ? "text-yellow-400" : "text-purple-700"}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}
                <span className="text-purple-300 text-sm">{stats.avg_rating.toFixed(2)} from {stats.review_count} reviews</span>
              </div>
            )}
          </div>
          {/* RydraCoach CTA */}
          <button
            onClick={() => router.push(`/merchant/barber/${slug}/coach`)}
            className="flex-shrink-0 flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl text-white font-semibold transition-all shadow-xl shadow-purple-500/30 group"
          >
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-all">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">Open RydraCoach</div>
              <div className="text-xs text-white/70">Sales training · Role-play · Scripts</div>
            </div>
            <svg className="w-4 h-4 text-white/60 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
 
        {/* ── Two Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
 
          {/* Left: RydraCoach mini widget */}
          {stats && (
            <MiniCoach barber={barber} stats={stats} shopAvg={shopAvg} slug={slug} />
          )}
 
          {/* Right: KPI Cards */}
          <div className="space-y-4">
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Total Revenue" value={`$${stats.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`$${stats.avg_appt_value.toFixed(0)} avg/appt`} color="green" />
                  <StatCard
                    label="Rebook Rate"
                    value={`${(stats.rebook_rate * 100).toFixed(1)}%`}
                    sub={`${stats.rebook_rate >= shopRebook ? "+" : ""}${((stats.rebook_rate - shopRebook) * 100).toFixed(1)}% vs shop avg`}
                    color={stats.rebook_rate >= shopRebook ? "green" : stats.rebook_rate >= shopRebook * 0.7 ? "amber" : "red"}
                  />
                  <StatCard
                    label="Avg Service Value"
                    value={`$${stats.avg_service_value.toFixed(0)}`}
                    sub={`${stats.avg_service_value >= shopService ? "+" : ""}$${(stats.avg_service_value - shopService).toFixed(0)} vs shop avg`}
                    color={stats.avg_service_value >= shopService ? "green" : "amber"}
                  />
                  <StatCard label="Occupancy" value={stats.occupancy_rate > 0 ? `${(stats.occupancy_rate * 100).toFixed(1)}%` : "N/A"} sub={`${stats.total_appts.toLocaleString()} appts`} color="blue" />
                </div>
 
                {/* Opportunity badges */}
                {opportunities.length > 0 && (
                  <div className="space-y-2">
                    {opportunities.map((opp, idx) => (
                      <div key={idx} className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm ${opp.severity === "critical" ? "bg-red-900/30 border-red-600/40 text-red-300" : opp.severity === "warning" ? "bg-yellow-900/30 border-yellow-600/40 text-yellow-300" : "bg-blue-900/30 border-blue-600/40 text-blue-300"}`}>
                        <div>
                          <span className="font-medium">{opp.label}</span>
                          <span className="ml-2 opacity-70 text-xs">{opp.detail}</span>
                        </div>
                        {opp.potential_extra_revenue > 0 && <span className="text-green-400 font-semibold text-xs">+${opp.potential_extra_revenue.toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}
 
                {/* Period label */}
                <div className="text-xs text-purple-500 text-right">{stats.period_label}</div>
              </>
            ) : (
              <div className="bg-purple-900/20 border border-purple-800/30 rounded-2xl p-8 text-center">
                <p className="text-purple-400">No stats available yet.</p>
                <p className="text-purple-600 text-xs mt-1">Run the barbers_seed.sql in Supabase.</p>
              </div>
            )}
          </div>
        </div>
 
        {/* ── Charts + Details Row ── */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
 
            {/* Peak Hours */}
            <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6">
              <h3 className="text-base font-semibold text-white mb-1">Peak Hours</h3>
              <p className="text-purple-400 text-xs mb-4">Appointments by hour</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.hourly_breakdown || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="hour" stroke="#a78bfa" fontSize={10} tickFormatter={h => h.replace(":00", "")} />
                  <YAxis stroke="#a78bfa" fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} appts`, "Volume"]} />
                  <Bar dataKey="sales_qty" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
 
            {/* vs Shop */}
            <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6">
              <h3 className="text-base font-semibold text-white mb-1">vs Shop Average</h3>
              <p className="text-purple-400 text-xs mb-5">How {firstName} compares</p>
              <div className="space-y-4">
                {[
                  { label: "Rebook Rate", barberVal: stats.rebook_rate * 100, shopVal: (shopRebook) * 100, format: (v: number) => `${v.toFixed(1)}%`, higherIsBetter: true },
                  { label: "Avg Service", barberVal: stats.avg_service_value, shopVal: shopService, format: (v: number) => `$${v.toFixed(0)}`, higherIsBetter: true },
                  { label: "Upsell Rate", barberVal: stats.upsell_rate * 100, shopVal: 3.8, format: (v: number) => `${v.toFixed(1)}%`, higherIsBetter: true },
                  { label: "Returning %", barberVal: stats.pct_returning_clients * 100, shopVal: 21, format: (v: number) => `${v.toFixed(1)}%`, higherIsBetter: true },
                ].map(({ label, barberVal, shopVal, format, higherIsBetter }) => {
                  const isGood = higherIsBetter ? barberVal >= shopVal : barberVal <= shopVal;
                  const maxVal = Math.max(barberVal, shopVal) * 1.2;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-purple-300">{label}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-semibold ${isGood ? "text-green-400" : "text-red-400"}`}>{format(barberVal)}</span>
                          <span className="text-purple-500">avg {format(shopVal)}</span>
                        </div>
                      </div>
                      <div className="relative h-1.5 bg-purple-900/60 rounded-full">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-purple-600/30" style={{ width: `${(shopVal / maxVal) * 100}%` }} />
                        <div className={`absolute inset-y-0 left-0 rounded-full ${isGood ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${(barberVal / maxVal) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
 
            {/* Client breakdown */}
            <div className="bg-purple-950/30 rounded-2xl border border-purple-800/30 p-6">
              <h3 className="text-base font-semibold text-white mb-4">Client Breakdown</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Total clients", value: stats.total_clients.toLocaleString(), color: "text-white" },
                  { label: "New clients", value: `${stats.new_clients} (${(stats.pct_new_clients * 100).toFixed(0)}%)`, color: "text-blue-400" },
                  { label: "Returning", value: `${stats.returning_clients} (${(stats.pct_returning_clients * 100).toFixed(0)}%)`, color: "text-green-400" },
                  { label: "Rebooked", value: `${stats.rebooked_clients} (${(stats.rebook_rate * 100).toFixed(1)}%)`, color: stats.rebook_rate < 0.15 ? "text-red-400" : "text-purple-300" },
                  { label: "Upsell items", value: stats.total_upsell_items.toLocaleString(), color: "text-amber-400" },
                  { label: "Upsell rate", value: `${(stats.upsell_rate * 100).toFixed(1)}%`, color: stats.upsell_rate < 0.02 ? "text-red-400" : "text-amber-400" },
                  { label: "Rating", value: `${stats.avg_rating.toFixed(2)}/5 (${stats.review_count} reviews)`, color: "text-yellow-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-purple-800/20">
                    <span className="text-purple-400 text-xs">{label}</span>
                    <span className={`font-medium text-xs ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
 
        {/* ── Scripts Quick Reference ── */}
        <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 rounded-2xl border border-purple-800/30 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-white">Key Scripts</h3>
              <p className="text-purple-400 text-xs">Quick reference — full training in RydraCoach</p>
            </div>
            <button
              onClick={() => router.push(`/merchant/barber/${slug}/coach`)}
              className="text-sm text-purple-400 hover:text-white transition-colors flex items-center gap-1"
            >
              Open full coach →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-purple-900/30 rounded-xl p-4">
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">📅 Rebooking Script</div>
              <p className="text-purple-100 text-sm italic leading-relaxed">"Before you head off — let's get your next appointment locked in. Four weeks from today puts you on [date]. I have 10am or 2pm — which works better?"</p>
              <p className="text-purple-500 text-xs mt-2">While client is still in the chair. Two options = choice between two yeses.</p>
            </div>
            <div className="bg-purple-900/30 rounded-xl p-4">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">✨ Upsell Script</div>
              <p className="text-purple-100 text-sm italic leading-relaxed">"Your beard's looking a bit dry — I'll add a quick treatment, takes two minutes and makes the whole cut last way longer."</p>
              <p className="text-purple-500 text-xs mt-2">Observe the problem → state the benefit → pick up the product → assume the yes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}