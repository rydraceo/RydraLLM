"use client";
 
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
 
interface BarberStats {
  total_revenue: number;
  rebook_rate: number;
  avg_service_value: number;
  avg_appt_value: number;
  total_appts: number;
  services_sold: number;
  rebooked_clients: number;
  total_clients: number;
  avg_rating: number;
  review_count: number;
  occupancy_rate: number;
  upsell_rate: number;
  pct_returning_clients: number;
}
 
interface Barber {
  id: string;
  name: string;
  slug: string;
  role: string;
  color_from: string;
  color_to: string;
  stats: BarberStats | null;
}
 
function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
 
function getRebookColor(rate: number, shopAvg: number) {
  if (rate < shopAvg * 0.6) return "text-red-400";
  if (rate < shopAvg * 0.9) return "text-yellow-400";
  return "text-green-400";
}
 
function getOpportunityBadge(stats: BarberStats, shopAvg: number) {
  if (stats.rebook_rate < 0.12) return { label: "Rebooking", color: "bg-red-900/50 text-red-400 border-red-600/40" };
  if (stats.rebook_rate < 0.18) return { label: "Rebooking", color: "bg-yellow-900/50 text-yellow-400 border-yellow-600/40" };
  if (stats.avg_service_value < shopAvg * 0.85) return { label: "Upsell", color: "bg-orange-900/50 text-orange-400 border-orange-600/40" };
  return { label: "On track", color: "bg-green-900/50 text-green-400 border-green-600/40" };
}
 
export default function BarberSelectPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [shopAvg, setShopAvg] = useState<{ rebook_rate: number; avg_service_value: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    fetch(`/api/barbers?venue_id=${VENUE_ID}`)
      .then(r => r.json())
      .then(data => {
        setBarbers(data.barbers || []);
        setShopAvg(data.shop_avg || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
 
  const totalRevenue = barbers.reduce((s, b) => s + (b.stats?.total_revenue || 0), 0);
  const topEarner = barbers.reduce((top, b) => (!top || (b.stats?.total_revenue || 0) > (top.stats?.total_revenue || 0)) ? b : top, barbers[0]);
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-light">Loading barber data...</p>
      </div>
    </div>
  );
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
 
      {/* Header */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Barber Intelligence</h1>
              <p className="text-purple-300 text-xs">Individual performance · Alkami Barbershop</p>
            </div>
          </div>
 
          {/* Tabs */}
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            <a href="/merchant/dashboard"
              className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Dashboard
            </a>
            <a href="/merchant/outreach"
              className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Outreach
            </a>
            <div className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Barbers
            </div>
          </div>
 
          <div className="w-32" /> {/* spacer */}
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* Team summary */}
        <div className="grid grid-cols-3 gap-5 mb-10">
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-2xl p-6 border border-purple-700/30">
            <div className="text-purple-300 text-xs uppercase tracking-wider mb-1">Team Revenue</div>
            <div className="text-3xl font-bold text-white">${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="text-xs text-purple-400 mt-2">{barbers.length} active barbers</div>
          </div>
          <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-2xl p-6 border border-green-700/30">
            <div className="text-green-300 text-xs uppercase tracking-wider mb-1">Shop Avg Rebook Rate</div>
            <div className="text-3xl font-bold text-white">
              {shopAvg ? (shopAvg.rebook_rate * 100).toFixed(1) : "—"}%
            </div>
            <div className="text-xs text-green-400 mt-2">Target: 22%</div>
          </div>
          <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 rounded-2xl p-6 border border-amber-700/30">
            <div className="text-amber-300 text-xs uppercase tracking-wider mb-1">Top Earner</div>
            <div className="text-3xl font-bold text-white">{topEarner?.name?.split(" ")[0] || "—"}</div>
            <div className="text-xs text-amber-400 mt-2">
              ${topEarner?.stats?.total_revenue?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || "—"}
            </div>
          </div>
        </div>
 
        {/* Barber cards */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Select a barber</h2>
          <p className="text-purple-400 text-sm">View their personal demand engine, AI coach, and client list</p>
        </div>
 
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {barbers.map(barber => {
            const s = barber.stats;
            const avgRebook = shopAvg?.rebook_rate || 0.18;
            const avgService = shopAvg?.avg_service_value || 70;
            const opp = s ? getOpportunityBadge(s, avgService) : null;
 
            return (
              <div
                key={barber.id}
                onClick={() => router.push(`/merchant/barber/${barber.slug}`)}
                className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 border border-purple-800/30 hover:border-purple-600/50 rounded-2xl p-6 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 group"
              >
                {/* Avatar + name */}
                <div className="flex items-start gap-4 mb-5">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}
                  >
                    {getInitials(barber.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-lg leading-tight">{barber.name}</h3>
                    <p className="text-purple-400 text-sm capitalize">{barber.role}</p>
                    {opp && (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border mt-1 font-medium ${opp.color}`}>
                        {opp.label === "Rebooking" && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                        )}
                        {opp.label}
                      </span>
                    )}
                  </div>
                </div>
 
                {/* Stats grid */}
                {s ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-purple-900/40 rounded-xl p-3">
                        <div className="text-green-400 font-bold text-sm">
                          ${s.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-purple-500 text-xs mt-0.5">Revenue</div>
                      </div>
                      <div className="bg-purple-900/40 rounded-xl p-3">
                        <div className={`font-bold text-sm ${getRebookColor(s.rebook_rate, avgRebook)}`}>
                          {(s.rebook_rate * 100).toFixed(1)}%
                        </div>
                        <div className="text-purple-500 text-xs mt-0.5">Rebook rate</div>
                      </div>
                      <div className="bg-purple-900/40 rounded-xl p-3">
                        <div className="text-white font-bold text-sm">${s.avg_appt_value.toFixed(0)}</div>
                        <div className="text-purple-500 text-xs mt-0.5">Avg appt</div>
                      </div>
                      <div className="bg-purple-900/40 rounded-xl p-3">
                        <div className="text-purple-300 font-bold text-sm">{s.total_appts.toLocaleString()}</div>
                        <div className="text-purple-500 text-xs mt-0.5">Appts</div>
                      </div>
                    </div>
 
                    {/* Rebook vs shop avg bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-purple-400">Rebook vs shop avg</span>
                        <span className={`text-xs font-medium ${getRebookColor(s.rebook_rate, avgRebook)}`}>
                          {s.rebook_rate >= avgRebook ? "+" : ""}{((s.rebook_rate - avgRebook) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-purple-900/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${s.rebook_rate >= avgRebook ? "bg-green-500" : s.rebook_rate >= avgRebook * 0.7 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min((s.rebook_rate / (avgRebook * 1.5)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
 
                    {/* Rating */}
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <svg key={i} className={`w-3 h-3 ${i <= Math.round(s.avg_rating) ? "text-yellow-400" : "text-purple-700"}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-purple-400 text-xs">{s.avg_rating.toFixed(2)} · {s.review_count} reviews</span>
                    </div>
                  </>
                ) : (
                  <div className="text-purple-500 text-sm">No stats available</div>
                )}
 
                {/* CTA */}
                <div className="mt-4 pt-4 border-t border-purple-800/30 flex items-center justify-between">
                  <span className="text-purple-400 text-xs">View personal dashboard</span>
                  <svg className="w-4 h-4 text-purple-400 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}