"use client";
import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useParams, useRouter } from "next/navigation";
 
const BG   = "bg-[#050810]";
const CARD  = "bg-[#0C1120]";
const CARD2 = "bg-[#0F1529]";
const BDR   = "border-[#162038]";
const TIP   = { backgroundColor: "#0C1120", border: "1px solid #1E2D4E", borderRadius: "4px", color: "#fff", fontSize: "11px" };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/outreach",  label: "Outreach"  },
  { href: "/merchant/campaign",  label: "Campaign"  },
  { href: "/merchant/clients",   label: "Clients"   },
  { href: "/merchant/barber",    label: "Barbers", active: true },
];
 
interface CoachMsg { role: "user"|"assistant"; content: string; }
 
function MiniCoach({ barber, stats, shopAvg, slug }: { barber: any; stats: any; shopAvg: any; slug: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState(""); const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<CoachMsg[]>([]); const [input, setInput] = useState(""); const [chatLoading, setChatLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const firstName = barber.name.split(" ")[0];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, chatLoading]);
 
  async function generateBrief() {
    setLoading(true);
    try { const r = await fetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber, stats, shop_avg: shopAvg, type: "daily_brief" }) }); const d = await r.json(); setBrief(d.response || ""); }
    catch {} finally { setLoading(false); }
  }
 
  async function sendMsg() {
    if (!input.trim() || chatLoading) return;
    const msg = input.trim(); setInput(""); setMsgs(p => [...p, { role: "user", content: msg }]); setChatLoading(true);
    try { const r = await fetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber, stats, shop_avg: shopAvg, type: "coach_chat", messages: [...msgs, { role: "user", content: msg }].map(m => ({ role: m.role, content: m.content })), query: msg }) }); const d = await r.json(); setMsgs(p => [...p, { role: "assistant", content: d.response }]); }
    catch { setMsgs(p => [...p, { role: "assistant", content: "Something went wrong." }]); } finally { setChatLoading(false); }
  }
 
  return (
    <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#0F1829]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0"><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
          <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">AI Sales Coach</div><div className="text-sm font-semibold text-white">RydraCoach</div></div>
        </div>
        <button onClick={() => router.push(`/merchant/barber/${slug}/coach`)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white transition-all"
          style={{ background: "#4F46E5", boxShadow: "0 2px 12px rgba(99,102,241,0.25)" }}>
          Open Full Coach →
        </button>
      </div>
      <div className="p-5">
        {brief ? (
          <div className="rounded-lg p-4 mb-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-[#162038]" style={{ background: "#090D1A" }}>{brief}</div>
        ) : (
          <button onClick={generateBrief} disabled={loading}
            className="w-full py-2.5 mb-4 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 border border-[#162038] text-slate-500 hover:text-slate-200 hover:border-[#1E2D4E]"
            style={{ background: "#090D1A" }}>
            {loading ? <><div className="w-3 h-3 border border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />Generating...</> : `Generate ${firstName}'s Daily Brief`}
          </button>
        )}
        <div className="border-t border-[#162038] pt-4">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Ask your coach</div>
          <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${m.role === "user" ? "bg-indigo-600 text-white" : "border border-[#162038] text-slate-300"}`} style={m.role === "assistant" ? { background: "#090D1A" } : {}}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div className="flex gap-1 px-3 py-2"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} /></div>}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2 mb-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }}} disabled={chatLoading} placeholder={`Ask ${firstName}'s coach...`}
              className="flex-1 rounded-md px-3 py-2 text-xs text-white placeholder-slate-600 border border-[#162038] focus:border-indigo-500/40 focus:outline-none transition-all" style={{ background: "#090D1A" }} />
            <button onClick={sendMsg} disabled={chatLoading || !input.trim()} className="w-8 h-8 rounded-md bg-indigo-600 disabled:opacity-40 flex items-center justify-center transition-all">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {["Give me the rebooking script","What's my biggest opportunity?","Set me a target for today"].map(p => (
              <button key={p} onClick={() => setInput(p)} className="text-[9px] text-slate-600 hover:text-slate-300 border border-[#162038] hover:border-[#1E2D4E] px-2 py-1 rounded transition-all">{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
 
export default function BarberDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.id as string;
  const [barber, setBarber] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [shopAvg, setShopAvg] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/barber/${slug}?venue_id=${VENUE_ID}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then(d => { setBarber(d.barber); setStats(d.stats); setShopAvg(d.shop_avg); setOpportunities(d.opportunities || []); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [slug]);
 
  if (loading) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="w-10 h-10 border border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading {slug?.replace(/-/g," ")}</div></div></div>;
  if (error || !barber) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mb-2">Barber not found</div><p className="text-xs text-slate-600 mb-1">Slug: {slug}</p><p className="text-xs text-rose-400 mb-4">{error}</p><a href="/merchant/barber" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to team</a></div></div>;
 
  const firstName = barber.name.split(" ")[0];
  const shopRebook = shopAvg?.rebook_rate || 0.179;
  const shopService = shopAvg?.avg_service_value || 70;
  const initials = barber.name.split(" ").map((n: string) => n[0]).slice(0,2).join("").toUpperCase();
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(5,8,16,0.96)" }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none">{firstName}'s Dashboard</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => <a key={tab.href} href={tab.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>{tab.label}</a>)}
          </nav>
          <a href="/merchant/barber" className="ml-auto text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-1 flex-shrink-0 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>All barbers</a>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Profile strip */}
        <div className={`${CARD} border ${BDR} rounded-xl p-5 mb-6 flex items-center gap-5`}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}>{initials}</div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white tracking-tight">{barber.name}</h1>
            <div className="text-[10px] text-slate-600 capitalize">{barber.role} · Alkami Barbershop, Canberra</div>
            {stats && (
              <div className="flex items-center gap-1 mt-1">
                {[1,2,3,4,5].map(i => <div key={i} className="w-2 h-2 rounded-sm" style={{ background: i <= Math.round(stats.avg_rating) ? "#FBBF24" : "#162038" }} />)}
                <span className="text-[9px] text-slate-600 ml-1">{stats.avg_rating?.toFixed(2)} · {stats.review_count} reviews</span>
              </div>
            )}
          </div>
          <button onClick={() => router.push(`/merchant/barber/${slug}/coach`)}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all flex-shrink-0"
            style={{ background: "#4F46E5", boxShadow: "0 4px 20px rgba(99,102,241,0.25)" }}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
            Open RydraCoach
          </button>
        </div>
 
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <MiniCoach barber={barber} stats={stats} shopAvg={shopAvg} slug={slug} />
          <div className="space-y-4">
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: "Total Revenue",    v: `$${(stats.total_revenue/1000).toFixed(0)}k`, sub: `$${stats.avg_appt_value?.toFixed(0)||0}/appt`, acc: "#34D399" },
                    { l: "Rebook Rate",      v: `${(stats.rebook_rate*100).toFixed(1)}%`,   sub: `${stats.rebook_rate >= shopRebook ? "+" : ""}${((stats.rebook_rate-shopRebook)*100).toFixed(1)}% vs avg`, acc: stats.rebook_rate >= shopRebook ? "#34D399" : "#F43F5E" },
                    { l: "Avg Service",      v: `$${stats.avg_service_value?.toFixed(0)||0}`, sub: `vs $${shopService.toFixed(0)} avg`, acc: stats.avg_service_value >= shopService ? "#34D399" : "#FBBF24" },
                    { l: "Total Appts",      v: stats.total_appts?.toLocaleString() || "0",  sub: stats.period_label || "Period", acc: "#6366F1" },
                  ].map(({ l, v, sub, acc }) => (
                    <div key={l} className={`${CARD} border ${BDR} rounded-xl p-4 relative overflow-hidden`}>
                      <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: acc }} />
                      <div className="pl-3">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5">{l}</div>
                        <div className="text-xl font-bold text-white tracking-tight">{v}</div>
                        <div className="text-[9px] text-slate-600 mt-0.5">{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {opportunities.length > 0 && (
                  <div className="space-y-2">
                    {opportunities.map((opp, idx) => (
                      <div key={idx} className="rounded-lg px-4 py-3 flex items-center justify-between border" style={{ background: opp.severity === "critical" ? "rgba(244,63,94,0.06)" : opp.severity === "warning" ? "rgba(251,191,36,0.06)" : "rgba(56,189,248,0.06)", borderColor: opp.severity === "critical" ? "rgba(244,63,94,0.2)" : opp.severity === "warning" ? "rgba(251,191,36,0.2)" : "rgba(56,189,248,0.2)" }}>
                        <div>
                          <span className="text-xs font-semibold text-white">{opp.label}</span>
                          <span className="text-[10px] text-slate-500 ml-2">{opp.detail}</span>
                        </div>
                        {opp.potential_extra_revenue > 0 && <span className="text-xs font-bold text-emerald-400">+${opp.potential_extra_revenue.toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className={`${CARD} border ${BDR} rounded-xl p-8 text-center`}>
                <div className="text-[9px] text-slate-700 uppercase tracking-widest">No stats — run barbers_reseed.sql in Supabase</div>
              </div>
            )}
          </div>
        </div>
 
        {stats && (
          <div className="grid grid-cols-3 gap-5 mb-5">
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Peak Hours</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.hourly_breakdown || []} margin={{ left: -20 }}>
                  <XAxis dataKey="hour" stroke="#1E2D4E" fontSize={9} tick={{ fill: "#475569" }} tickFormatter={(h: string) => h.replace(":00","")} />
                  <YAxis stroke="#1E2D4E" fontSize={9} tick={{ fill: "#475569" }} />
                  <Tooltip contentStyle={TIP} formatter={(v: any) => [`${v} appts`, ""]} />
                  <Bar dataKey="sales_qty" fill="#6366F1" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
 
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">vs Shop Average</div>
              <div className="space-y-3.5">
                {[
                  { l: "Rebook Rate", bv: stats.rebook_rate*100, sv: shopRebook*100, fmt: (v: number) => `${v.toFixed(1)}%` },
                  { l: "Avg Service",  bv: stats.avg_service_value, sv: shopService, fmt: (v: number) => `$${v.toFixed(0)}` },
                  { l: "Upsell Rate", bv: stats.upsell_rate*100, sv: 3.8, fmt: (v: number) => `${v.toFixed(1)}%` },
                  { l: "Returning %", bv: stats.pct_returning_clients*100, sv: 21, fmt: (v: number) => `${v.toFixed(1)}%` },
                ].map(({ l, bv, sv, fmt }) => {
                  const good = bv >= sv; const max = Math.max(bv, sv) * 1.2;
                  return (
                    <div key={l}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-slate-600">{l}</span>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className={`font-bold ${good ? "text-emerald-400" : "text-rose-400"}`}>{fmt(bv)}</span>
                          <span className="text-slate-700">avg {fmt(sv)}</span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: "#162038" }}>
                        <div className="h-full rounded-full" style={{ width: `${(bv/max)*100}%`, background: good ? "#34D399" : "#F43F5E" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
 
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Client Breakdown</div>
              <div className="space-y-2">
                {[
                  { l: "Total clients",    v: stats.total_clients },
                  { l: "New",             v: `${stats.new_clients} (${(stats.pct_new_clients*100).toFixed(0)}%)`, col: "#38BDF8" },
                  { l: "Returning",        v: `${stats.returning_clients} (${(stats.pct_returning_clients*100).toFixed(0)}%)`, col: "#34D399" },
                  { l: "Rebooked",         v: `${stats.rebooked_clients} (${(stats.rebook_rate*100).toFixed(1)}%)`, col: stats.rebook_rate < 0.15 ? "#F43F5E" : "#34D399" },
                  { l: "Upsell items",     v: stats.total_upsell_items },
                  { l: "Upsell rate",      v: `${(stats.upsell_rate*100).toFixed(1)}%`, col: stats.upsell_rate < 0.02 ? "#F43F5E" : "#FBBF24" },
                ].map(({ l, v, col }) => (
                  <div key={l} className="flex items-center justify-between py-1 border-b border-[#0F1529]">
                    <span className="text-[9px] text-slate-600">{l}</span>
                    <span className="text-[10px] font-semibold" style={{ color: col || "#fff" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
 
        {/* Scripts */}
        <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Quick Reference</div><div className="text-sm font-semibold text-white">Key Scripts</div></div>
            <button onClick={() => router.push(`/merchant/barber/${slug}/coach`)} className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">Open full coach →</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { tag: "Rebooking", hex: "#F43F5E", msg: `"Before you head off — let's get your next one locked in. Four weeks puts you on [date]. I've got 10am or 2pm — which works?"`, note: "While in the chair. Two options = two yeses." },
              { tag: "Upsell",    hex: "#FBBF24", msg: `"Your beard's looking a bit dry — I'll add a quick treatment, takes two minutes and makes the cut last way longer."`, note: "Observe → benefit → assume the yes." },
            ].map(({ tag, hex, msg, note }) => (
              <div key={tag} className="rounded-lg p-4 border" style={{ background: "#090D1A", borderColor: `${hex}20` }}>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: hex }}>{tag}</div>
                <p className="text-xs text-slate-300 italic leading-relaxed mb-2">{msg}</p>
                <p className="text-[9px] text-slate-600">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}