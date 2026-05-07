"use client";
 
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface BarberStats {
  total_revenue: number;
  avg_service_value: number;
  avg_appt_value: number;
  total_appts: number;
  rebooked_clients: number;
  rebook_rate: number;
  total_clients: number;
  new_clients: number;
  returning_clients: number;
  pct_returning_clients: number;
  total_upsell_items: number;
  upsell_rate: number;
  occupancy_rate: number;
  avg_rating: number;
  review_count: number;
  services_sold: number;
  pct_requested_by_client: number;
}
 
interface Barber {
  id: string;
  name: string;
  slug: string;
  role: string;
  color_from: string;
  color_to: string;
}
 
interface Message {
  role: "user" | "assistant";
  content: string;
  isCoachNote?: boolean;
}
 
// ─── Scenarios ────────────────────────────────────────────────────────────────
 
const SCENARIOS = [
  {
    id: "rebooking",
    title: "Rebooking After Service",
    description: "Client is happy, about to leave. Lock in the next appointment.",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400 bg-yellow-900/30 border-yellow-600/40",
    focus: "rebook_rate",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    tip: "Never ask 'Would you like to rebook?' — give two specific time options instead.",
  },
  {
    id: "upsell_beard",
    title: "Beard Treatment Upsell",
    description: "You notice the client's beard is dry. Add a $15-20 treatment.",
    difficulty: "Easy",
    difficultyColor: "text-green-400 bg-green-900/30 border-green-600/40",
    focus: "upsell_rate",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    tip: "Observe the problem first. Then pick up the product — assume the yes.",
  },
  {
    id: "win_back",
    title: "Win Back a Lapsed Client",
    description: "A regular who hasn't been in for 4 months just walked in.",
    difficulty: "Hard",
    difficultyColor: "text-red-400 bg-red-900/30 border-red-600/40",
    focus: "returning_clients",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    tip: "Make them feel welcome, not judged. Then rebook before they leave.",
  },
  {
    id: "first_timer",
    title: "First Timer Conversion",
    description: "Brand new client. If you nail this, they become a regular.",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400 bg-yellow-900/30 border-yellow-600/40",
    focus: "new_clients",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    tip: "Build rapport before the cut. They're evaluating whether this is their new place.",
  },
  {
    id: "product_retail",
    title: "Product Retail Sale",
    description: "Client asks what product you're using. Close the retail sale.",
    difficulty: "Easy",
    difficultyColor: "text-green-400 bg-green-900/30 border-green-600/40",
    focus: "upsell_rate",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    tip: "Name the product, explain why for their hair, physically show it, give a price anchor.",
  },
];
 
// ─── Script vault ─────────────────────────────────────────────────────────────
 
const SCRIPTS = [
  {
    title: "The Rebooking Close",
    category: "Rebooking",
    categoryColor: "text-blue-400",
    script: `"Before you head off — let's get your next appointment locked in. Four weeks from today puts you on [DATE]. I have 10am or 2pm — which works better for you?"`,
    why: "Two specific options = a choice between two yeses. 'Would you like to rebook?' is a yes/no question with a 78.8% chance of a no. Timing: while they're still in the chair, feeling great about themselves.",
    whenToUse: "While client is still in the chair, before they stand up.",
  },
  {
    title: "The Upsell Observe & Assume",
    category: "Upsell",
    categoryColor: "text-amber-400",
    script: `"Your beard's looking a bit dry — I'll add a quick treatment, takes two minutes and makes the whole cut last way longer." [Pick up the product without waiting for a response]`,
    why: "Observe the problem → state the benefit → assume the yes. Asking 'would you like a treatment?' creates a decision point where no is easy. Acting like it's already happening creates commitment.",
    whenToUse: "Mid-cut when you notice an upsell opportunity. Never at the end.",
  },
  {
    title: "The Loyalty Recognition",
    category: "Loyalty",
    categoryColor: "text-green-400",
    script: `"Good to see you back [NAME] — you're one of my regulars now, let me [small extra: tidy up the neckline / throw in a hot towel]."`,
    why: "Recognition creates identity. When someone feels like a 'regular', they act like one. The small gesture costs you nothing but creates loyalty worth hundreds per year.",
    whenToUse: "For clients on their 3rd+ visit.",
  },
  {
    title: "The Product Retail Close",
    category: "Retail",
    categoryColor: "text-purple-400",
    script: `"That's [PRODUCT NAME] — I used it because your hair's [thick/fine/wavy] and it holds without going stiff. Worth $X, lasts you 3 months easy. I'll grab you one."`,
    why: "Personalise to their hair type → price anchor before they can object → physical action (grabbing it) signals the transaction is happening.",
    whenToUse: "When client asks what product you're using, or at the styling stage.",
  },
  {
    title: "The Win-Back Welcome",
    category: "Retention",
    categoryColor: "text-pink-400",
    script: `"Hey [NAME]! Good to have you back. How've you been?" [Pause, let them settle. Don't mention how long it's been. Later:] "Let's lock in your next one before you go so you don't lose your spot."`,
    why: "Making someone feel judged for being away guarantees they don't come back. Warmth with no guilt = immediate re-engagement. The rebooking at the end is critical.",
    whenToUse: "When a lapsed client walks back in.",
  },
];
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
 
function parsCoachNote(text: string): { clientResponse: string; coachNote: string | null } {
  const match = text.match(/\[COACH FEEDBACK:([\s\S]*?)\]/);
  if (match) {
    return {
      clientResponse: text.replace(/\[COACH FEEDBACK:[\s\S]*?\]/, "").trim(),
      coachNote: match[1].trim(),
    };
  }
  return { clientResponse: text, coachNote: null };
}
 
function formatMission(text: string) {
  return (
    <div className="space-y-3">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return null;
        if (line.startsWith("🎯") || line.startsWith("📊") || line.startsWith("💡") || line.startsWith("⚡")) {
          const [emoji, ...rest] = line.split(" ");
          const title = rest.slice(0, 2).join(" ");
          const content = rest.slice(2).join(" ");
          return (
            <div key={i} className="bg-purple-900/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{emoji}</span>
                <span className="text-white font-semibold text-sm">{title}</span>
              </div>
              {content && <p className="text-purple-100 text-sm leading-relaxed">{content}</p>}
            </div>
          );
        }
        return <p key={i} className="text-purple-200 text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}
 
// ─── Main Page ────────────────────────────────────────────────────────────────
 
export default function RydraCoachPage() {
  const params = useParams();
  const slug = params?.id as string;
 
  const [barber, setBarber] = useState<Barber | null>(null);
  const [stats, setStats] = useState<BarberStats | null>(null);
  const [shopAvg, setShopAvg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
 
  // Tabs
  const [activeTab, setActiveTab] = useState<"mission" | "practice" | "scripts" | "chat">("mission");
 
  // Mission
  const [mission, setMission] = useState("");
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionGenerated, setMissionGenerated] = useState(false);
 
  // Practice / Roleplay
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [roleplayMessages, setRoleplayMessages] = useState<Message[]>([]);
  const [roleplayInput, setRoleplayInput] = useState("");
  const [roleplayLoading, setRoleplayLoading] = useState(false);
  const [roleplayStarted, setRoleplayStarted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
 
  // Coach chat
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
 
  // Script vault
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
 
  const roleplayEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
 
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/barber/${slug}?venue_id=${VENUE_ID}`)
      .then(r => r.json())
      .then(data => {
        setBarber(data.barber);
        setStats(data.stats);
        setShopAvg(data.shop_avg);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);
 
  useEffect(() => {
    roleplayEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roleplayMessages, roleplayLoading]);
 
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);
 
  async function generateMission() {
    if (!barber || !stats) return;
    setMissionLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barber, stats, shop_avg: shopAvg, type: "daily_mission" }),
      });
      const data = await res.json();
      setMission(data.response || "");
      setMissionGenerated(true);
    } catch (e) { console.error(e); }
    finally { setMissionLoading(false); }
  }
 
  async function startScenario(scenarioId: string) {
    if (!barber || !stats) return;
    setSelectedScenario(scenarioId);
    setRoleplayMessages([]);
    setFeedback("");
    setRoleplayStarted(true);
    setRoleplayLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber, stats, shop_avg: shopAvg,
          type: "roleplay",
          scenario_id: scenarioId,
          messages: [],
          query: "Start the scenario. Set the scene briefly as the client, then wait for the barber to speak.",
        }),
      });
      const data = await res.json();
      const { clientResponse } = parsCoachNote(data.response || "");
      setRoleplayMessages([{ role: "assistant", content: clientResponse }]);
    } catch (e) { console.error(e); }
    finally { setRoleplayLoading(false); }
  }
 
  async function sendRoleplayMessage() {
    if (!roleplayInput.trim() || roleplayLoading || !barber || !stats || !selectedScenario) return;
    const msg = roleplayInput.trim();
    setRoleplayInput("");
    const newMessages: Message[] = [...roleplayMessages, { role: "user", content: msg }];
    setRoleplayMessages(newMessages);
    setRoleplayLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber, stats, shop_avg: shopAvg,
          type: "roleplay",
          scenario_id: selectedScenario,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          query: msg,
        }),
      });
      const data = await res.json();
      const { clientResponse, coachNote } = parsCoachNote(data.response || "");
      const updated: Message[] = [...newMessages, { role: "assistant", content: clientResponse }];
      if (coachNote) updated.push({ role: "assistant", content: coachNote, isCoachNote: true });
      setRoleplayMessages(updated);
    } catch (e) { console.error(e); }
    finally { setRoleplayLoading(false); }
  }
 
  async function getFeedback() {
    if (!barber || !stats || !selectedScenario || roleplayMessages.length < 2) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber, stats, shop_avg: shopAvg,
          type: "scenario_feedback",
          scenario_id: selectedScenario,
          messages: roleplayMessages.filter(m => !m.isCoachNote).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setFeedback(data.response || "");
    } catch (e) { console.error(e); }
    finally { setFeedbackLoading(false); }
  }
 
  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading || !barber || !stats) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newMessages: Message[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/rydra-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber, stats, shop_avg: shopAvg,
          type: "coach_chat",
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          query: msg,
        }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (e) { console.error(e); }
    finally { setChatLoading(false); }
  }
 
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
 
  if (!barber || !stats) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] flex items-center justify-center">
      <p className="text-white">Barber not found. <a href="/merchant/barber" className="text-purple-400 underline">Go back</a></p>
    </div>
  );
 
  const firstName = barber.name.split(" ")[0];
  const scenario = SCENARIOS.find(s => s.id === selectedScenario);
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0118] via-[#1A0B2E] to-[#0A0118] text-white pb-16">
 
      {/* ── Header ── */}
      <div className="border-b border-purple-800/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold">RydraCoach</h1>
              <p className="text-purple-300 text-xs">{firstName}'s Personal Sales Academy · Alkami Barbershop</p>
            </div>
          </div>
 
          {/* Nav tabs */}
          <div className="flex items-center bg-purple-900/40 border border-purple-700/40 rounded-xl p-1 gap-1">
            <a href="/merchant/dashboard" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Dashboard
            </a>
            <a href="/merchant/outreach" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              Outreach
            </a>
            <a href="/merchant/barber" className="px-4 py-2 rounded-lg text-purple-300 hover:text-white hover:bg-purple-800/50 text-sm font-medium transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Barbers
            </a>
          </div>
 
          <a href={`/merchant/barber/${slug}`} className="flex-shrink-0 text-purple-400 hover:text-white text-sm flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {firstName}'s dashboard
          </a>
        </div>
      </div>
 
      <div className="max-w-[1400px] mx-auto px-8 py-8">
 
        {/* Barber profile strip */}
        <div className="flex items-center gap-5 mb-8 bg-gradient-to-r from-purple-900/30 to-purple-800/20 rounded-2xl border border-purple-700/30 p-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}>
            {getInitials(barber.name)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{barber.name} — RydraCoach</h2>
            <p className="text-purple-300 text-sm">Personal AI Sales Training Academy</p>
          </div>
          {/* Quick stats */}
          <div className="flex gap-4">
            {[
              { label: "Rebook Rate", value: `${(stats.rebook_rate * 100).toFixed(1)}%`, target: "22%", good: stats.rebook_rate >= 0.18 },
              { label: "Avg Service", value: `$${stats.avg_service_value.toFixed(0)}`, target: "$70 avg", good: stats.avg_service_value >= 65 },
              { label: "Upsell Rate", value: `${(stats.upsell_rate * 100).toFixed(1)}%`, target: "5% target", good: stats.upsell_rate >= 0.04 },
            ].map(({ label, value, target, good }) => (
              <div key={label} className="bg-purple-900/40 rounded-xl px-4 py-3 text-center">
                <div className={`text-lg font-bold ${good ? "text-green-400" : "text-red-400"}`}>{value}</div>
                <div className="text-purple-400 text-xs">{label}</div>
                <div className="text-purple-600 text-xs">{target}</div>
              </div>
            ))}
          </div>
        </div>
 
        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 bg-purple-900/30 border border-purple-800/30 rounded-2xl p-1.5">
          {[
            { id: "mission", label: "Today's Mission", icon: "🎯" },
            { id: "practice", label: "Practice Arena", icon: "⚡" },
            { id: "scripts", label: "Script Vault", icon: "📋" },
            { id: "chat", label: "Coach Chat", icon: "💬" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20"
                  : "text-purple-400 hover:text-white hover:bg-purple-800/40"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
 
        {/* ── TODAY'S MISSION ── */}
        {activeTab === "mission" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 rounded-2xl border border-purple-700/40 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Today's Mission</h2>
                    <p className="text-purple-400 text-sm">AI-generated based on your real numbers</p>
                  </div>
                  <button onClick={generateMission} disabled={missionLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20">
                    {missionLoading ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</>
                    ) : missionGenerated ? "Regenerate" : "Generate Mission"}
                  </button>
                </div>
 
                {mission ? (
                  <div>{formatMission(mission)}</div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🎯</div>
                    <p className="text-white font-medium text-lg mb-2">Ready to set your mission</p>
                    <p className="text-purple-400 text-sm max-w-sm mx-auto">
                      Your AI coach will generate a personalised daily target based on your actual rebook rate, upsell rate, and revenue data.
                    </p>
                    <button onClick={generateMission} disabled={missionLoading}
                      className="mt-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white font-medium transition-all">
                      Generate Today's Mission
                    </button>
                  </div>
                )}
              </div>
            </div>
 
            {/* Sidebar: Key opportunities */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">Your Opportunities</h3>
              {[
                stats.rebook_rate < 0.18 && {
                  label: "Rebook Rate Gap",
                  detail: `You're at ${(stats.rebook_rate * 100).toFixed(1)}% — shop avg is ${shopAvg ? (shopAvg.rebook_rate * 100).toFixed(1) : "17.5"}%`,
                  potential: `+$${Math.round((stats.total_clients * 0.22 - stats.rebooked_clients) * stats.avg_appt_value * 0.6 / 12).toLocaleString()}/mo potential`,
                  color: "border-red-600/40 bg-red-900/20",
                  action: () => { setActiveTab("practice"); setSelectedScenario("rebooking"); },
                  actionLabel: "Practice rebooking →",
                },
                stats.upsell_rate < 0.05 && {
                  label: "Upsell Opportunity",
                  detail: `${(stats.upsell_rate * 100).toFixed(1)}% upsell rate — industry best is 8-10%`,
                  potential: `+$${Math.round(stats.total_appts * 0.05 * 20 / 12).toLocaleString()}/mo if you add 5%`,
                  color: "border-amber-600/40 bg-amber-900/20",
                  action: () => { setActiveTab("practice"); setSelectedScenario("upsell_beard"); },
                  actionLabel: "Practice upselling →",
                },
                stats.pct_returning_clients < 0.22 && {
                  label: "Client Retention",
                  detail: `${(stats.pct_returning_clients * 100).toFixed(1)}% returning clients — room to grow`,
                  potential: `Loyal clients are worth 3× a first-timer`,
                  color: "border-blue-600/40 bg-blue-900/20",
                  action: () => { setActiveTab("practice"); setSelectedScenario("win_back"); },
                  actionLabel: "Practice loyalty →",
                },
              ].filter(Boolean).map((opp: any, idx) => (
                <div key={idx} className={`rounded-xl border p-4 ${opp.color}`}>
                  <div className="font-semibold text-white text-sm mb-1">{opp.label}</div>
                  <div className="text-xs text-purple-300 mb-1">{opp.detail}</div>
                  <div className="text-xs text-green-400 font-medium mb-3">{opp.potential}</div>
                  <button onClick={opp.action} className="text-xs text-purple-300 hover:text-white transition-colors font-medium">
                    {opp.actionLabel}
                  </button>
                </div>
              ))}
 
              <div className="bg-purple-900/30 border border-purple-700/30 rounded-xl p-4">
                <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">Today's Quick Target</div>
                <div className="space-y-2">
                  {[
                    { label: "Rebook clients", target: Math.min(Math.round(stats.total_appts / 30 * 0.22), 6) },
                    { label: "Upsells", target: Math.min(Math.round(stats.total_appts / 30 * 0.08), 3) },
                  ].map(({ label, target }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm text-purple-300">{label}</span>
                      <span className="text-white font-bold">{target}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
 
        {/* ── PRACTICE ARENA ── */}
        {activeTab === "practice" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 
            {/* Scenario selector */}
            <div>
              <h3 className="text-base font-semibold text-white mb-4">Choose a Scenario</h3>
              <div className="space-y-3">
                {SCENARIOS.map(s => (
                  <div
                    key={s.id}
                    onClick={() => startScenario(s.id)}
                    className={`rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                      selectedScenario === s.id
                        ? "border-purple-500 bg-purple-900/50"
                        : "border-purple-800/30 bg-purple-950/40 hover:border-purple-600/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        selectedScenario === s.id ? "bg-purple-600" : "bg-purple-900/60"
                      }`}>
                        <div className="text-purple-300">{s.icon}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-white text-sm font-medium">{s.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${s.difficultyColor}`}>{s.difficulty}</span>
                        </div>
                        <p className="text-purple-400 text-xs leading-snug">{s.description}</p>
                      </div>
                    </div>
                    {s.id === selectedScenario && (
                      <div className="mt-3 pt-3 border-t border-purple-700/30 text-xs text-purple-300">
                        <span className="font-medium text-purple-400">Key tip: </span>{s.tip}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
 
            {/* Roleplay chat */}
            <div className="lg:col-span-2">
              {!selectedScenario ? (
                <div className="bg-purple-950/40 border border-purple-800/30 rounded-2xl p-12 flex flex-col items-center justify-center text-center h-full min-h-[500px]">
                  <div className="text-6xl mb-4">⚡</div>
                  <h3 className="text-white font-semibold text-lg mb-2">Practice Arena</h3>
                  <p className="text-purple-400 text-sm max-w-sm">Pick a scenario on the left. The AI will play the client — you practice the script. After 3-4 exchanges, you'll get specific coaching feedback.</p>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-purple-950/60 to-purple-900/30 border border-purple-700/40 rounded-2xl flex flex-col" style={{ minHeight: "500px" }}>
                  {/* Scenario header */}
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-purple-800/30 bg-purple-900/30 rounded-t-2xl">
                    <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {scenario?.title[0]}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{scenario?.title}</div>
                      <div className="text-purple-400 text-xs">AI playing client · {firstName} is the barber</div>
                    </div>
                    <button onClick={() => { setSelectedScenario(null); setRoleplayMessages([]); setFeedback(""); }}
                      className="ml-auto text-purple-500 hover:text-purple-300 text-xs transition-colors">
                      Exit scenario
                    </button>
                  </div>
 
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ maxHeight: "380px" }}>
                    {roleplayMessages.map((msg, idx) => (
                      <div key={idx}>
                        {msg.isCoachNote ? (
                          <div className="bg-amber-900/30 border border-amber-600/40 rounded-xl px-4 py-3 mx-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">⚡ Coach Note</span>
                            </div>
                            <p className="text-amber-100 text-sm leading-relaxed">{msg.content}</p>
                          </div>
                        ) : (
                          <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.role === "assistant" && (
                              <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-1">
                                {scenario?.id === "rebooking" ? "M" : scenario?.id === "win_back" ? "J" : "C"}
                              </div>
                            )}
                            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              msg.role === "user"
                                ? "bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-tr-sm"
                                : "bg-purple-800/50 border border-purple-700/40 text-purple-100 rounded-tl-sm"
                            }`}>
                              {msg.content}
                            </div>
                            {msg.role === "user" && (
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-1"
                                style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}>
                                {getInitials(barber.name)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {roleplayLoading && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0">
                          <div className="flex gap-0.5">
                            {[0,100,200].map(d => <div key={d} className="w-1 h-1 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={roleplayEndRef} />
                  </div>
 
                  {/* Input */}
                  <div className="border-t border-purple-800/30 p-4">
                    {feedback && (
                      <div className="mb-3 bg-green-900/30 border border-green-600/40 rounded-xl p-4">
                        <div className="text-green-400 text-xs font-bold uppercase tracking-wider mb-2">📊 Full Session Feedback</div>
                        <p className="text-green-100 text-sm leading-relaxed">{feedback}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={roleplayInput}
                        onChange={e => setRoleplayInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendRoleplayMessage(); }}}
                        disabled={roleplayLoading}
                        placeholder={`Type what you'd say to the client as ${firstName}...`}
                        className="flex-1 bg-purple-900/40 border border-purple-700/40 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm"
                      />
                      <button onClick={sendRoleplayMessage} disabled={roleplayLoading || !roleplayInput.trim()}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-xl px-4 py-2.5 transition-all">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                      {roleplayMessages.length >= 4 && (
                        <button onClick={getFeedback} disabled={feedbackLoading}
                          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-xl px-4 py-2.5 text-white text-sm font-medium transition-all whitespace-nowrap">
                          {feedbackLoading ? "..." : "Get Feedback"}
                        </button>
                      )}
                    </div>
                    <p className="text-purple-600 text-xs mt-2">Respond as you would in the actual situation. The AI will react like a real client.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
 
        {/* ── SCRIPT VAULT ── */}
        {activeTab === "scripts" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white mb-1">Script Vault</h2>
              <p className="text-purple-400 text-sm">Verbatim scripts with the psychology behind each one. Learn these, then make them your own.</p>
            </div>
            <div className="space-y-4">
              {SCRIPTS.map((script, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-br from-purple-950/50 to-purple-900/30 border border-purple-800/30 rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedScript(expandedScript === script.title ? null : script.title)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-purple-900/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-900/60 flex items-center justify-center text-lg flex-shrink-0">
                        {idx === 0 ? "📅" : idx === 1 ? "✨" : idx === 2 ? "💛" : idx === 3 ? "🛍️" : "🤝"}
                      </div>
                      <div>
                        <div className="text-white font-semibold">{script.title}</div>
                        <div className={`text-xs font-medium mt-0.5 ${script.categoryColor}`}>{script.category}</div>
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-purple-400 transition-transform ${expandedScript === script.title ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
 
                  {expandedScript === script.title && (
                    <div className="px-6 pb-6 space-y-4 border-t border-purple-800/30">
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">The Script</div>
                        <div className="bg-purple-900/40 border border-purple-600/30 rounded-xl p-4">
                          <p className="text-white text-sm leading-relaxed font-medium italic">{script.script}</p>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Why It Works</div>
                        <p className="text-purple-200 text-sm leading-relaxed">{script.why}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">When to Use</div>
                        <p className="text-purple-300 text-sm">{script.whenToUse}</p>
                      </div>
                      <button
                        onClick={() => { setActiveTab("practice"); const match = SCENARIOS.find(s => s.title.toLowerCase().includes(script.category.toLowerCase())); if (match) startScenario(match.id); }}
                        className="flex items-center gap-2 text-sm text-purple-300 hover:text-white transition-colors font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Practice this script in the arena →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
 
        {/* ── COACH CHAT ── */}
        {activeTab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Suggested prompts */}
            <div>
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider mb-3">Ask your coach</h3>
              <div className="space-y-2">
                {[
                  `What's my biggest revenue opportunity right now?`,
                  "Give me the full rebooking script",
                  "How do I upsell without being pushy?",
                  "Set me a weekly revenue target",
                  "How do I handle a client who says they're busy?",
                  "What should I say when a client hasn't been in months?",
                  "How can I increase my average service value?",
                  "Give me tips for building client loyalty",
                ].map(p => (
                  <button key={p} onClick={() => { setChatInput(p); }}
                    className="w-full text-left text-xs text-purple-300 hover:text-white bg-purple-900/20 hover:bg-purple-800/40 border border-purple-800/30 hover:border-purple-600/50 rounded-xl px-3 py-2.5 transition-all leading-snug">
                    {p}
                  </button>
                ))}
              </div>
            </div>
 
            {/* Chat window */}
            <div className="lg:col-span-3 bg-gradient-to-br from-purple-950/60 to-purple-900/30 border border-purple-700/40 rounded-2xl flex flex-col" style={{ minHeight: "580px" }}>
              <div className="border-b border-purple-800/30 px-6 py-4 bg-purple-900/30 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold">RydraCoach</div>
                    <div className="text-purple-400 text-xs">{firstName}'s personal AI sales trainer · Knows your numbers</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-xs">Online</span>
                  </div>
                </div>
              </div>
 
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-12">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-700/30 flex items-center justify-center">
                      <svg className="w-8 h-8 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-medium">Hey {firstName} 👋</p>
                      <p className="text-purple-400 text-sm mt-1 max-w-xs">I know your numbers. Ask me anything — scripts, targets, how to handle tricky clients, revenue goals. Let's go.</p>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mt-1">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                        </svg>
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-tr-sm"
                        : "bg-purple-900/50 border border-purple-700/40 text-purple-100 rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-1"
                        style={{ background: `linear-gradient(135deg, ${barber.color_from}, ${barber.color_to})` }}>
                        {getInitials(barber.name)}
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <div className="flex gap-0.5">
                        {[0,100,200].map(d => <div key={d} className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
 
              <div className="border-t border-purple-800/30 p-4 bg-purple-950/30 rounded-b-2xl">
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }}}
                    disabled={chatLoading}
                    placeholder={`Ask your coach anything, ${firstName}...`}
                    className="flex-1 bg-purple-900/40 border border-purple-700/40 hover:border-purple-600/60 focus:border-purple-500 rounded-xl px-4 py-2.5 text-white placeholder-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm transition-colors"
                  />
                  <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 rounded-xl px-5 py-2.5 transition-all">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}