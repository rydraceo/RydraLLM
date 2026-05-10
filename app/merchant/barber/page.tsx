"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
 
const BG   = "bg-[#0A0612]";
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const BDR   = "border-[#2A1852]";
const BDR2  = "border-[#3A2268]";
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/outreach",  label: "Outreach"  },
  { href: "/merchant/campaign",  label: "Campaign"  },
  { href: "/merchant/clients",   label: "Clients"   },
  { href: "/merchant/barber",    label: "Barbers", active: true },
];
 
interface Barber {
  id: string; name: string; slug: string; role: string;
  color_from: string; color_to: string;
  stats: {
    total_revenue: number; rebook_rate: number; avg_appt_value: number;
    avg_service_value: number; total_appts: number; avg_rating: number;
    review_count: number; upsell_rate: number;
  } | null;
}
 
const COACHING_TAGS: Record<string, { label: string; hex: string }> = {
  rebooking: { label: "Rebooking", hex: "#F43F5E" },
  upsell:    { label: "Upsell",    hex: "#FBBF24" },
  loyalty:   { label: "Loyalty",   hex: "#38BDF8" },
  on_track:  { label: "On Track",  hex: "#34D399" },
};
 
export default function BarberSelectorPage() {
  const router = useRouter();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [shopAvg, setShopAvg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/barbers?venue_id=${VENUE_ID}`)
      .then(r => r.json()).then(d => { setBarbers(d.barbers || []); setShopAvg(d.shop_avg || null); }).catch(console.error).finally(() => setLoading(false));
  }, []);
 
  const teamRevenue = barbers.reduce((s, b) => s + (b.stats?.total_revenue || 0), 0);
  const avgRebook = barbers.filter(b => b.stats).reduce((s, b) => s + (b.stats?.rebook_rate || 0), 0) / (barbers.filter(b => b.stats).length || 1);
  const topEarner = barbers.sort((a,b) => (b.stats?.total_revenue||0) - (a.stats?.total_revenue||0))[0];
 
  function getCoachingTag(b: Barber) {
    if (!b.stats) return "on_track";
    if (b.stats.rebook_rate < 0.12) return "rebooking";
    if (b.stats.avg_service_value < 60) return "upsell";
    if (b.stats.rebook_rate < 0.20) return "rebooking";
    return "on_track";
  }
 
  if (loading) return <div className={`min-h-screen ${BG} flex items-center justify-center`}><div className="text-center"><div className="w-10 h-10 border border-[#7C3AED]/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" /><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Loading team</div></div></div>;
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(10,6,18,0.97)" }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none">Barber Intelligence</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(tab => <a key={tab.href} href={tab.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${(tab as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"}`}>{tab.label}</a>)}
          </nav>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
        <div className="mb-8">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Alkami Barbershop · Canberra</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Team Performance</h1>
        </div>
 
        {/* Team KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { l: "Team Revenue",       v: `$${(teamRevenue/1000).toFixed(0)}k`,               sub: `${barbers.length} active barbers`, acc: "#34D399" },
            { l: "Shop Avg Rebook",    v: `${(avgRebook*100).toFixed(1)}%`,                    sub: "Target: 22%", acc: avgRebook >= 0.22 ? "#34D399" : "#FBBF24" },
            { l: "Top Earner",         v: topEarner?.name?.split(" ")[0] || "—",               sub: `$${(topEarner?.stats?.total_revenue||0).toLocaleString(undefined,{maximumFractionDigits:0})}`, acc: "#D4A017" },
          ].map(({ l, v, sub, acc }) => (
            <div key={l} className={`${CARD} border ${BDR} rounded-xl p-5 relative overflow-hidden`}>
              <div className="absolute left-0 top-4 bottom-4 w-[2px] rounded-r-full" style={{ background: acc }} />
              <div className="pl-3"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{l}</div><div className="text-3xl font-bold tracking-tight text-white mb-1">{v}</div><div className="text-[10px] text-slate-600">{sub}</div></div>
            </div>
          ))}
        </div>
 
        {/* Barber cards */}
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Select a Barber — Personal Demand Engine + RydraCoach</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {barbers.map(b => {
            const tag = getCoachingTag(b);
            const tagMeta = COACHING_TAGS[tag];
            const shopRebook = shopAvg?.rebook_rate || 0.179;
            const rebookDiff = b.stats ? ((b.stats.rebook_rate - shopRebook) * 100) : 0;
            const initials = b.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase();
            return (
              <div key={b.id} className={`${CARD} border ${BDR} rounded-xl overflow-hidden hover:border-[#3A2268] transition-all group cursor-pointer`}
                onClick={() => router.push(`/merchant/barber/${b.slug}`)}>
                <div className="p-5 border-b border-[#0F1829]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{b.name}</div>
                      <div className="text-[10px] text-slate-600 capitalize">{b.role}</div>
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded" style={{ background: `${tagMeta.hex}12`, color: tagMeta.hex, border: `1px solid ${tagMeta.hex}25` }}>{tagMeta.label}</div>
                  </div>
 
                  {b.stats ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: "Revenue",     v: `$${(b.stats.total_revenue/1000).toFixed(0)}k` },
                        { l: "Rebook Rate", v: `${(b.stats.rebook_rate*100).toFixed(1)}%`, col: b.stats.rebook_rate >= shopRebook ? "#34D399" : "#F43F5E" },
                        { l: "Avg Appt",    v: `$${b.stats.avg_appt_value?.toFixed(0)||0}` },
                        { l: "Appts",       v: b.stats.total_appts.toLocaleString() },
                      ].map(({ l, v, col }) => (
                        <div key={l} className="rounded-md p-2.5" style={{ background: "#0F0A1E" }}>
                          <div className="text-[9px] text-slate-600 mb-0.5">{l}</div>
                          <div className="text-sm font-bold" style={{ color: col || "#fff" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-[9px] text-slate-700 uppercase tracking-wider">No stats available</div>
                  )}
                </div>
 
                {b.stats && (
                  <div className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] text-slate-600">Rebook vs shop avg</span>
                      <span className={`text-[9px] font-bold ${rebookDiff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{rebookDiff >= 0 ? "+" : ""}{rebookDiff.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: "#2A1852" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min((b.stats.rebook_rate/0.30)*100,100)}%`, background: rebookDiff >= 0 ? "#34D399" : "#F43F5E" }} />
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(i => <div key={i} className="w-2 h-2 rounded-sm" style={{ background: i <= Math.round(b.stats!.avg_rating) ? "#FBBF24" : "#2A1852" }} />)}
                        <span className="text-[9px] text-slate-600 ml-1">{b.stats.avg_rating?.toFixed(2)} · {b.stats.review_count} reviews</span>
                      </div>
                      <span className="text-[9px] font-semibold text-[#A78BFA] group-hover:text-[#C4B5FD] transition-colors">View dashboard →</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}