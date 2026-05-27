"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { DiaryWidget } from "@/app/components/diary-widget";
 
const BG   = "bg-[#0A0612]";
const CARD  = "bg-[#130C24]";
const CARD2 = "bg-[#1A1030]";
const BDR   = "border-[#2A1852]";
const BDR2  = "border-[#3A2268]";
 
interface CoachMsg { role: "user"|"assistant"; content: string; type?: string; }
 
const SCENARIOS = [
  { id: "rebooking",   label: "Rebooking",    hex: "#F43F5E", desc: "Client just finished. Close the next booking.", opener: "Alright mate, heading off. Same time next month?" },
  { id: "upsell",      label: "Upsell",       hex: "#FBBF24", desc: "Offer a treatment add-on mid-service.",          opener: "Just a cut today thanks, nothing extra." },
  { id: "winback",     label: "Win-Back",      hex: "#FB923C", desc: "Client hasn't been in for 4+ months.",          opener: "Oh yeah it's been a while, been pretty flat out." },
  { id: "firsttimer",  label: "First Timer",   hex: "#38BDF8", desc: "Brand new client, get the second booking.",     opener: "Yeah really happy with it, thanks man." },
  { id: "retail",      label: "Retail Upsell", hex: "#A78BFA", desc: "Recommend a product during the cut.",           opener: "I don't really use product at home." },
];
 
const SCRIPTS = [
  { title: "The Rebooking Close", hex: "#F43F5E", category: "Rebooking", script: `"Before you head off — let's get your next one locked in. Four weeks from today puts you on [date]. I've got 10am or 2pm — which works better for you?"`, psychology: "Two-option close creates a choice between two yeses, not a yes/no. Ask while client is still in the chair — compliance drops 60% once they leave.", target: "Use at the END of every appointment. Never miss this window." },
  { title: "The Problem-Solution Upsell", hex: "#FBBF24", category: "Upsell", script: `"Your beard's looking a bit dry — I'll add a quick treatment. Takes about two minutes and makes the whole cut last way longer."`, psychology: "Observe the problem → state the benefit → pick up the product → assume the yes. Never ask 'would you like?'", target: "Use when you notice a skin or beard issue. Always frame as benefit." },
  { title: "The Win-Back Message", hex: "#FB923C", category: "Win-Back", script: `"Hey [Name], JB here from Alkami — it's been a while, hope you're well. We've got a spot this week if you're keen to come in. Reply to lock it in."`, psychology: "Loss aversion: they already know you, trust you. Risk is low. Reminder of what they're missing is more powerful than a discount.", target: "Send to clients 90+ days overdue. Use their first name. Keep it short." },
  { title: "The First-Timer Return", hex: "#38BDF8", category: "Retention", script: `"Really glad you came in. Let's make sure you get the same result every time — I've got [date] available in 4 weeks, want me to pencil you in before you go?"`, psychology: "New clients make rebooking decisions immediately after a great experience. Habit hasn't formed yet — this one conversation can be worth $2,000+ over 3 years.", target: "Say this before every first-timer leaves. No exceptions." },
  { title: "The Product Hand-Off", hex: "#A78BFA", category: "Retail", script: `"This is what I used on your hair today — it's a [product name]. I'll grab you one from the shelf, it's $X. Makes the cut hold way longer at home."`, psychology: "Physical hand-off creates ownership before the sale. Let them hold it. People rarely hand things back.", target: "Hand the product to the client naturally during the cut. Mention price casually." },
];
 
export default function RydraCoachPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.id as string;
  const [barber, setBarber] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"mission"|"arena"|"vault"|"chat"|"diary">("mission");
  const [mission, setMission] = useState(""); const [missionLoading, setMissionLoading] = useState(false);
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [roleplayMsgs, setRoleplayMsgs] = useState<CoachMsg[]>([]);
  const [roleplayInput, setRoleplayInput] = useState(""); const [roleplayLoading, setRoleplayLoading] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0); const [feedback, setFeedback] = useState("");
  const [chatMsgs, setChatMsgs] = useState<CoachMsg[]>([]); const [chatInput, setChatInput] = useState(""); const [chatLoading, setChatLoading] = useState(false);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const roleEndRef = useRef<HTMLDivElement>(null); const chatEndRef = useRef<HTMLDivElement>(null);
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => { roleEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [roleplayMsgs]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);
 
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/barber/${slug}?venue_id=${VENUE_ID}`).then(r => r.json()).then(d => { setBarber(d.barber); setStats(d.stats); }).catch(console.error);
  }, [slug]);
 
  async function generateMission() {
    if (!barber || !stats) return;
    setMissionLoading(true);
    try { const r = await fetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber, stats, type: "daily_mission" }) }); const d = await r.json(); setMission(d.response || ""); }
    catch {} finally { setMissionLoading(false); }
  }
 
  async function startRoleplay(scenId: string) {
    setScenario(scenId); setRoleplayMsgs([]); setExchangeCount(0); setFeedback("");
    const sc = SCENARIOS.find(s => s.id === scenId);
    if (!sc) return;
    setRoleplayMsgs([{ role: "assistant", content: sc.opener, type: "client" }]);
  }
 
  async function sendRoleplay() {
    if (!roleplayInput.trim() || roleplayLoading || !barber) return;
    const msg = roleplayInput.trim(); setRoleplayInput(""); const newCount = exchangeCount + 1;
    setRoleplayMsgs(p => [...p, { role: "user", content: msg }]); setExchangeCount(newCount); setRoleplayLoading(true);
    try {
      const r = await fetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber, stats, type: "roleplay", scenario, messages: [...roleplayMsgs, { role: "user", content: msg }].map(m => ({ role: m.role, content: m.content })), exchange_count: newCount }) });
      const d = await r.json();
      if (d.feedback) { setFeedback(d.feedback); setRoleplayMsgs(p => [...p, { role: "assistant", content: d.response, type: "feedback" }]); }
      else setRoleplayMsgs(p => [...p, { role: "assistant", content: d.response, type: "client" }]);
    } catch {} finally { setRoleplayLoading(false); }
  }
 
  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !barber) return;
    const msg = chatInput.trim(); setChatInput(""); setChatMsgs(p => [...p, { role: "user", content: msg }]); setChatLoading(true);
    try { const r = await fetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ barber, stats, type: "coach_chat", messages: [...chatMsgs, { role: "user", content: msg }].map(m => ({ role: m.role, content: m.content })), query: msg }) }); const d = await r.json(); setChatMsgs(p => [...p, { role: "assistant", content: d.response }]); }
    catch { setChatMsgs(p => [...p, { role: "assistant", content: "Something went wrong." }]); } finally { setChatLoading(false); }
  }
 
  const firstName = barber?.name?.split(" ")[0] || slug?.split("-")[0] || "Barber";
  const rebookRate = stats?.rebook_rate ? (stats.rebook_rate * 100).toFixed(1) : "—";
  const upsellRate = stats?.upsell_rate ? (stats.upsell_rate * 100).toFixed(1) : "—";
  const avgService = stats?.avg_service_value ? `$${stats.avg_service_value.toFixed(0)}` : "—";
 
  return (
    <div className={`min-h-screen ${BG} text-white pb-16`}>
      {/* Nav */}
      <div className="border-b border-[#0F1829] backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(10,6,18,0.97)" }}>
        <div className="max-w-[1200px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold text-white leading-none">RydraCoach</div></div>
          </div>
          <nav className="flex items-center gap-1">
            {[
              { href: "/merchant/dashboard", label: "Dashboard" },
              { href: "/merchant/outreach",  label: "Outreach"  },
              { href: "/merchant/campaign",  label: "Campaign"  },
              { href: "/merchant/clients",   label: "Clients"   },
              { href: "/merchant/barber",    label: "Barbers"   },
            ].map(t => <a key={t.href} href={t.href} className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all">{t.label}</a>)}
          </nav>
          <button onClick={() => router.push(`/merchant/barber/${slug}`)} className="ml-auto text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-1 flex-shrink-0 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {firstName}'s dashboard
          </button>
        </div>
      </div>
 
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Profile + stats */}
        {barber && (
          <div className={`${CARD} border ${BDR} rounded-xl p-5 mb-6 flex items-center gap-5`}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ background: `linear-gradient(135deg, ${barber.color_from || "#5B21B6"}, ${barber.color_to || "#7C3AED"})` }}>
              {barber.name.split(" ").map((n: string) => n[0]).slice(0,2).join("").toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Personal Sales Academy</div>
              <h1 className="text-xl font-bold text-white tracking-tight">{barber.name} — RydraCoach</h1>
            </div>
            <div className="flex items-center gap-3">
              {[
                { l: "Rebook Rate", v: `${rebookRate}%`, target: "22%", good: stats?.rebook_rate >= 0.22, hex: stats?.rebook_rate >= 0.22 ? "#34D399" : "#F43F5E" },
                { l: "Avg Service",  v: avgService,       target: "$70", good: stats?.avg_service_value >= 70, hex: stats?.avg_service_value >= 70 ? "#34D399" : "#FBBF24" },
                { l: "Upsell Rate", v: `${upsellRate}%`, target: "5%",  good: stats?.upsell_rate >= 0.05, hex: stats?.upsell_rate >= 0.05 ? "#34D399" : "#FBBF24" },
              ].map(({ l, v, target, hex }) => (
                <div key={l} className="rounded-lg px-4 py-2.5 text-center border" style={{ background: "#0F0A1E", borderColor: `${hex}25` }}>
                  <div className="text-[9px] text-slate-600 mb-0.5">{l}</div>
                  <div className="text-base font-bold" style={{ color: hex }}>{v}</div>
                  <div className="text-[8px] text-slate-700">target {target}</div>
                </div>
              ))}
            </div>
          </div>
        )}
 
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-[#2A1852]">
          {([
            { k: "mission", label: "Today's Mission" },
            { k: "arena",   label: "Practice Arena" },
            { k: "vault",   label: "Script Vault" },
            { k: "chat",    label: "Coach Chat" },
            { k: "diary",   label: "Diary" },
          ] as const).map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${tab === k ? "border-[#7C3AED] text-[#A78BFA]" : "border-transparent text-slate-600 hover:text-slate-300"}`}>
              {label}
            </button>
          ))}
        </div>
 
        {/* MISSION */}
        {tab === "mission" && (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2">
              <div className={`${CARD} border ${BDR} rounded-xl p-6`}>
                <div className="flex items-center justify-between mb-5">
                  <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">AI-Generated</div><h2 className="text-base font-semibold text-white">Today's Mission</h2></div>
                  <button onClick={generateMission} disabled={missionLoading || !barber}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold text-white transition-all disabled:opacity-40"
                    style={{ background: "#5B21B6" }}>
                    {missionLoading ? <><div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />Generating...</> : "Generate Mission"}
                  </button>
                </div>
                {mission ? (
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{mission}</div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-3">🎯</div>
                    <div className="text-sm font-medium text-white mb-1">Ready to set your mission</div>
                    <div className="text-[11px] text-slate-600 max-w-xs mx-auto">Your AI coach generates a personalised daily target based on your actual rebook rate, upsell rate, and revenue data.</div>
                    <button onClick={generateMission} disabled={missionLoading || !barber}
                      className="mt-5 px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-all"
                      style={{ background: "#5B21B6" }}>
                      Generate Today's Mission
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {stats && (
                <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Your Opportunities</div>
                  {[
                    stats.rebook_rate < 0.15 && { label: "Rebooking Critical", detail: `${(stats.rebook_rate*100).toFixed(1)}% rate — industry target 22%`, extra: `+$${Math.round(stats.total_clients*0.07*stats.avg_appt_value*0.6)}/mo if you hit 22%`, hex: "#F43F5E" },
                    stats.upsell_rate < 0.05 && { label: "Upsell Opportunity", detail: `${(stats.upsell_rate*100).toFixed(1)}% rate — industry best 8-10%`, extra: `+$${Math.round(stats.total_appts*0.05*25*0.6)}/mo if you add 5%`, hex: "#FBBF24" },
                    stats.pct_returning_clients < 0.25 && { label: "Returning Clients Low", detail: `${(stats.pct_returning_clients*100).toFixed(1)}% — build loyalty`, extra: "Focus on second appointment conversion", hex: "#38BDF8" },
                  ].filter(Boolean).map((opp: any, idx) => (
                    <div key={idx} className="mb-3 rounded-lg p-3 border" style={{ background: "#0F0A1E", borderColor: `${opp.hex}20` }}>
                      <div className="text-xs font-semibold mb-1" style={{ color: opp.hex }}>{opp.label}</div>
                      <div className="text-[10px] text-slate-500 mb-1">{opp.detail}</div>
                      <div className="text-[9px] text-emerald-400">{opp.extra}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-3">Today's Quick Target</div>
                <div className="space-y-2">
                  {[{ l: "Rebook clients", v: 6 }, { l: "Upsells", v: 3 }].map(({ l, v }) => (
                    <div key={l} className="flex items-center justify-between py-2 border-b border-[#0F1529]">
                      <span className="text-xs text-slate-400">{l}</span>
                      <span className="text-sm font-bold text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
 
        {/* ARENA */}
        {tab === "arena" && (
          <div className="grid grid-cols-3 gap-5">
            <div className={`${CARD} border ${BDR} rounded-xl p-5`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">Choose Scenario</div>
              <div className="space-y-2">
                {SCENARIOS.map(sc => (
                  <button key={sc.id} onClick={() => startRoleplay(sc.id)}
                    className={`w-full text-left rounded-lg p-3.5 border transition-all ${scenario === sc.id ? "border-[#7C3AED]/40" : "border-[#2A1852] hover:border-[#3A2268]"}`}
                    style={{ background: scenario === sc.id ? `${sc.hex}08` : "#0F0A1E", borderColor: scenario === sc.id ? `${sc.hex}30` : undefined }}>
                    <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: sc.hex }}>{sc.label}</div>
                    <div className="text-xs text-slate-500">{sc.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex flex-col">
              <div className={`${CARD} border ${BDR} rounded-xl flex-1 flex flex-col overflow-hidden`} style={{ minHeight: "500px" }}>
                <div className="px-5 py-4 border-b border-[#0F1829] flex items-center justify-between">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Practice Arena</div>
                    <div className="text-sm font-semibold text-white">{SCENARIOS.find(s=>s.id===scenario)?.label} Scenario</div>
                  </div>
                  <button onClick={() => startRoleplay(scenario)} className="px-3 py-1.5 rounded-md text-[10px] font-semibold border border-[#3A2268] text-slate-400 hover:text-white transition-all" style={{ background: "#0F0A1E" }}>Reset</button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {roleplayMsgs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <div><div className="text-2xl mb-3">⚡</div><div className="text-sm font-medium text-white mb-1">Select a scenario</div><div className="text-[11px] text-slate-600">AI plays the client. You play yourself.</div></div>
                    </div>
                  ) : (
                    roleplayMsgs.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 text-xs font-bold" style={{ background: msg.type === "feedback" ? "#5B21B6" : "#0F0A1E", border: "1px solid #3A2268", color: msg.type === "feedback" ? "#fff" : "#94A3B8" }}>
                            {msg.type === "feedback" ? "✓" : "C"}
                          </div>
                        )}
                        <div className={`max-w-[78%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-[#5B21B6] text-white rounded-tr-sm" : msg.type === "feedback" ? "border border-[#7C3AED]/30 text-slate-200 rounded-tl-sm" : "border border-[#2A1852] text-slate-300 rounded-tl-sm"}`}
                          style={msg.role === "assistant" ? { background: msg.type === "feedback" ? "rgba(91,33,182,0.12)" : "#0F0A1E" } : {}}>
                          {msg.type === "feedback" && <div className="text-[9px] font-bold uppercase tracking-widest text-[#A78BFA] mb-2">Coach Feedback</div>}
                          {msg.content}
                        </div>
                        {msg.role === "user" && <div className="w-7 h-7 rounded-md border border-[#2A1852] flex items-center justify-center flex-shrink-0 ml-2 mt-0.5 text-xs font-bold text-slate-500" style={{ background: "#0F0A1E" }}>Y</div>}
                      </div>
                    ))
                  )}
                  {roleplayLoading && <div className="flex gap-1.5 px-4 py-2"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} /></div>}
                  <div ref={roleEndRef} />
                </div>
                <div className="border-t border-[#0F1829] p-4">
                  <div className="flex gap-2">
                    <input value={roleplayInput} onChange={e => setRoleplayInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendRoleplay(); }}} disabled={roleplayLoading || roleplayMsgs.length === 0} placeholder="Respond as yourself..."
                      className="flex-1 rounded-md px-4 py-2.5 text-sm text-white placeholder-slate-600 border border-[#2A1852] focus:border-[#7C3AED]/40 focus:outline-none transition-all" style={{ background: "#0F0A1E" }} />
                    <button onClick={sendRoleplay} disabled={roleplayLoading || !roleplayInput.trim() || roleplayMsgs.length === 0} className="rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{ background: "#5B21B6" }}>Reply</button>
                  </div>
                  {exchangeCount > 0 && <div className="text-[9px] text-slate-700 mt-2 text-center uppercase tracking-wider">Exchange {exchangeCount} — coach feedback after 3-4 exchanges</div>}
                </div>
              </div>
            </div>
          </div>
        )}
 
        {/* VAULT */}
        {tab === "vault" && (
          <div className="space-y-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-4">5 proven scripts · click to expand with psychology</div>
            {SCRIPTS.map(s => (
              <div key={s.title} className={`${CARD} border rounded-xl overflow-hidden transition-all hover:border-[#3A2268]`} style={{ borderColor: expandedScript === s.title ? `${s.hex}30` : "#2A1852" }}>
                <button className="w-full flex items-center gap-4 p-5 text-left" onClick={() => setExpandedScript(expandedScript === s.title ? null : s.title)}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.hex }} />
                  <div className="flex-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: s.hex }}>{s.category}</div>
                    <div className="text-sm font-semibold text-white">{s.title}</div>
                  </div>
                  <svg className={`w-4 h-4 text-slate-600 transition-transform ${expandedScript === s.title ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedScript === s.title && (
                  <div className="px-5 pb-5 grid grid-cols-2 gap-4">
                    <div className="rounded-lg p-4 border" style={{ background: "#0F0A1E", borderColor: `${s.hex}20` }}>
                      <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: s.hex }}>The Script</div>
                      <p className="text-sm text-slate-200 italic leading-relaxed">{s.script}</p>
                    </div>
                    <div className="rounded-lg p-4 border border-[#2A1852]" style={{ background: "#0F0A1E" }}>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#A78BFA] mb-2">Psychology</div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">{s.psychology}</p>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">When to use</div>
                      <p className="text-[10px] text-slate-500">{s.target}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
 
        {/* CHAT */}
        {tab === "chat" && (
          <div className={`${CARD} border ${BDR} rounded-xl overflow-hidden flex flex-col`} style={{ height: "560px" }}>
            <div className="px-5 py-4 border-b border-[#0F1829] flex items-center gap-3 flex-shrink-0">
              <div className="w-7 h-7 rounded-md bg-[#5B21B6] flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
              <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{firstName}'s personal coach</div><div className="text-sm font-semibold text-white">Ask anything about sales, scripts, or strategy</div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-[#5B21B6]/10 border border-[#7C3AED]/20 flex items-center justify-center"><svg className="w-5 h-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>
                  <div><div className="text-sm font-medium text-white">{firstName}'s personal coach</div><div className="text-[11px] text-slate-600 mt-0.5">Ask about your numbers, scripts, client types, or anything sales</div></div>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
                    {["Give me the rebooking script","What's my biggest opportunity today?","How do I upsell without being pushy?","Set me a revenue target for this week"].map(p => (
                      <button key={p} onClick={() => setChatInput(p)} className="text-[10px] border border-[#2A1852] text-slate-500 hover:text-slate-200 hover:border-[#3A2268] px-2.5 py-1.5 rounded-md transition-all">{p}</button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMsgs.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && <div className="w-6 h-6 rounded-md bg-[#5B21B6] flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg></div>}
                    <div className={`max-w-[78%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-[#5B21B6] text-white rounded-tr-sm" : "border border-[#2A1852] text-slate-300 rounded-tl-sm"}`} style={msg.role === "assistant" ? { background: "#0F0A1E" } : {}}>{msg.content}</div>
                  </div>
                ))
              )}
              {chatLoading && <div className="flex gap-3"><div className="w-6 h-6 rounded-md bg-[#5B21B6] flex items-center justify-center flex-shrink-0"><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /></div><div className="px-4 py-3 rounded-xl rounded-tl-sm border border-[#2A1852] flex gap-1 items-center" style={{ background: "#0F0A1E" }}>{[0,150,300].map(d => <div key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div></div>}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-[#0F1829] p-4 flex-shrink-0">
              <form onSubmit={e => { e.preventDefault(); sendChat(); }} className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={chatLoading} placeholder={`Ask ${firstName}'s coach anything...`}
                  className="flex-1 rounded-md px-4 py-2.5 text-sm text-white placeholder-slate-600 border border-[#2A1852] focus:border-[#7C3AED]/40 focus:outline-none transition-all" style={{ background: "#0F0A1E" }} />
                <button type="submit" disabled={chatLoading || !chatInput.trim()} className="rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-all" style={{ background: "#5B21B6" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}
        {/* DIARY TAB */}
        {tab === "diary" && barber && (
          <DiaryWidget
            venueId={VENUE_ID}
            barberSlug={slug}
            barberName={barber.name}
            mode="barber"
          />
        )}
 
      </div>
    </div>
  );
}