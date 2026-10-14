"use client";
// Campaign Studio: describe an audience in plain English, test messages, simulate the outcome,
// launch with a held-out control group, then measure the real lift. Every send still goes through
// /api/sms/send, which enforces opt-out, hold, cooldown and the daily limit on the server.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Cell } from "recharts";
import { aiFetch } from "@/lib/ai/client";
import BulkSendModal from "@/app/components/bulk-send";
import {
  DEFAULT_FILTER, STATES, COST_PER_TEXT, funnel, simulate, returnCurve, liftPerText,
  type AudienceFilter, type MarkovKey, type Person,
} from "@/lib/campaigns/model";

const GOLD = "#D4A017", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A", GREEN = "#34D399", RED = "#F43F5E";
const CARD = "#130C24", CARD2 = "#1A1030", BDR = "#2A1852";
const TIP = { backgroundColor: CARD, border: "1px solid #3A2268", borderRadius: 4, color: "#fff", fontSize: 11 };
const NAV = [
  { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach" },
  { href: "/merchant/campaign", label: "Campaign", active: true }, { href: "/merchant/clients", label: "Clients" }, { href: "/merchant/barber", label: "Barbers" },
];
const STATE_LABEL: Record<MarkovKey, { name: string; color: string }> = {
  X: { name: "Lapsed", color: "#F43F5E" }, R_at_risk: { name: "At risk", color: "#F59E0B" }, R_on_fence: { name: "Due soon", color: "#EAB308" },
  C: { name: "First-timers", color: "#38BDF8" }, R_loyal: { name: "Loyal", color: "#34D399" },
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EXAMPLES = ["Big spenders who haven't been in for 2 months", "First-timers who never came back", "Regulars who usually come on a Friday", "Anyone slipping away with 5+ visits"];
const aud$ = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
const m2 = (n: number) => `$${n.toFixed(2)}`;
const first = (n: string) => (n.trim().split(/\s+/)[0] || "there").replace(/[^A-Za-z'\-]/g, "") || "there";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

type Info = { remaining_today: number; daily_cap: number; cooldown_days: number; body_max: number; copy_max: number; booking_link: string };
type Variant = { id: "A" | "B" | "C"; name: string; text: string; source: string; on: boolean };
type Camp = any;

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-xl border ${className}`} style={{ background: CARD, borderColor: BDR, ...style }}>{children}</div>;
}
function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>{n}</div>
      <div><div className="text-base font-semibold text-white leading-tight">{title}</div><div className="text-xs" style={{ color: MUTED }}>{sub}</div></div>
    </div>
  );
}

function Studio() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"build" | "results">("build");
  const [people, setPeople] = useState<Person[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  // audience
  const [filter, setFilter] = useState<AudienceFilter>(DEFAULT_FILTER);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState("");
  const [banner, setBanner] = useState("");

  // message
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [variants, setVariants] = useState<Variant[]>([
    { id: "A", name: "Warm & personal", text: "", source: "", on: true }, { id: "B", name: "Short & direct", text: "", source: "", on: false }, { id: "C", name: "Light urgency", text: "", source: "", on: false },
  ]);
  const [writing, setWriting] = useState(false);
  const [previewId, setPreviewId] = useState<"A" | "B" | "C">("A");

  // plan
  const [count, setCount] = useState(20);
  const [trust, setTrust] = useState(0.7);
  const [holdout, setHoldout] = useState(10);
  const [showBulk, setShowBulk] = useState(false);

  // launch
  const [run, setRun] = useState<{ open: boolean; running: boolean; done: number; total: number; sent: number; skipped: Record<string, number>; stopped: boolean; finished: boolean; tracked: boolean; held: number }>({ open: false, running: false, done: 0, total: 0, sent: 0, skipped: {}, stopped: false, finished: false, tracked: false, held: 0 });
  const stopRef = useRef(false);
  const [confirm, setConfirm] = useState(false);

  // results
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [trackAvail, setTrackAvail] = useState<boolean | null>(null);
  const [followIds, setFollowIds] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await aiFetch("/api/campaigns/people"); const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load clients");
      setPeople(d.people); setInfo(d); setLoadErr("");
    } catch (e: any) { setLoadErr(e?.message || "Could not load clients"); }
    finally { setLoading(false); }
  }, []);
  const loadCamps = useCallback(async () => {
    try { const r = await aiFetch("/api/campaigns"); const d = await r.json(); if (r.ok) { setTrackAvail(!!d.available); setCamps(d.campaigns ?? []); } } catch {}
  }, []);
  useEffect(() => { load(); loadCamps(); const t = setInterval(() => { if (!document.hidden && !run.running) load(); }, 90_000); return () => clearInterval(t); }, [load, loadCamps, run.running]);

  // Arrive from the heatmap with an audience pre-set.
  useEffect(() => {
    if (sp.get("source") !== "heatmap") return;
    const st = (sp.get("states") ?? "").split(",").filter((s) => (STATES as string[]).includes(s)) as MarkovKey[];
    if (st.length) setFilter((f) => ({ ...f, states: st }));
    const d = sp.get("heatmap_date");
    if (d && !Number.isNaN(Date.parse(d))) {
      const label = new Date(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
      setBanner(`From the heatmap: ${label} is a quiet day, so the audience is set to clients most likely to fill it.`); setName(`Fill ${label}`); setGoal(`Fill the quiet chairs on ${label}`);
    }
  }, [sp]);

  const cap = Math.max(0, Math.min(info?.remaining_today ?? 0, 200));
  const f = useMemo(() => ({ ...filter, ids: followIds }), [filter, followIds]);
  const fun = useMemo(() => funnel(people, f, cap), [people, f, cap]);
  const ranked = fun.send;
  const maxSend = Math.min(ranked.length, cap);
  const n = Math.min(Math.max(count, 0), maxSend);
  const recipients = useMemo(() => ranked.slice(0, n), [ranked, n]);

  // Hold out a random-but-stable slice as the control group.
  const { sendList, control } = useMemo(() => {
    const k = Math.round((n * holdout) / 100);
    const order = [...recipients].sort((a, b) => hash(a.user_id) - hash(b.user_id));
    const ctl = new Set(order.slice(0, trackAvail === false ? 0 : k).map((p) => p.user_id));
    return { sendList: recipients.filter((p) => !ctl.has(p.user_id)), control: recipients.filter((p) => ctl.has(p.user_id)) };
  }, [recipients, n, holdout, trackAvail]);

  const sim = useMemo(() => simulate(sendList, { haircut: trust }), [sendList, trust]);
  const curve = useMemo(() => returnCurve(ranked.slice(0, Math.max(maxSend, 1)), trust), [ranked, maxSend, trust]);
  const histData = useMemo(() => sim.hist.counts.map((c, i) => { const w = (sim.hist.max - sim.hist.min) / sim.hist.counts.length; const mid = sim.hist.min + w * (i + 0.5); return { mid, label: aud$(mid), c }; }), [sim]);
  const mix = useMemo(() => { const m: Record<string, number> = {}; recipients.forEach((p) => (m[p.state] = (m[p.state] ?? 0) + 1)); return m; }, [recipients]);

  useEffect(() => { if (maxSend > 0) setCount((c) => (c === 20 && maxSend < 20 ? maxSend : Math.min(c, maxSend) || Math.min(20, maxSend))); }, [maxSend]);

  const activeV = variants.filter((v) => v.on && v.text.trim());
  const audienceText = useMemo(() => {
    const parts: string[] = [];
    if (filter.states.length) parts.push(filter.states.map((s) => STATE_LABEL[s].name.toLowerCase()).join(" / ") + " clients"); else parts.push("past clients");
    if (filter.minClv) parts.push(`spent ${aud$(filter.minClv)}+`);
    if (filter.minDays) parts.push(`${filter.minDays}+ days since last visit`);
    if (filter.weekday !== null) parts.push(`usually come on ${DAYS[filter.weekday]}`);
    return parts.join(", ");
  }, [filter]);

  async function describe(text: string) {
    if (!text.trim()) return;
    setAsking(true); setAskNote("");
    try {
      const r = await aiFetch("/api/campaigns/audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not read that");
      setFilter({ ...DEFAULT_FILTER, ...d.filter, ids: null }); setFollowIds(null);
      setAskNote(`${d.summary || "Audience set."}${d.source === "keywords" ? " (AI was unavailable, so I matched on keywords.)" : ""}`);
    } catch (e: any) { setAskNote(e?.message || "Could not read that"); }
    setAsking(false);
  }

  async function writeVariants() {
    if (!info) return;
    setWriting(true);
    try {
      const r = await aiFetch("/api/campaigns/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, audience: audienceText, max_chars: info.copy_max }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setVariants((vs) => vs.map((v) => { const nv = d.variants.find((x: any) => x.id === v.id); return nv ? { ...v, name: nv.name, text: nv.text, source: nv.source, on: v.id === "A" ? true : v.on } : v; }));
    } catch {}
    setWriting(false);
  }

  const problem = (t: string): string => {
    if (!info) return "";
    if (!t.trim()) return "Empty";
    if (!t.includes("{first_name}")) return "Add {first_name}";
    if (/https?:|www\./i.test(t)) return "Remove links (added for you)";
    const worst = t.replace(/\{first_name\}/g, "x".repeat(Math.max(8, ...recipients.map((p) => first(p.name).length)))).length + 1 + info.booking_link.length;
    return worst > info.body_max ? `${worst - info.body_max} over the limit` : "";
  };
  const allOk = activeV.length > 0 && activeV.every((v) => !problem(v.text));
  const build = (t: string, nm: string) => `${t.replace(/\{first_name\}/g, first(nm))} ${info?.booking_link ?? ""}`.trim();

  // Round-robin A/B/C so each variant gets an equal, comparable slice.
  const assign = useCallback(() => {
    const vs = activeV.length ? activeV : [];
    const shuffled = [...sendList].sort((a, b) => hash(b.user_id) - hash(a.user_id));
    return shuffled.map((p, i) => ({ p, v: vs[i % Math.max(vs.length, 1)] }));
  }, [sendList, activeV]);

  async function launch() {
    if (!info || !allOk || !sendList.length) return;
    setConfirm(false); stopRef.current = false;
    const plan = assign();
    let campaignId: string | null = null; let tracked = false;
    try {
      const r = await aiFetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: name || `Campaign ${new Date().toLocaleDateString("en-AU")}`, goal, audience: { filter, text: audienceText }, variants: activeV.map((v) => ({ id: v.id, text: v.text })), holdout_pct: holdout,
        members: [...plan.map(({ p, v }) => ({ customer_id: p.user_id, variant: v.id })), ...control.map((p) => ({ customer_id: p.user_id, variant: "holdout" }))],
      }) });
      const d = await r.json(); if (r.ok && d.available && d.id) { campaignId = d.id; tracked = true; }
    } catch {}
    setRun({ open: true, running: true, done: 0, total: plan.length, sent: 0, skipped: {}, stopped: false, finished: false, tracked, held: tracked ? control.length : 0 });
    let sent = 0, done = 0, stopped = false; const skipped: Record<string, number> = {};
    for (const { p, v } of plan) {
      if (stopRef.current) { stopped = true; break; }
      let status: "sent" | "skipped" = "skipped"; let reason = "error";
      try {
        const res = await aiFetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: p.user_id, message: build(v.text, p.name), customer_name: p.name, markov_state: p.state, bulk: true }) });
        const j = await res.json().catch(() => ({}));
        if (res.ok) { sent++; status = "sent"; } else { reason = String(j.reason || (res.status === 429 ? "rate_limited" : "error")); skipped[reason] = (skipped[reason] ?? 0) + 1; if (reason === "daily_cap") { stopped = true; } }
      } catch { reason = "network"; skipped.network = (skipped.network ?? 0) + 1; }
      if (campaignId) aiFetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId, customer_id: p.user_id, status, reason }) }).catch(() => {});
      done++; setRun((s) => ({ ...s, done, sent, skipped: { ...skipped } }));
      if (stopped) break;
      await sleep(350);
    }
    setRun((s) => ({ ...s, running: false, finished: true, stopped: stopped || stopRef.current, done, sent, skipped: { ...skipped } }));
    setFollowIds(null); load(); loadCamps();
  }

  const toBulk = (p: Person) => ({ user_id: p.user_id, name: p.name, phone: "on file", markov_state: p.state, risk_segment: STATE_LABEL[p.state].name, gap_ratio: 0, days_overdue: p.daysSince, intervention_value: liftPerText(p, trust), sms_blocked: false });
  const pv = variants.find((v) => v.id === previewId) ?? variants[0];
  const sample = recipients[0];

  const setStateTog = (s: MarkovKey) => setFilter((x) => ({ ...x, states: x.states.includes(s) ? x.states.filter((y) => y !== s) : [...x.states, s] }));
  const maxFun = Math.max(1, ...fun.stages.map((s) => s.n));
  const sweet = Math.min(curve.sweet, maxSend);

  return (
    <div className="min-h-screen text-white pb-24" style={{ background: "#0A0612" }}>
      <div className="sticky top-0 z-30 border-b" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#0F1829", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1500px] mx-auto px-8 h-14 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }} />
            <div><div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Rydra</div><div className="text-sm font-semibold leading-none">Campaign Studio</div></div>
          </div>
          <nav className="flex items-center gap-1">{NAV.map((t) => <a key={t.href} href={t.href} className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${t.active ? "bg-[#5B21B6] text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>{t.label}</a>)}</nav>
          <div className="ml-auto flex items-center gap-1 p-1 rounded-lg" style={{ background: CARD2 }}>
            {(["build", "results"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className="px-4 py-1.5 rounded-md text-xs font-semibold capitalize" style={tab === t ? { background: PUR_L, color: "#fff" } : { color: MUTED }}>{t === "build" ? "Build" : `Results${camps?.length ? ` (${camps.length})` : ""}`}</button>)}
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-8 pt-8">
        {loading && <div className="text-sm" style={{ color: MUTED }}>Loading your clients...</div>}
        {loadErr && <div className="rounded-lg p-4 text-sm mb-6" style={{ background: "#2A0F1A", border: `1px solid ${RED}55`, color: "#FDA4AF" }}>{loadErr} <button className="underline ml-2" onClick={load}>Retry</button></div>}

        {tab === "build" && !loading && !loadErr && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8">
            <div className="space-y-10 min-w-0">
              {banner && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "#1B1240", border: `1px solid ${PUR_L}66`, color: PUR_LL }}>{banner}</div>}
              {followIds && <div className="rounded-lg px-4 py-3 text-sm flex items-center justify-between" style={{ background: "#2A2108", border: `1px solid ${GOLD}66`, color: GOLD }}><span>Follow-up wave: only the {followIds.length} people from your last campaign who haven't rebooked yet.</span><button className="underline" onClick={() => setFollowIds(null)}>Clear</button></div>}

              {/* 1. WHO */}
              <section>
                <Step n={1} title="Who should hear from you?" sub="Describe them in your own words, or tap the chips. The funnel updates live." />
                <Card className="p-5">
                  <div className="flex gap-2">
                    <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && describe(ask)} placeholder='e.g. "big spenders who haven&apos;t been in for 2 months"' className="flex-1 rounded-lg px-4 py-3 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                    <button onClick={() => describe(ask)} disabled={asking || ask.trim().length < 3} className="px-5 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: PUR_L }}>{asking ? "Reading..." : "Find them"}</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">{EXAMPLES.map((e) => <button key={e} onClick={() => { setAsk(e); describe(e); }} className="text-[11px] px-3 py-1 rounded-full hover:text-white" style={{ background: CARD2, color: MUTED, border: `1px solid ${BDR}` }}>{e}</button>)}</div>
                  {askNote && <div className="text-xs mt-3" style={{ color: PUR_LL }}>{askNote}</div>}

                  <div className="mt-5 pt-5 border-t grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ borderColor: BDR }}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Client type</div>
                      <div className="flex flex-wrap gap-2">
                        {STATES.map((s) => { const on = filter.states.includes(s); const cnt = people.filter((p) => p.state === s && p.smsOk).length; return (
                          <button key={s} onClick={() => setStateTog(s)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: on ? STATE_LABEL[s].color : BDR, background: on ? `${STATE_LABEL[s].color}22` : CARD2, color: on ? STATE_LABEL[s].color : "#94A3B8" }}>{STATE_LABEL[s].name} <span className="opacity-60">{cnt}</span></button>); })}
                      </div>
                      <div className="text-[10px] mt-2" style={{ color: MUTED }}>{filter.states.length ? "" : "None selected means everyone."}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      {([["Min lifetime spend", "minClv", 0, 1000, 25, "$"], ["Min visits", "minVisits", 0, 30, 1, ""], ["Days since visit (from)", "minDays", 0, 365, 5, ""], ["Days since visit (to)", "maxDays", 0, 999, 5, ""]] as const).map(([l, k, lo, hi, st, pre]) => (
                        <label key={k} className="block"><div className="flex justify-between mb-1" style={{ color: MUTED }}><span>{l}</span><span className="text-white">{pre}{(filter as any)[k]}{k === "maxDays" && filter.maxDays >= 999 ? " (any)" : ""}</span></div>
                          <input type="range" min={lo} max={hi} step={st} value={Math.min((filter as any)[k], hi)} onChange={(e) => setFilter((x) => ({ ...x, [k]: Number(e.target.value) }))} className="w-full" style={{ accentColor: PUR_L }} /></label>
                      ))}
                      <div className="col-span-2"><div className="mb-1" style={{ color: MUTED }}>Usual day</div>
                        <div className="flex gap-1">{["Any", ...DAYS].map((d, i) => { const on = (i === 0 && filter.weekday === null) || filter.weekday === i - 1; return <button key={d} onClick={() => setFilter((x) => ({ ...x, weekday: i === 0 ? null : i - 1 }))} className="flex-1 py-1 rounded text-[11px] font-semibold" style={{ background: on ? PUR_L : CARD2, color: on ? "#fff" : MUTED }}>{d}</button>; })}</div></div>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 mt-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Audience funnel: who actually gets a text</div>
                  <div className="space-y-2">
                    {fun.stages.map((s, i) => (
                      <div key={s.label} className="flex items-center gap-3">
                        <div className="w-44 text-xs text-slate-300 flex-shrink-0">{s.label}</div>
                        <div className="flex-1 h-7 rounded relative" style={{ background: CARD2 }}>
                          <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.max(1, (s.n / maxFun) * 100)}%`, background: i === fun.stages.length - 1 ? `linear-gradient(90deg, ${PUR_L}, ${GOLD})` : `${PUR_L}${i === 0 ? "55" : "99"}` }} />
                          <div className="absolute inset-0 flex items-center px-3 text-[11px] font-semibold">{s.n.toLocaleString()}<span className="ml-3 font-normal opacity-60 truncate">{s.note}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>

              {/* 2. WHAT */}
              <section>
                <Step n={2} title="What should it say?" sub="Write up to three versions. Rydra splits them evenly so you learn which one works." />
                <Card className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="rounded-lg px-4 py-2.5 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                    <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal (e.g. fill Tuesday afternoons)" className="rounded-lg px-4 py-2.5 text-sm outline-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                  </div>
                  <button onClick={writeVariants} disabled={writing || !info} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${PUR}, ${PUR_L})` }}>{writing ? "Writing 3 versions..." : variants.some((v) => v.text) ? "Rewrite all three" : "Write 3 versions for me"}</button>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
                    {variants.map((v) => { const pr = v.text ? problem(v.text) : ""; return (
                      <div key={v.id} onClick={() => setPreviewId(v.id)} className="rounded-lg p-3 border cursor-pointer" style={{ background: CARD2, borderColor: previewId === v.id ? PUR_L : BDR }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold" style={{ color: GOLD }}>{v.id} · {v.name}</div>
                          <label className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={v.on} onChange={() => setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, on: !x.on } : x))} style={{ accentColor: PUR_L }} />use</label>
                        </div>
                        <textarea value={v.text} onChange={(e) => setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, text: e.target.value, source: "edited" } : x))} rows={4} placeholder="Hi {first_name}, ..." className="w-full rounded p-2 text-xs outline-none resize-none" style={{ background: "#0A0612", border: `1px solid ${BDR}` }} />
                        <div className="flex justify-between text-[10px] mt-1"><span style={{ color: pr ? RED : GREEN }}>{v.text ? (pr || "Ready") : ""}</span><span style={{ color: MUTED }}>{v.text.length}/{info?.copy_max}</span></div>
                      </div>); })}
                  </div>
                  <div className="text-[11px] mt-3" style={{ color: MUTED }}>Use {"{first_name}"} for each client's name. The booking link and opt-out line are added automatically. No prices or offers.</div>
                </Card>
              </section>

              {/* 3. SIMULATE */}
              <section>
                <Step n={3} title="Flight simulator" sub="Run this campaign 2,000 times before you spend a cent. A model estimate, not a promise." />
                {maxSend === 0 ? (
                  <Card className="p-6 text-sm" style={{ color: MUTED }}>Nobody can be texted right now with this audience. Loosen the filters in step 1{(info?.remaining_today ?? 1) === 0 ? ", or wait for tomorrow's limit to reset" : ""}.</Card>
                ) : (
                  <Card className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
                      <label className="block text-xs md:col-span-2"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>How many to text</span><span className="font-semibold">{n} of {maxSend} possible</span></div>
                        <input type="range" min={1} max={maxSend} value={Math.max(n, 1)} onChange={(e) => setCount(Number(e.target.value))} className="w-full" style={{ accentColor: PUR_L }} />
                        {sweet > 0 && <button onClick={() => setCount(Math.max(1, sweet))} className="mt-1 text-[11px] underline" style={{ color: GOLD }}>Jump to the sweet spot ({sweet} texts): past that, each text earns less than 5x its cost</button>}
                      </label>
                      <div className="text-xs"><div className="mb-1" style={{ color: MUTED }}>How much to trust the model</div>
                        <div className="flex gap-1">{([[1, "Optimistic"], [0.7, "Realistic"], [0.4, "Cautious"]] as const).map(([v, l]) => <button key={l} onClick={() => setTrust(v)} className="flex-1 py-1.5 rounded text-[11px] font-semibold" style={{ background: trust === v ? PUR_L : CARD2, color: trust === v ? "#fff" : MUTED }}>{l}</button>)}</div></div>
                      <label className="block text-xs md:col-span-3"><div className="flex justify-between mb-1"><span style={{ color: MUTED }}>Control group: people we deliberately don't text, so you can measure the real effect</span><span className="font-semibold">{trackAvail === false ? "needs setup" : `${holdout}% (${control.length} people)`}</span></div>
                        <input type="range" min={0} max={30} step={5} value={holdout} disabled={trackAvail === false} onChange={(e) => setHoldout(Number(e.target.value))} className="w-full disabled:opacity-30" style={{ accentColor: GOLD }} />
                        {trackAvail === false && <div className="mt-1" style={{ color: GOLD }}>Tracking tables aren't set up yet. Run supabase/campaigns.sql in Supabase to enable control groups and results. Sending still works without it.</div>}
                      </label>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                      {[["Texts sent", String(sendList.length), `cost ${m2(sim.cost)}`], ["Extra rebookings", sim.expectedRebooks.toFixed(1), `${sim.breakEvenRebooks} needed to break even`], ["Expected profit", aud$(sim.meanNet), `range ${aud$(sim.p10)} to ${aud$(sim.p90)}`], ["Chance of profit", `${Math.round(sim.probProfit * 100)}%`, `${sim.roi.toFixed(1)}x return`]].map(([l, v, s], i) => (
                        <div key={l} className="rounded-lg p-3" style={{ background: CARD2, border: `1px solid ${BDR}` }}><div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{l}</div><div className="text-2xl font-bold mt-1" style={{ color: i === 2 ? (sim.meanNet >= 0 ? GREEN : RED) : i === 3 ? (sim.probProfit >= 0.8 ? GREEN : sim.probProfit >= 0.5 ? GOLD : RED) : "#fff" }}>{v}</div><div className="text-[10px] mt-0.5" style={{ color: MUTED }}>{s}</div></div>))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div><div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>2,000 possible outcomes (profit)</div>
                        <div style={{ height: 170 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={histData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: MUTED }} interval={5} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={TIP} formatter={(v: any) => [`${v} runs`, ""]} labelFormatter={(l) => `Around ${l}`} />
                          <Bar dataKey="c" radius={[2, 2, 0, 0]}>{histData.map((d, i) => <Cell key={i} fill={d.mid >= 0 ? GREEN : RED} fillOpacity={0.75} />)}</Bar></BarChart></ResponsiveContainer></div></div>
                      <div><div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Diminishing returns: profit as you text further down the list</div>
                        <div style={{ height: 170 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={curve.pts} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PUR_L} stopOpacity={0.5} /><stop offset="100%" stopColor={PUR_L} stopOpacity={0} /></linearGradient></defs>
                          <XAxis dataKey="k" tick={{ fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={TIP} formatter={(v: any) => [aud$(Number(v)), "Cumulative profit"]} labelFormatter={(l) => `Text #${l}`} />
                          <Area dataKey="net" stroke={PUR_LL} fill="url(#cg)" strokeWidth={2} />{n > 0 && <ReferenceLine x={curve.pts.reduce((b, p) => Math.abs(p.k - n) < Math.abs(b - n) ? p.k : b, curve.pts[0]?.k ?? 1)} stroke={GOLD} strokeDasharray="3 3" />}</AreaChart></ResponsiveContainer></div></div>
                    </div>
                    <div className="text-[10px] mt-3" style={{ color: MUTED }}>Based on how often each client type rebooks on its own vs after a text, and each client's usual spend per visit. Costs {m2(COST_PER_TEXT)} per text. Real results appear under Results, measured against your control group.</div>
                  </Card>
                )}
              </section>
            </div>

            {/* RIGHT: preview + launch */}
            <aside className="space-y-5 xl:sticky xl:top-20 self-start">
              <Card className="p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>What they'll see</div>
                <div className="mx-auto w-[270px] rounded-[28px] p-3" style={{ background: "#05030A", border: "2px solid #2A1852" }}>
                  <div className="text-center text-[10px] mb-2" style={{ color: MUTED }}>Alkami · now</div>
                  <div className="rounded-2xl rounded-bl-sm px-3 py-2 text-[12px] leading-snug min-h-[80px]" style={{ background: "#26262B", color: "#F2F2F7" }}>
                    {pv?.text ? <>{build(pv.text, sample?.name ?? "Jack")}<div className="mt-1.5 opacity-50 text-[10px]">Opt out: link added automatically</div></> : <span style={{ color: MUTED }}>Write or generate a message to preview it here.</span>}
                  </div>
                  <div className="text-[10px] mt-2 text-center" style={{ color: MUTED }}>{pv?.text ? `Previewing version ${pv.id} as ${first(sample?.name ?? "Jack")}` : ""}</div>
                </div>
              </Card>

              <Card className="p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Launch checklist</div>
                {(() => { const items: [boolean, string][] = [
                  [sendList.length > 0, `${sendList.length} people will be texted${control.length ? `, ${control.length} held back as control` : ""}`],
                  [allOk, activeV.length ? `${activeV.length} message version${activeV.length > 1 ? "s" : ""} ready` : "Write at least one message"],
                  [(info?.remaining_today ?? 0) >= sendList.length && sendList.length > 0, `${info?.remaining_today ?? 0} texts left today (limit ${info?.daily_cap})`],
                  [sim.n === 0 || sim.meanNet > 0, sim.n ? `Model expects ${aud$(sim.meanNet)} profit` : "Pick an audience"],
                ]; return <div className="space-y-2">{items.map(([ok, t]) => <div key={t} className="flex gap-2 text-xs"><span style={{ color: ok ? GREEN : RED }}>{ok ? "✓" : "•"}</span><span className={ok ? "text-slate-300" : "text-slate-400"}>{t}</span></div>)}</div>; })()}
                <div className="text-[11px] mt-3 mb-3" style={{ color: MUTED }}>Mix: {Object.entries(mix).map(([k, v]) => `${v} ${STATE_LABEL[k as MarkovKey].name.toLowerCase()}`).join(", ") || "none"}</div>
                {!confirm ? (
                  <button disabled={!allOk || !sendList.length || run.running} onClick={() => setConfirm(true)} className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-30" style={{ background: `linear-gradient(135deg, ${PUR}, ${GOLD})` }}>Launch campaign</button>
                ) : (
                  <div className="rounded-lg p-3" style={{ background: "#2A2108", border: `1px solid ${GOLD}66` }}>
                    <div className="text-xs mb-3" style={{ color: GOLD }}>This sends {sendList.length} real text{sendList.length === 1 ? "" : "s"} (about {m2(sendList.length * COST_PER_TEXT)}) right now. Opted-out, held and recently texted clients are skipped automatically.</div>
                    <div className="flex gap-2"><button onClick={launch} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ background: GOLD, color: "#000" }}>Yes, send</button><button onClick={() => setConfirm(false)} className="px-4 py-2 rounded-lg text-sm" style={{ background: CARD2 }}>Cancel</button></div>
                  </div>
                )}
                <button disabled={!recipients.length} onClick={() => setShowBulk(true)} className="w-full mt-2 py-2.5 rounded-lg text-xs font-semibold border disabled:opacity-30" style={{ borderColor: BDR, color: PUR_LL }}>Or let AI write a unique message per person</button>
                <div className="text-[10px] mt-1.5" style={{ color: MUTED }}>Per-person messages are reviewed first, but aren't part of A/B or control tracking.</div>
              </Card>

              {run.open && (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2"><div className="text-sm font-semibold">{run.running ? "Sending..." : run.stopped ? "Stopped" : "Campaign sent"}</div>
                    {run.running ? <button onClick={() => { stopRef.current = true; }} className="text-xs px-3 py-1 rounded" style={{ background: "#3A1020", color: RED }}>Stop</button> : <button onClick={() => setRun((s) => ({ ...s, open: false }))} className="text-xs" style={{ color: MUTED }}>Close</button>}</div>
                  <div className="h-2 rounded overflow-hidden mb-2" style={{ background: CARD2 }}><div className="h-full transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%`, background: PUR_L }} /></div>
                  <div className="text-xs text-slate-300">{run.sent} sent · {Object.values(run.skipped).reduce((a, b) => a + b, 0)} skipped · {run.done}/{run.total}</div>
                  {Object.keys(run.skipped).length > 0 && <div className="text-[11px] mt-1" style={{ color: MUTED }}>{Object.entries(run.skipped).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")}</div>}
                  {run.finished && <div className="text-[11px] mt-2" style={{ color: run.tracked ? GREEN : GOLD }}>{run.tracked ? `Tracking on${run.held ? `, ${run.held} held back as control` : ""}. Check the Results tab in a few days.` : "Tracking isn't set up, so results won't be measured."}</div>}
                </Card>
              )}
            </aside>
          </div>
        )}

        {tab === "results" && (
          <div className="space-y-5 max-w-[1100px]">
            <div><div className="text-xl font-semibold">Did it work?</div><div className="text-xs" style={{ color: MUTED }}>Rebooked = a visit or booking after the campaign started. Compared against the control group who weren't texted, so you see the effect of the text itself.</div></div>
            {trackAvail === false && <Card className="p-5 text-sm" style={{ color: GOLD }}>Campaign tracking isn't set up yet. Run <code>supabase/campaigns.sql</code> once in the Supabase SQL editor, then launch a campaign with a control group.</Card>}
            {trackAvail && camps && camps.length === 0 && <Card className="p-8 text-center text-sm" style={{ color: MUTED }}>No tracked campaigns yet. Launch one from the Build tab.</Card>}
            {camps?.map((c) => { const r = c.results; return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="font-semibold">{c.name}</div><div className="text-xs" style={{ color: MUTED }}>{new Date(c.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · {c.goal || "no goal set"}</div></div>
                  {r.followupIds.length > 0 && <button onClick={() => { setFollowIds(r.followupIds); setName(`${c.name} - follow-up`); setGoal(c.goal || ""); setTab("build"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: PUR_L }}>Follow up with {r.followupIds.length} who haven't rebooked</button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  {[["Texted", `${r.sent}`, `${r.rebookedSent} rebooked`], ["Rebook rate (texted)", `${(r.rateSent * 100).toFixed(0)}%`, ""], ["Rebook rate (control)", r.rateControl === null ? "n/a" : `${(r.rateControl * 100).toFixed(0)}%`, r.control ? `${r.control} people` : "no control group"], ["Lift from texting", r.lift === null ? "n/a" : `${r.lift >= 0 ? "+" : ""}${(r.lift * 100).toFixed(0)} pts`, r.pValue === null ? "" : r.significant ? "statistically clear" : "too early to be sure"]].map(([l, v, s]) => (
                    <div key={l} className="rounded-lg p-3" style={{ background: CARD2, border: `1px solid ${BDR}` }}><div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{l}</div><div className="text-xl font-bold mt-1" style={{ color: l.startsWith("Lift") && r.lift !== null ? (r.lift > 0 ? GREEN : RED) : "#fff" }}>{v}</div><div className="text-[10px]" style={{ color: MUTED }}>{s}</div></div>))}
                </div>
                {r.byVariant.length > 1 && (
                  <div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>A/B/C comparison</div>
                    <div className="space-y-1.5">{r.byVariant.map((v: any) => { const txt = c.variants?.find((x: any) => x.id === v.variant)?.text; return (
                      <div key={v.variant} className="flex items-center gap-3 text-xs"><div className="w-6 font-bold" style={{ color: GOLD }}>{v.variant}</div>
                        <div className="flex-1 h-5 rounded relative" style={{ background: CARD2 }}><div className="h-full rounded" style={{ width: `${Math.max(2, v.rate * 100)}%`, background: r.winner?.variant === v.variant ? GREEN : PUR_L, opacity: 0.8 }} /><div className="absolute inset-0 px-2 flex items-center text-[10px] truncate">{txt}</div></div>
                        <div className="w-28 text-right">{(v.rate * 100).toFixed(0)}% <span style={{ color: MUTED }}>({v.rebooked}/{v.n})</span></div></div>); })}</div>
                    {r.winner && <div className="text-xs mt-2" style={{ color: r.winner.confidence > 0.9 ? GREEN : MUTED }}>Version {r.winner.variant} is ahead{r.winner.confidence > 0.9 ? ` (${Math.round(r.winner.confidence * 100)}% confident)` : `, but it's too early to call (${Math.round(r.winner.confidence * 100)}% confident)`}.</div>}
                  </div>)}
              </Card>); })}
          </div>
        )}
      </div>

      {showBulk && <BulkSendModal customers={recipients.map(toBulk)} fixed label={name || "Campaign audience"} hex={PUR_LL} maxChars={info?.body_max ?? 100} onClose={() => setShowBulk(false)} onSent={() => { load(); }} />}
    </div>
  );
}

export default function CampaignPage() {
  return <Suspense fallback={null}><Studio /></Suspense>;
}
