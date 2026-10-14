"use client";
// RydraCoach 2.0: a game plan built from real clients, a practice arena with a live mood meter and scorecards,
// a coach that can look up real data and stage texts, and scripts filled in with real dates.
// The coach can never send anything itself: every text is reviewed and sent by a person, through the guarded SMS route.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { aiFetch } from "@/lib/ai/client";
import { DiaryWidget } from "@/app/components/diary-widget";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" }, { href: "/merchant/campaign", label: "Campaign" },
  { href: "/merchant/clients", label: "Clients" }, { href: "/merchant/barber", label: "Barbers", active: true },
];
const SCENARIOS = [
  { id: "rebooking", label: "Rebook in the chair", hex: RED, desc: "Cut's done. Lock in the next one." },
  { id: "upsell", label: "Beard treatment", hex: "#FBBF24", desc: "Offer an add-on mid-cut." },
  { id: "win_back", label: "Welcome back", hex: "#FB923C", desc: "A lapsed regular walks in." },
  { id: "first_timer", label: "First-timer", hex: "#38BDF8", desc: "Win the second visit." },
  { id: "retail", label: "Product sale", hex: PUR_LL, desc: "'What are you using?'" },
  { id: "price", label: "Price objection", hex: "#F472B6", desc: "'Bit pricey, I'll think about it.'" },
  { id: "complaint", label: "Cut isn't right", hex: "#94A3B8", desc: "Turn it around." },
];
type Staged = { user_id: string; name: string; message: string; reason: string; state?: "idle" | "sending" | "sent" | "failed"; note?: string };
type Msg = { role: "user" | "assistant"; content: string; texts?: Staged[] };
type Run = { at: string; scenario: string; label: string; difficulty: string; score: number };

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const level = (xp: number) => { let l = 1, need = 100, left = xp; while (left >= need) { left -= need; l++; need = 100 + l * 40; } return { l, into: left, need }; };
const title = (l: number) => (l >= 10 ? "Master barber" : l >= 7 ? "Closer" : l >= 4 ? "Sharp" : l >= 2 ? "Rising" : "Apprentice");

function Md({ text }: { text: string }) {
  return <div className="space-y-1.5 text-sm leading-relaxed">{text.split("\n").map((l, i) => { const t = l.trim(); if (!t) return <div key={i} className="h-1" />; const bullet = /^[-*•]\s+/.test(t); const body = t.replace(/^[-*•]\s+/, ""); const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith("**") ? <strong key={j} className="text-white">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>); return <div key={i} className={bullet ? "flex gap-2" : ""}>{bullet && <span style={{ color: PUR_LL }}>•</span>}<div>{parts}</div></div>; })}</div>;
}

function Coach() {
  const { id: slug } = useParams() as { id: string };
  const sp = useSearchParams();
  const VENUE_ID = process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
  const [tab, setTab] = useState<"today" | "arena" | "ask" | "vault" | "diary">("today");
  const [info, setInfo] = useState<any>(null);
  const [cfg, setCfg] = useState<{ body_max: number; booking_link: string } | null>(null);
  const [err, setErr] = useState("");

  // progress (per barber, this browser)
  const [runs, setRuns] = useState<Run[]>([]);
  const [tally, setTally] = useState<{ date: string; cuts: number; rebooked: number; upsold: number }>({ date: todayKey(), cuts: 0, rebooked: 0, upsold: 0 });

  // today
  const [mission, setMission] = useState<any>(null); const [missionText, setMissionText] = useState(""); const [missionLoading, setMissionLoading] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);

  // arena
  const [sid, setSid] = useState("rebooking"); const [diff, setDiff] = useState<"easy" | "normal" | "hard">("normal");
  const [rp, setRp] = useState<Msg[]>([]); const [rpInput, setRpInput] = useState(""); const [rpLoading, setRpLoading] = useState(false);
  const [mood, setMood] = useState<{ v: number; start: number } | null>(null); const [closed, setClosed] = useState(false); const [tip, setTip] = useState<string | null>(null); const [clientName, setClientName] = useState("Client");
  const [card, setCard] = useState<any>(null); const [scoring, setScoring] = useState(false);
  const [realId, setRealId] = useState(""); const [realName, setRealName] = useState("");
  const [book, setBook] = useState<any[]>([]);

  // ask
  const [chat, setChat] = useState<Msg[]>([]); const [chatInput, setChatInput] = useState(""); const [chatLoading, setChatLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null); const rpEnd = useRef<HTMLDivElement>(null);

  const first = info?.barber?.name?.split(" ")[0] ?? "";
  const key = `rydra-coach-${slug}`;
  const xp = runs.reduce((s, r) => s + Math.round(r.score / 2), 0);
  const lv = level(xp);
  const streak = useMemo(() => { const days = new Set(runs.map((r) => r.at.slice(0, 10))); let n = 0; const d = new Date(todayKey() + "T12:00:00Z"); if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1); while (days.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); } return n; }, [runs]);

  useEffect(() => { setRuns(store.get<Run[]>(`${key}-runs`, [])); const t = store.get<any>(`${key}-tally`, null); if (t && t.date === todayKey()) setTally(t); }, [key]);
  useEffect(() => { store.set(`${key}-tally`, tally); }, [tally, key]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);
  useEffect(() => { rpEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [rp]);

  useEffect(() => { (async () => { try { const r = await aiFetch(`/api/team/${slug}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setInfo(j); setBook(j.barber?.metrics?.book ?? []); setCfg({ body_max: j.config?.body_max ?? 100, booking_link: "" }); } catch (e: any) { setErr(e?.message || "Could not load this barber"); } })(); }, [slug]);

  const api = useCallback(async (body: any) => { const r = await aiFetch("/api/ai/rydra-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Something went wrong"); return j; }, [slug]);
  const stage = (ts: any[] | undefined, c: any) => { if (c) setCfg(c); return (ts ?? []).map((t: any) => ({ ...t, state: "idle" as const })); };

  const loadMission = useCallback(async (force = false) => {
    const ck = `${key}-mission`;
    if (!force) { const c = store.get<any>(ck, null); if (c && c.date === todayKey() && Date.now() - c.at < 3 * 3600_000) { setMission(c.mission); setMissionText(c.text); setStaged(c.staged ?? []); if (c.cfg) setCfg(c.cfg); return; } }
    setMissionLoading(true);
    try { const j = await api({ type: "mission" }); const st = stage(j.texts, j.config); setMission(j.mission); setMissionText(j.response || ""); setStaged(st); store.set(ck, { date: todayKey(), at: Date.now(), mission: j.mission, text: j.response || "", staged: st, cfg: j.config }); }
    catch (e: any) { setErr(e?.message || "Coach unavailable"); } setMissionLoading(false);
  }, [api, key]);
  useEffect(() => { if (info) loadMission(); }, [info, loadMission]);

  // deep links: ?q=...  ?scenario=...  ?client=<user_id>
  useEffect(() => {
    if (!info) return; const q = sp.get("q"); const sc = sp.get("scenario"); const cl = sp.get("client");
    if (q) { setTab("ask"); setChatInput(q); }
    else if (cl) { const c = book.find((x) => x.user_id === cl); setTab("arena"); setRealId(cl); setRealName(c?.name ?? "client"); setSid(`real:${cl}`); }
    else if (sc && SCENARIOS.some((s) => s.id === sc)) { setTab("arena"); setSid(sc); }
  }, [info]); // eslint-disable-line

  // ── Arena ────────────────────────────────────────────────────────────────
  async function startRp(id = sid) {
    setSid(id); setRp([]); setCard(null); setClosed(false); setTip(null); setMood(null); setRpLoading(true);
    try { const j = await api({ type: "roleplay", scenario: id, difficulty: diff, messages: [] }); setClientName(j.client); setMood({ v: j.mood, start: j.start }); setRp([{ role: "assistant", content: j.reply }]); }
    catch (e: any) { setErr(e?.message || "Could not start"); } setRpLoading(false);
  }
  async function sayRp() {
    const t = rpInput.trim(); if (!t || rpLoading || closed) return; const next: Msg[] = [...rp, { role: "user", content: t }]; setRp(next); setRpInput(""); setRpLoading(true); setTip(null);
    try { const j = await api({ type: "roleplay", scenario: sid, difficulty: diff, messages: next.map(({ role, content }) => ({ role, content })) }); setRp([...next, { role: "assistant", content: j.reply }]); setMood({ v: j.mood, start: mood?.start ?? j.start }); setTip(j.tip); if (j.closed) setClosed(true); }
    catch (e: any) { setErr(e?.message || "Lost the client for a sec"); } setRpLoading(false);
  }
  async function score() {
    setScoring(true);
    try { const j = await api({ type: "score", scenario: sid, difficulty: diff, messages: rp.map(({ role, content }) => ({ role, content })) }); setCard(j);
      const label = sid.startsWith("real:") ? `Real: ${realName}` : SCENARIOS.find((s) => s.id === sid)?.label ?? sid; const nr = [{ at: new Date().toISOString(), scenario: sid.startsWith("real:") ? "real" : sid, label, difficulty: diff, score: j.score }, ...runs].slice(0, 60); setRuns(nr); store.set(`${key}-runs`, nr); }
    catch (e: any) { setErr(e?.message || "Couldn't score that"); } setScoring(false);
  }
  const userTurns = rp.filter((m) => m.role === "user").length;
  const best = (id: string) => { const r = runs.filter((x) => x.scenario === id); return r.length ? Math.max(...r.map((x) => x.score)) : null; };

  // ── Ask ──────────────────────────────────────────────────────────────────
  async function sendChat(q = chatInput) {
    const t = q.trim(); if (!t || chatLoading) return; const hist = chat.map(({ role, content }) => ({ role, content })); setChat((c) => [...c, { role: "user", content: t }]); setChatInput(""); setChatLoading(true);
    try { const j = await api({ type: "chat", query: t, messages: hist }); setChat((c) => [...c, { role: "assistant", content: j.response || "Not sure how to answer that.", texts: stage(j.texts, j.config) }]); }
    catch (e: any) { setChat((c) => [...c, { role: "assistant", content: e?.message || "Coach is unavailable right now." }]); } setChatLoading(false);
  }

  // ── Staged texts: human reviews, human sends ─────────────────────────────
  const finalText = (m: string, name: string) => `${m.replace(/\{first_name\}/g, (name.split(" ")[0] || "there").replace(/[^A-Za-z'\-]/g, ""))}${cfg?.booking_link ? " " + cfg.booking_link : ""}`.trim();
  async function sendStaged(t: Staged, set: (fn: (t: Staged) => Staged) => void) {
    const text = finalText(t.message, t.name); set((x) => ({ ...x, state: "sending" }));
    try { const r = await aiFetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: t.user_id, message: text, customer_name: t.name, venue_id: VENUE_ID }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Not sent"); set((x) => ({ ...x, state: "sent" })); }
    catch (e: any) { set((x) => ({ ...x, state: "failed", note: e?.message })); }
  }
  const renderStaged = (k: string, t: Staged, set: (fn: (t: Staged) => Staged) => void) => {
    const len = finalText(t.message, t.name).length; const over = cfg ? len > cfg.body_max : false;
    return (
      <div key={k} className="rounded-lg p-3 mt-2" style={{ background: "#0A0612", border: `1px solid ${BDR}` }}>
        <div className="flex justify-between text-[11px] mb-1.5"><span className="font-semibold text-white">{t.name}</span><span style={{ color: MUTED }}>{t.reason}</span></div>
        <textarea value={t.message} disabled={t.state === "sent"} onChange={(e) => set((x) => ({ ...x, message: e.target.value, state: "idle" }))} rows={2} className="w-full rounded p-2 text-xs outline-none resize-none" style={{ background: CARD2, border: `1px solid ${BDR}` }} />
        <div className="flex items-center justify-between mt-1.5"><span className="text-[10px]" style={{ color: over ? RED : MUTED }}>{len}{cfg ? `/${cfg.body_max}` : ""} chars with link</span>
          {t.state === "sent" ? <span className="text-xs font-semibold" style={{ color: GREEN }}>Sent</span> : <button disabled={t.state === "sending" || over} onClick={() => sendStaged(t, set)} className="text-xs font-bold px-3 py-1.5 rounded-md disabled:opacity-40" style={{ background: PUR_L }}>{t.state === "sending" ? "Sending..." : "Send text"}</button>}</div>
        {t.state === "failed" && <div className="text-[11px] mt-1" style={{ color: "#FDA4AF" }}>{t.note}</div>}
      </div>);
  };

  // Scripts with real dates
  const d4 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 28); return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" }); }, []);
  const SCRIPTS = [
    { title: "The rebooking close", sc: "rebooking", hex: RED, text: `"Before you head off, let's lock in your next one. Four weeks from today is ${d4}. I've got 10am or 2pm. Which works better?"`, why: "A specific date plus two options turns 'should I?' into 'which one?'. Say it while they're still in the chair." },
    { title: "Problem, then solution upsell", sc: "upsell", hex: "#FBBF24", text: `"Your beard's a bit dry. I'll add a quick treatment, two minutes, and it makes the cut last longer. Most guys do it."`, why: "Name the problem first, give one concrete benefit, use social proof, then pick up the product." },
    { title: "Welcome-back", sc: "win_back", hex: "#FB923C", text: `"Good to see you, mate. It's been a little while. Everything good? Let's get you sorted, and I'll put your next one in before you leave."`, why: "Warm, no guilt, and the rebook happens before they walk out." },
    { title: "The first-timer follow-through", sc: "first_timer", hex: "#38BDF8", text: `"Really glad you came in. To keep it looking this good, four weeks is the sweet spot. I've got ${d4}. Morning or afternoon?"`, why: "First-timers who rebook in the chair are far more likely to become regulars." },
    { title: "Handling 'bit pricey'", sc: "price", hex: "#F472B6", text: `"Fair enough. Honestly it's the bit that makes the cut last another two weeks. If you'd rather start small, the quick version is half the price. Which suits?"`, why: "Don't discount. Reframe the value, then offer a smaller yes." },
    { title: "Fixing a cut that's off", sc: "complaint", hex: "#94A3B8", text: `"Thanks for telling me. Let's fix it. I'll take it as far as I can today, and your next trim is on me to blend it in. When suits?"`, why: "Listen, own it, give a plan, and keep the relationship by booking the fix." },
  ];

  if (err && !info) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm" style={{ background: "#0A0612" }}><div style={{ color: RED }}>{err}</div><a href="/merchant/barber" className="underline" style={{ color: PUR_LL }}>Back to the team</a></div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: "#0A0612", color: MUTED }}>Warming up your coach...</div>;
  const b = info.barber; const s = b.stats;
  const hot = book.filter((c) => (c.status === "slipping" || c.status === "overdue" || c.status === "due" || c.status === "lapsed") && !c.booked).sort((x, y) => y.atStake - x.atStake).slice(0, 6);
  const rebookToday = tally.cuts ? Math.round((tally.rebooked / tally.cuts) * 100) : null;
  const moodColor = mood ? (mood.v >= 70 ? GREEN : mood.v >= 40 ? GOLD : RED) : MUTED;

  return (
    <div className="min-h-screen text-white pb-16" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1300px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} /><div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none">RydraCoach</div></div></div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${(t as any).active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <a href={`/merchant/barber/${slug}`} className="ml-auto text-[11px] hover:text-white" style={{ color: MUTED }}>&larr; {first}'s dashboard</a>
        </div>
      </div>

      <div className="max-w-[1300px] mx-auto px-8 pt-8 space-y-6">
        {/* Hero with level */}
        <div className="rounded-xl p-5 border flex flex-wrap items-center gap-6" style={{ background: CARD, borderColor: BDR }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{b.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div>
          <div className="flex-1 min-w-[220px]"><div className="text-xl font-bold">G'day {first}</div><div className="text-sm" style={{ color: MUTED }}>{s ? `Rebook rate ${(num(s.rebook_rate) * 100).toFixed(1)}% vs ${(num(info.shop?.rebook_rate) * 100).toFixed(1)}% shop average` : "Let's get to work"}</div></div>
          <div className="min-w-[200px]"><div className="flex justify-between text-xs mb-1"><span className="font-semibold" style={{ color: GOLD }}>Level {lv.l} · {title(lv.l)}</span><span style={{ color: MUTED }}>{lv.into}/{lv.need} XP</span></div><div className="h-2 rounded-full" style={{ background: CARD2 }}><div className="h-full rounded-full transition-all" style={{ width: `${(lv.into / lv.need) * 100}%`, background: `linear-gradient(90deg, ${PUR_L}, ${GOLD})` }} /></div></div>
          <div className="text-center"><div className="text-2xl font-bold" style={{ color: streak ? GOLD : MUTED }}>{streak}</div><div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>day streak</div></div>
        </div>

        <div className="flex gap-1 border-b" style={{ borderColor: BDR }}>{([["today", "Today"], ["arena", "Practice arena"], ["ask", "Ask the coach"], ["vault", "Scripts"], ["diary", "Diary"]] as const).map(([k, l]) => <button key={k} onClick={() => { setTab(k); setErr(""); }} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider -mb-px border-b-2" style={{ borderColor: tab === k ? PUR_L : "transparent", color: tab === k ? PUR_LL : MUTED }}>{l}</button>)}</div>
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "#2A0F1A", border: `1px solid ${RED}55`, color: "#FDA4AF" }}>{err} <button className="underline ml-2" onClick={() => setErr("")}>Dismiss</button></div>}

        {/* TODAY */}
        {tab === "today" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            <div className="space-y-6">
              <div className="rounded-xl p-5 border" style={{ background: "linear-gradient(135deg, #1B1240, #130C24)", borderColor: `${PUR_L}66` }}>
                <div className="flex justify-between"><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: PUR_LL }}>Today's game plan</div><button onClick={() => loadMission(true)} disabled={missionLoading} className="text-[11px] underline disabled:opacity-40" style={{ color: MUTED }}>{missionLoading ? "Building..." : "Rebuild"}</button></div>
                {mission ? <div className="mt-2"><div className="text-lg font-semibold leading-snug">{mission.headline}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4"><div className="rounded-lg p-3" style={{ background: "#0A0612AA", border: `1px solid ${BDR}` }}><div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Target</div><div className="font-semibold text-sm">{mission.target}</div></div>
                    <div className="rounded-lg p-3" style={{ background: "#0A0612AA", border: `1px solid ${BDR}` }}><div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Why</div><div className="text-sm text-slate-300">{mission.why}</div></div></div>
                  <div className="mt-3 text-sm text-slate-200 leading-relaxed"><span className="font-semibold">The play: </span>{mission.play}</div></div>
                  : <div className="mt-3 text-sm" style={{ color: MUTED }}>{missionLoading ? "Looking at your clients and numbers..." : missionText ? <Md text={missionText} /> : "No plan yet."}</div>}
              </div>

              {staged.length > 0 && (
                <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Texts your coach suggests</div><div className="text-[11px] text-slate-500 mb-1">Edit if you like. Nothing sends until you press Send.</div>
                  {staged.map((t, i) => renderStaged(t.user_id + i, t, (fn) => setStaged((a) => a.map((x, j) => (j === i ? fn(x) : x)))))}
                </div>
              )}

              {book.length === 0 && (
                <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Your clients to look out for</div>
                  <div className="text-sm text-slate-300">Your coach can't see which clients are yours yet, so it can't name who to text or rehearse with.</div>
                  <div className="text-[12px] mt-1" style={{ color: MUTED }}>Once the Fresha appointment history is imported (manager console, Client history), this fills with your regulars who are due or slipping, with one-tap texts.</div>
                </div>
              )}
              {hot.length > 0 && (
                <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Your clients to look out for</div>
                  <div className="space-y-2">{hot.map((c) => <div key={c.user_id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: CARD2 }}>
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium"><a href={`/merchant/clients/${c.user_id}`} className="hover:underline">{c.name}</a></div><div className="text-[11px]" style={{ color: MUTED }}>{c.status === "due" ? "due now" : c.status} · {c.daysSince} days since last visit · {c.visitsWithMe} visits with you</div></div>
                    <button onClick={() => { setTab("arena"); setRealId(c.user_id); setRealName(c.name); setSid(`real:${c.user_id}`); setRp([]); setCard(null); }} className="text-[11px] font-semibold px-3 py-1.5 rounded-md" style={{ background: `${PUR_L}33`, color: PUR_LL }}>Rehearse</button>
                    <button onClick={() => { setTab("ask"); sendChat(`What should I say to ${c.name}? Look them up and stage a text if it makes sense.`); }} className="text-[11px] font-semibold px-3 py-1.5 rounded-md" style={{ background: `${GOLD}22`, color: GOLD }}>Ask coach</button></div>)}</div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Today's scoreboard</div>
                {[["cuts", "Clients today", PUR_LL], ["rebooked", "Rebooked in the chair", GREEN], ["upsold", "Add-ons sold", GOLD]].map(([k, l, c]) => <div key={k} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: "#1d1238" }}>
                  <div className="flex-1 text-sm">{l}</div><button onClick={() => setTally((t) => ({ ...t, [k]: Math.max(0, (t as any)[k] - 1) }))} className="w-7 h-7 rounded-md text-lg leading-none" style={{ background: CARD2 }}>-</button><div className="w-8 text-center text-xl font-bold" style={{ color: c as string }}>{(tally as any)[k]}</div><button onClick={() => setTally((t) => ({ ...t, [k]: (t as any)[k] + 1, ...(k !== "cuts" && (t as any)[k] >= t.cuts ? { cuts: t.cuts + 1 } : {}) }))} className="w-7 h-7 rounded-md text-lg leading-none" style={{ background: PUR_L }}>+</button></div>)}
                <div className="mt-3 text-center"><div className="text-3xl font-bold" style={{ color: rebookToday === null ? MUTED : rebookToday >= 40 ? GREEN : GOLD }}>{rebookToday === null ? "–" : `${rebookToday}%`}</div><div className="text-[11px]" style={{ color: MUTED }}>rebooked in the chair today{s ? ` (your long-run rate: ${(num(s.rebook_rate) * 100).toFixed(1)}%)` : ""}</div></div>
              </div>
              <div className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Practice log</div>
                {runs.length === 0 ? <div className="text-sm" style={{ color: MUTED }}>No practice yet. Ten minutes in the arena is the fastest way to level up.</div> : <div className="space-y-1.5">{runs.slice(0, 5).map((r, i) => <div key={i} className="flex justify-between text-xs"><span className="text-slate-300">{r.label} <span style={{ color: MUTED }}>({r.difficulty})</span></span><span className="font-bold" style={{ color: r.score >= 75 ? GREEN : r.score >= 50 ? GOLD : RED }}>{r.score}</span></div>)}</div>}
                <button onClick={() => setTab("arena")} className="w-full mt-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: PUR_L, color: PUR_LL }}>Go to the arena</button>
              </div>
            </div>
          </div>
        )}

        {/* ARENA */}
        {tab === "arena" && (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
            <div className="space-y-3">
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: CARD2 }}>{(["easy", "normal", "hard"] as const).map((d) => <button key={d} onClick={() => setDiff(d)} className="flex-1 py-1.5 rounded-md text-xs font-semibold capitalize" style={{ background: diff === d ? PUR_L : "transparent", color: diff === d ? "#fff" : MUTED }}>{d}</button>)}</div>
              {SCENARIOS.map((sc) => <button key={sc.id} onClick={() => startRp(sc.id)} className="w-full text-left rounded-lg p-3 border" style={{ background: sid === sc.id ? `${sc.hex}12` : CARD, borderColor: sid === sc.id ? sc.hex : BDR }}>
                <div className="flex justify-between"><span className="text-sm font-semibold" style={{ color: sc.hex }}>{sc.label}</span>{best(sc.id) !== null && <span className="text-[11px]" style={{ color: MUTED }}>best {best(sc.id)}</span>}</div><div className="text-[11px] mt-0.5" style={{ color: MUTED }}>{sc.desc}</div></button>)}
              <div className="rounded-lg p-3 border" style={{ background: CARD, borderColor: sid.startsWith("real:") ? GOLD : BDR }}>
                <div className="text-sm font-semibold" style={{ color: GOLD }}>Rehearse a real client</div><div className="text-[11px] mb-2" style={{ color: MUTED }}>The AI plays one of your actual clients, using their history.</div>
                {book.length === 0 && <div className="text-[11px] mb-2" style={{ color: GOLD }}>Available once client history is imported.</div>}
                <select disabled={book.length === 0} value={realId} onChange={(e) => { const c = book.find((x) => x.user_id === e.target.value); setRealId(e.target.value); setRealName(c?.name ?? ""); }} className="w-full rounded-md p-2 text-xs outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }}>
                  <option value="">Choose a client...</option>{book.filter((c) => !c.booked).slice(0, 40).map((c) => <option key={c.user_id} value={c.user_id}>{c.name} ({c.status})</option>)}</select>
                <button disabled={!realId} onClick={() => startRp(`real:${realId}`)} className="w-full mt-2 py-2 rounded-md text-xs font-bold disabled:opacity-30" style={{ background: GOLD, color: "#000" }}>Start</button></div>
            </div>

            <div className="rounded-xl border flex flex-col min-h-[560px]" style={{ background: CARD, borderColor: BDR }}>
              {rp.length === 0 && !rpLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10"><div className="text-3xl mb-3">🎯</div><div className="font-semibold mb-1">Pick a scenario to start</div><div className="text-sm max-w-sm" style={{ color: MUTED }}>The client speaks first. Reply like you would in the shop. Watch the mood meter: good technique moves it, weak technique drops it.</div></div>
              ) : (
                <>
                  <div className="px-5 py-3 border-b" style={{ borderColor: BDR }}>
                    <div className="flex justify-between text-xs mb-1.5"><span className="font-semibold">{clientName}'s mood</span><span style={{ color: moodColor }}>{mood ? (mood.v >= 80 ? "Sold" : mood.v >= 60 ? "Warming up" : mood.v >= 40 ? "On the fence" : mood.v >= 20 ? "Cooling off" : "Not buying it") : ""} {mood ? `· ${mood.v}` : ""}</span></div>
                    <div className="h-2.5 rounded-full relative" style={{ background: CARD2 }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${mood?.v ?? 0}%`, background: moodColor }} />{mood && <div className="absolute top-[-2px] w-0.5 h-3.5 bg-white/40" style={{ left: `${mood.start}%` }} title="where they started" />}</div></div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[420px]">
                    {rp.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}><div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm" style={m.role === "user" ? { background: PUR_L } : { background: CARD2 }}>{m.role === "assistant" && <div className="text-[10px] font-bold mb-0.5" style={{ color: GOLD }}>{clientName}</div>}{m.content}</div></div>)}
                    {rpLoading && <div className="text-xs" style={{ color: MUTED }}>{clientName} is thinking...</div>}
                    {tip && <div className="text-xs rounded-lg p-2.5" style={{ background: "#2A2108", color: GOLD }}>Hint: {tip}</div>}
                    {closed && !card && <div className="text-sm rounded-lg p-3 text-center" style={{ background: "#0F2A1E", color: GREEN }}>{clientName} said yes. Nice. Score it to bank the XP.</div>}
                    <div ref={rpEnd} />
                  </div>
                  {card ? (
                    <div className="p-5 border-t space-y-3" style={{ borderColor: BDR }}>
                      <div className="flex items-center gap-4"><div className="text-5xl font-bold" style={{ color: card.score >= 75 ? GREEN : card.score >= 50 ? GOLD : RED }}>{card.score}</div><div><div className="font-semibold">{card.verdict}</div><div className="text-[11px]" style={{ color: MUTED }}>+{Math.round(card.score / 2)} XP</div></div></div>
                      <div className="space-y-1.5">{card.criteria.map((c: any) => <div key={c.name} className="flex gap-2 text-sm"><span style={{ color: c.met ? GREEN : RED }}>{c.met ? "✓" : "✗"}</span><div><span className="text-slate-200">{c.name}</span>{c.note && <div className="text-[11px]" style={{ color: MUTED }}>{c.note}</div>}</div></div>)}</div>
                      {card.best_line && <div className="text-xs rounded-lg p-3" style={{ background: "#0F2A1E", color: GREEN }}>Best line: {card.best_line}</div>}
                      {card.upgrade && <div className="text-xs rounded-lg p-3" style={{ background: CARD2 }}><span style={{ color: GOLD }}>Try this instead: </span>{card.upgrade}</div>}
                      <div className="flex gap-2"><button onClick={() => startRp(sid)} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: PUR_L }}>Go again</button><button onClick={() => { setDiff(diff === "easy" ? "normal" : "hard"); startRp(sid); }} className="px-4 py-2.5 rounded-lg text-sm border" style={{ borderColor: GOLD, color: GOLD }}>Harder</button></div>
                    </div>
                  ) : (
                    <div className="p-4 border-t" style={{ borderColor: BDR }}>
                      <div className="flex gap-2"><input value={rpInput} onChange={(e) => setRpInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sayRp()} disabled={rpLoading || closed} placeholder="What do you say?" className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} /><button onClick={sayRp} disabled={rpLoading || closed || !rpInput.trim()} className="px-5 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: PUR_L }}>Say it</button></div>
                      <div className="flex justify-between mt-2"><span className="text-[11px]" style={{ color: MUTED }}>{userTurns} turn{userTurns === 1 ? "" : "s"}</span><button onClick={score} disabled={scoring || userTurns < 1} className="text-xs font-bold px-4 py-1.5 rounded-md disabled:opacity-30" style={{ background: GOLD, color: "#000" }}>{scoring ? "Scoring..." : "Finish and score"}</button></div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ASK */}
        {tab === "ask" && (
          <div className="rounded-xl border flex flex-col min-h-[540px]" style={{ background: CARD, borderColor: BDR }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[520px]">
              {chat.length === 0 && (
                <div className="text-center py-8"><div className="font-semibold mb-1">Ask anything about your numbers, your clients or your technique</div><div className="text-sm mb-4" style={{ color: MUTED }}>The coach can look up your real data and draft texts for you to review.</div>
                  <div className="flex flex-wrap justify-center gap-2">{["Who should I text today?", "Why is my rebook rate below the shop's?", "Which of my regulars am I about to lose?", "Plan my week to earn more", "How do I sell more beard treatments?"].map((q) => <button key={q} onClick={() => sendChat(q)} className="text-xs px-3 py-1.5 rounded-full border hover:text-white" style={{ borderColor: BDR, color: "#94A3B8", background: CARD2 }}>{q}</button>)}</div></div>)}
              {chat.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "text-sm" : ""}`} style={m.role === "user" ? { background: PUR_L } : { background: CARD2 }}>
                {m.role === "assistant" ? <><div className="text-[10px] font-bold mb-1" style={{ color: GOLD }}>RydraCoach</div><Md text={m.content} />{m.texts?.map((t, j) => renderStaged(t.user_id + j, t, (fn) => setChat((c) => c.map((x, k) => (k === i ? { ...x, texts: x.texts!.map((y, l) => (l === j ? fn(y) : y)) } : x)))))}</> : m.content}</div></div>)}
              {chatLoading && <div className="text-xs" style={{ color: MUTED }}>Checking your numbers...</div>}<div ref={endRef} />
            </div>
            <div className="p-4 border-t flex gap-2" style={{ borderColor: BDR }}><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Ask your coach..." className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} /><button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()} className="px-5 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: PUR_L }}>Ask</button></div>
          </div>
        )}

        {/* VAULT */}
        {tab === "vault" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{SCRIPTS.map((sc) => <div key={sc.title} className="rounded-xl p-5 border" style={{ background: CARD, borderColor: BDR }}>
            <div className="font-semibold mb-2" style={{ color: sc.hex }}>{sc.title}</div><div className="text-sm rounded-lg p-3 leading-relaxed" style={{ background: CARD2 }}>{sc.text}</div><div className="text-[11px] mt-2" style={{ color: MUTED }}>{sc.why}</div>
            <div className="flex gap-2 mt-3"><button onClick={() => navigator.clipboard?.writeText(sc.text.replace(/^"|"$/g, ""))} className="text-xs px-3 py-1.5 rounded-md border" style={{ borderColor: BDR, color: "#94A3B8" }}>Copy</button><button onClick={() => { setTab("arena"); startRp(sc.sc); }} className="text-xs font-semibold px-3 py-1.5 rounded-md" style={{ background: `${PUR_L}33`, color: PUR_LL }}>Practise this</button></div></div>)}</div>
        )}

        {tab === "diary" && <DiaryWidget venueId={VENUE_ID} barberSlug={slug} barberName={b.name} mode="barber" />}
      </div>
    </div>
  );
}
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function CoachPage() { return <Suspense fallback={null}><Coach /></Suspense>; }
