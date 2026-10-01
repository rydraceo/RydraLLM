"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AuroraBackground, CountUp } from "@/app/components/fx";
import { useCopilotActions } from "@/lib/ai/bus";
import { aiFetch } from "@/lib/ai/client";
import type { CopilotAction } from "@/lib/ai/types";
import type { OutreachOverview, QueueRow } from "@/lib/outreach/data";

// ─── Tokens (same palette as the dashboard) ──────────────────────────────────
const GOLD = "#D4A017", GOLD2 = "#C9973A", PUR = "#5B21B6", PUR_L = "#7C3AED", PUR_LL = "#A78BFA", MUTED = "#6B5C8A";
const TIP = { backgroundColor: "#130C24", border: "1px solid #3A2268", borderRadius: "6px", color: "#F5F0FF", fontSize: "12px" };

const STATE_LABEL: Record<string, string> = { C: "First timer", X: "Churned", R_at_risk: "At risk", R_on_fence: "On the fence", R_loyal: "Loyal" };
const STATE_COLOR: Record<string, string> = { C: "#38BDF8", X: "#F43F5E", R_at_risk: "#FB923C", R_on_fence: "#FBBF24", R_loyal: "#34D399" };
const REASON: Record<string, string> = {
  opted_out: "opted out", held: "on hold", invalid_number: "no valid mobile", recently_sent: "texted in the last 10 minutes",
  cooldown: "texted recently", daily_cap: "daily limit reached", too_long: "message too long", not_found: "client not found",
  rate_limited: "rate limited", network: "network error", error: "error",
};

const firstName = (name: string) => {
  const f = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0]?.replace(/[^A-Za-z'\-]/g, "") ?? "";
  return f.length >= 2 ? f.slice(0, 20) : "there";
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
function ago(iso: string | null) {
  if (!iso) return "Never";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

type RunState = { open: boolean; running: boolean; finished: boolean; stopped: boolean; done: number; total: number; sent: number; skipped: Record<string, number> };
const IDLE: RunState = { open: false, running: false, finished: false, stopped: false, done: 0, total: 0, sent: 0, skipped: {} };

function TopNav() {
  const tabs = [
    { href: "/merchant/dashboard", label: "Dashboard" }, { href: "/merchant/outreach", label: "Outreach", active: true },
    { href: "/merchant/campaign", label: "Campaign" }, { href: "/merchant/clients", label: "Clients" }, { href: "/merchant/barber", label: "Barbers" },
  ];
  return (
    <div className="border-b backdrop-blur-xl sticky top-0 z-30" style={{ background: "rgba(10,6,18,0.97)", borderColor: "#2A1852" }}>
      <div className="max-w-[1800px] mx-auto px-8 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5B21B6 0%, #D4A017 100%)" }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div><div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Rydra</div><div className="text-sm font-semibold text-white leading-none">Demand Intelligence</div></div>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <a key={t.href} href={t.href} className="px-3.5 py-1.5 rounded-md text-xs font-medium transition-all" style={t.active ? { background: PUR, color: "#fff" } : { color: PUR_LL }}>{t.label}</a>
          ))}
        </nav>
        <button onClick={() => window.dispatchEvent(new Event("rydra:toggle-copilot"))} className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold" style={{ background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.35)", color: GOLD }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />Ask RydraAI
        </button>
      </div>
    </div>
  );
}

export default function OutreachPage() {
  const [data, setData] = useState<OutreachOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [seg, setSeg] = useState("all");
  const [search, setSearch] = useState("");
  const [hideCooling, setHideCooling] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<{ summary: string; source: string } | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [run, setRun] = useState<RunState>(IDLE);
  const stopRef = useRef(false);
  const pendingOpen = useRef<{ user_id: string; draft?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await aiFetch("/api/outreach/overview");
      const d = await res.json();
      if (!res.ok) throw new Error(d.details || d.error || "Could not load outreach data");
      setData(d as OutreachOverview); setError("");
    } catch (e: any) { setError(e?.message || "Could not load outreach data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(t); }, [notice]);

  const cfg = data?.config;
  const cap = data ? Math.min(data.stats.remaining_today, 100) : 0;

  // ── Copilot control ────────────────────────────────────────────────────────
  function applyOpen() {
    const p = pendingOpen.current;
    if (!p || !data) return;
    pendingOpen.current = null;
    const row = data.queue.find((q) => q.user_id === p.user_id);
    if (!row) { setNotice("That client isn't in today's queue (they may be on hold, opted out, or texted recently)."); return; }
    setSelected((s) => new Set(s).add(row.user_id));
    if (p.draft) setMessage(p.draft);
    setNotice(`Added ${row.name} to today's list.`);
    document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  useCopilotActions((a: CopilotAction) => {
    if (a.type === "set_filters") {
      if (a.segment !== undefined) setSeg(a.segment === "all" ? "all" : a.segment);
      if (a.search !== undefined) setSearch(a.search);
    } else if (a.type === "open_sms") { pendingOpen.current = { user_id: a.user_id, draft: a.draft }; applyOpen(); }
  });
  useEffect(() => { applyOpen(); }, [data]);

  // ── Queue view ─────────────────────────────────────────────────────────────
  const view = useMemo(() => {
    if (!data) return [] as QueueRow[];
    const q = search.trim().toLowerCase();
    return data.queue.filter((r) => {
      if (hideCooling && r.cooling_down) return false;
      if (seg === "First timers" ? r.markov_state !== "C" : seg !== "all" && r.risk_segment !== seg) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [data, seg, search, hideCooling]);

  const chosen = useMemo(() => (data ? data.queue.filter((r) => selected.has(r.user_id)) : []), [data, selected]);
  const longestFirst = Math.max(0, ...chosen.map((c) => firstName(c.name).length));
  const personalise = (text: string, name: string) => `${text.replace(/\{first_name\}/g, firstName(name))} ${cfg?.booking_link ?? ""}`.trim();
  const worstLen = message ? personalise(message, "x".repeat(longestFirst || 8)).length : 0;
  const problem = !message.trim() ? "Write a message first." : !message.includes("{first_name}") ? "Include {first_name} so each text is personal." : /https?:|www\./i.test(message) ? "Leave links out. The booking link is added for you." : cfg && worstLen > cfg.body_max ? `Too long by ${worstLen - cfg.body_max} characters for your longest name.` : "";
  const estCost = chosen.length * 0.08;
  const overCap = chosen.length > cap;
  const canSend = !!data && chosen.length > 0 && !problem && !overCap && !run.running;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectTop = () => setSelected(new Set(view.slice(0, cap).map((r) => r.user_id)));

  async function buildPlan() {
    if (!data) return;
    setPlanLoading(true); setNotice("");
    try {
      const res = await aiFetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "outreach_plan", max_clients: Math.min(25, Math.max(cap, 1)) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not build a plan");
      setSelected(new Set<string>(d.user_ids)); setMessage(d.message); setPlan({ summary: d.summary, source: d.source });
      setSeg("all"); setHideCooling(true);
    } catch (e: any) { setNotice(e?.message || "Could not build a plan"); }
    finally { setPlanLoading(false); }
  }

  async function writeTemplate() {
    if (!cfg) return;
    setTplLoading(true);
    try {
      const res = await aiFetch("/api/ai/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "sms_template", segment: seg === "all" ? undefined : seg, max_chars: cfg.copy_max }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not write a message");
      setMessage(d.message);
    } catch (e: any) { setNotice(e?.message || "Could not write a message"); }
    finally { setTplLoading(false); }
  }

  async function startSend() {
    if (!cfg) return;
    const targets = chosen.filter((c) => personalise(message, c.name).length <= cfg.body_max);
    const tooLong = chosen.length - targets.length;
    stopRef.current = false;
    setRun({ ...IDLE, open: true, running: true, total: targets.length, skipped: tooLong ? { too_long: tooLong } : {} });
    let sent = 0; const skipped: Record<string, number> = tooLong ? { too_long: tooLong } : {}; let done = 0; let stopped = false;
    for (const t of targets) {
      if (stopRef.current) { stopped = true; break; }
      try {
        const res = await aiFetch("/api/sms/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: t.user_id, message: personalise(message, t.name), customer_name: t.name, markov_state: t.markov_state, risk_segment: t.risk_segment, bulk: true }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) sent++;
        else { const r = String(d.reason || (res.status === 429 ? "rate_limited" : "error")); skipped[r] = (skipped[r] ?? 0) + 1; if (r === "daily_cap") { done++; stopped = true; setRun((s) => ({ ...s, done, sent, skipped: { ...skipped } })); break; } }
      } catch { skipped.network = (skipped.network ?? 0) + 1; }
      done++;
      setRun((s) => ({ ...s, done, sent, skipped: { ...skipped } }));
      await sleep(350);
    }
    setRun((s) => ({ ...s, running: false, finished: true, stopped: stopped || stopRef.current, done, sent, skipped: { ...skipped } }));
    setSelected(new Set()); load();
  }

  const preview = personalise(message || "Hi {first_name}, ...", chosen[0]?.name ?? "Jack");
  const bar = data && data.stats.remaining_today >= 0 ? Math.min(100, (data.stats.sent_24h / data.config.daily_cap) * 100) : 0;

  const kpis = data ? [
    { label: "Sent, last 24 hours", value: String(data.stats.sent_24h), sub: `${data.stats.remaining_today} left of ${data.config.daily_cap} daily limit`, accent: PUR_L },
    { label: "Sent, 30 days", value: String(data.stats.sent_30d), sub: `${data.stats.failed_30d} failed`, accent: GOLD },
    { label: "SMS spend, 30 days", value: `$${data.stats.cost_30d.toFixed(2)}`, sub: data.stats.sent_30d ? `$${(data.stats.cost_30d / data.stats.sent_30d).toFixed(3)} per text` : "No texts yet", accent: GOLD2 },
    { label: "Ready to text", value: String(data.candidates_total), sub: `${data.cooling_total} recently texted · ${data.blocked.held} on hold`, accent: "#34D399" },
    { label: "Opted out", value: String(data.blocked.opted_out), sub: "never messaged again", accent: "#F43F5E" },
  ] : [];

  return (
    <div className="min-h-screen bg-[#0A0612] text-white pb-16" style={{ isolation: "isolate" }}>
      <AuroraBackground />
      <TopNav />
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD2 }}>Alkami Barbershop · Canberra</div>
            <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
            <p className="text-sm mt-1" style={{ color: PUR_LL }}>Choose who to text, review the message, send.</p>
          </div>
          <button onClick={buildPlan} disabled={planLoading || loading || !data}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold disabled:opacity-40"
            style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.4)", color: GOLD }}>
            {planLoading ? <><div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: "rgba(212,160,23,0.3)", borderTopColor: GOLD }} />Building today's list...</> : "✦ Build today's list with AI"}
          </button>
        </div>

        {notice && <div className="mb-4 rounded-lg border px-4 py-2.5 text-xs" style={{ background: "rgba(212,160,23,0.08)", borderColor: "rgba(212,160,23,0.3)", color: GOLD }}>{notice}</div>}
        {error && <div className="mb-6 rounded-xl border px-5 py-4" style={{ background: "rgba(244,63,94,0.08)", borderColor: "rgba(244,63,94,0.35)" }}><div className="text-xs font-bold mb-1 text-rose-400">Could not load outreach</div><p className="text-xs" style={{ color: "#C4B5FD" }}>{error}</p></div>}
        {loading && !data && <div className="py-24 text-center text-xs" style={{ color: MUTED }}>Loading outreach...</div>}

        {data && cfg && (
          <>
            <div className="grid grid-cols-5 gap-4 mb-6">
              {kpis.map((k) => (
                <div key={k.label} className="rydra-glass border border-[#2A1852] rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ background: k.accent }} />
                  <div className="pl-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>{k.label}</div>
                    <div className="text-3xl font-bold tracking-tight mb-1"><CountUp text={k.value} /></div>
                    <div className="text-[11px]" style={{ color: MUTED }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rydra-glass border border-[#2A1852] rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Texts per day</div>
                <div className="text-[11px]" style={{ color: MUTED }}>Last 30 days · daily limit {cfg.daily_cap} · same client blocked for {cfg.cooldown_days} days</div>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={data.daily} margin={{ left: -24 }}>
                  <XAxis dataKey="date" stroke="#3A2268" fontSize={9} tick={{ fill: MUTED }} tickFormatter={(d: string) => d.slice(5)} interval={4} />
                  <YAxis stroke="#3A2268" fontSize={9} tick={{ fill: MUTED }} allowDecimals={false} />
                  <Tooltip contentStyle={TIP} formatter={(v: any, n: any) => [v, n === "sent" ? "Sent" : "Failed"]} />
                  <Bar dataKey="sent" stackId="a" fill={PUR_L} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="failed" stackId="a" fill="#F43F5E" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-6 mb-6" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
              {/* ── Queue ── */}
              <div className="rydra-glass border border-[#2A1852] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b" style={{ borderColor: "#2A1852" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div><div className="text-sm font-semibold">Today's queue</div><div className="text-[11px]" style={{ color: MUTED }}>Highest estimated value first. Only clients who can be messaged appear here.</div></div>
                    <button onClick={selectTop} className="px-3 py-1.5 rounded-md text-[11px] font-medium border" style={{ borderColor: "#3A2268", color: PUR_LL, background: "#1A1030" }}>Select top {Math.min(cap, view.length)}</button>
                  </div>
                  <div className="flex gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name..." className="flex-1 rounded-md px-3 py-2 text-xs text-white placeholder-[#6B5C8A] focus:outline-none" style={{ background: "#0F0A1E", border: "1px solid #2A1852" }} />
                    <select value={seg} onChange={(e) => setSeg(e.target.value)} className="rounded-md px-3 py-2 text-xs border" style={{ background: "#0F0A1E", borderColor: "#2A1852", color: "#C4B5FD" }}>
                      <option value="all">All types</option><option value="Churned">Churned</option><option value="At Risk">At risk</option><option value="Stable">Stable</option><option value="First timers">First timers</option>
                    </select>
                    <label className="flex items-center gap-2 text-[11px] px-2" style={{ color: PUR_LL }}>
                      <input type="checkbox" checked={hideCooling} onChange={(e) => setHideCooling(e.target.checked)} />Hide recently texted
                    </label>
                  </div>
                  {plan && (
                    <div className="mt-3 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed" style={{ background: "rgba(212,160,23,0.06)", borderColor: "rgba(212,160,23,0.25)", color: "#C4B5FD" }}>
                      <span className="font-semibold" style={{ color: GOLD }}>{plan.source === "ai" ? "AI plan: " : "Suggested list: "}</span>{plan.summary}
                    </div>
                  )}
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
                  <table className="w-full">
                    <thead className="sticky top-0" style={{ background: "#0F0A1E" }}>
                      <tr>{["", "Client", "Type", "Overdue", "Visits", "CLV", "Est. value", "Last texted"].map((h, i) => (
                        <th key={h + i} className={`px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest ${i > 2 ? "text-right" : "text-left"}`} style={{ color: MUTED }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {view.map((r) => (
                        <tr key={r.user_id} onClick={() => toggle(r.user_id)} className="border-b cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: "#100820", background: selected.has(r.user_id) ? "rgba(91,33,182,0.14)" : undefined }}>
                          <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(r.user_id)} onChange={() => toggle(r.user_id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${r.name}`} /></td>
                          <td className="px-4 py-2.5 text-sm font-medium">{r.name}</td>
                          <td className="px-4 py-2.5"><span className="text-[10px] font-semibold" style={{ color: STATE_COLOR[r.markov_state] }}>{STATE_LABEL[r.markov_state]}</span></td>
                          <td className="px-4 py-2.5 text-right text-xs">{r.days_since_last_visit}d</td>
                          <td className="px-4 py-2.5 text-right text-xs" style={{ color: PUR_LL }}>{r.visits}</td>
                          <td className="px-4 py-2.5 text-right text-xs" style={{ color: GOLD }}>{money(r.clv_aud)}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-semibold" style={{ color: GOLD }}>+${r.intervention_value_aud.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-[11px]" style={{ color: r.cooling_down ? "#FB923C" : MUTED }}>{ago(r.last_texted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {view.length === 0 && <div className="py-14 text-center text-xs" style={{ color: MUTED }}>No clients match. Try clearing the filters.</div>}
                </div>
              </div>

              {/* ── Composer ── */}
              <div id="composer" className="rydra-glass border border-[#2A1852] rounded-xl p-5 self-start sticky top-20">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold">Message</div>
                  <div className="text-[11px]" style={{ color: chosen.length ? GOLD : MUTED }}>{chosen.length} selected</div>
                </div>
                <div className="h-[3px] rounded-full mb-4 overflow-hidden" style={{ background: "#2A1852" }}><div className="h-full rounded-full" style={{ width: `${bar}%`, background: bar > 85 ? "#F43F5E" : PUR_L }} /></div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={200}
                  placeholder="Hi {first_name}, it's been a while! Alkami has spots this week."
                  className="w-full rounded-lg px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-[#7C3AED]" style={{ background: "#0F0A1E", border: "1px solid #2A1852" }} />
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span style={{ color: problem ? "#FDA4AF" : MUTED }}>{problem || "Booking link and opt-out line are added automatically."}</span>
                  <span className="font-mono" style={{ color: worstLen > cfg.body_max ? "#F43F5E" : MUTED }}>{worstLen}/{cfg.body_max}</span>
                </div>
                <button onClick={writeTemplate} disabled={tplLoading} className="w-full mt-3 py-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider disabled:opacity-40"
                  style={{ background: "rgba(91,33,182,0.15)", border: "1px solid rgba(91,33,182,0.35)", color: PUR_LL }}>
                  {tplLoading ? "Writing..." : `✦ Write with AI${seg !== "all" ? ` for ${seg === "At Risk" ? "at-risk" : seg.toLowerCase()} clients` : ""}`}
                </button>

                <div className="mt-4 rounded-lg p-4 border" style={{ background: "#0F0A1E", borderColor: "#2A1852" }}>
                  <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: MUTED }}>Preview{chosen[0] ? ` for ${firstName(chosen[0].name)}` : ""}</div>
                  <div className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-tr-sm px-3 py-2" style={{ background: PUR }}>
                    <p className="text-white text-xs leading-relaxed">{preview}</p>
                    <p className="text-white/60 text-[10px] mt-1.5">Opt out: link added automatically</p>
                  </div></div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div><div style={{ color: MUTED }}>Recipients</div><div className="font-semibold">{chosen.length}</div></div>
                  <div><div style={{ color: MUTED }}>Est. cost</div><div className="font-semibold">${estCost.toFixed(2)}</div></div>
                  <div><div style={{ color: MUTED }}>Left today</div><div className="font-semibold" style={{ color: overCap ? "#F43F5E" : undefined }}>{data.stats.remaining_today}</div></div>
                </div>
                {overCap && <div className="mt-2 text-[11px] text-rose-400">You've selected more than today's limit. Deselect {chosen.length - cap}.</div>}
                <button onClick={() => setRun({ ...IDLE, open: true, total: chosen.length })} disabled={!canSend}
                  className="w-full mt-4 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: PUR, boxShadow: "0 4px 20px rgba(91,33,182,0.35)" }}>
                  {chosen.length ? `Review and send to ${chosen.length}` : "Select clients to text"}
                </button>
                {chosen.length > 0 && <button onClick={() => setSelected(new Set())} className="w-full mt-2 py-1.5 text-[11px]" style={{ color: MUTED }}>Clear selection</button>}
              </div>
            </div>

            {/* ── Log ── */}
            <div className="rydra-glass border border-[#2A1852] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b text-sm font-semibold" style={{ borderColor: "#2A1852" }}>Recent messages</div>
              <table className="w-full">
                <thead style={{ background: "#0F0A1E" }}><tr>{["When", "Client", "Number", "Type", "Status", "Cost"].map((h, i) => (
                  <th key={h} className={`px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest ${i > 3 ? "text-right" : "text-left"}`} style={{ color: MUTED }}>{h}</th>))}</tr></thead>
                <tbody>
                  {data.recent.map((m, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "#100820" }}>
                      <td className="px-5 py-2.5 text-xs" style={{ color: MUTED }}>{ago(m.sent_at)}</td>
                      <td className="px-5 py-2.5 text-sm">{m.name}</td>
                      <td className="px-5 py-2.5 text-xs font-mono" style={{ color: MUTED }}>{m.phone_last4 ? `•••• ${m.phone_last4}` : "-"}</td>
                      <td className="px-5 py-2.5 text-xs" style={{ color: m.markov_state ? STATE_COLOR[m.markov_state] : MUTED }}>{m.markov_state ? STATE_LABEL[m.markov_state] : "-"}</td>
                      <td className="px-5 py-2.5 text-right"><span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={m.status === "failed" ? { color: "#F43F5E", background: "rgba(244,63,94,.1)" } : { color: "#34D399", background: "rgba(52,211,153,.1)" }}>{m.status === "failed" ? "Failed" : "Sent"}</span></td>
                      <td className="px-5 py-2.5 text-right text-xs">${m.cost.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.recent.length === 0 && <div className="py-12 text-center text-xs" style={{ color: MUTED }}>No messages yet. Your first send will show up here.</div>}
            </div>
          </>
        )}
      </div>

      {/* ── Confirm / progress ── */}
      {run.open && cfg && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={() => !run.running && setRun(IDLE)} />
          <div role="dialog" aria-label="Confirm send" className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6" style={{ background: "#0A0612", borderColor: "#3A2268" }}>
            {!run.running && !run.finished ? (
              <>
                <div className="text-lg font-semibold">Send {chosen.length} text{chosen.length === 1 ? "" : "s"}?</div>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: PUR_LL }}>Each client gets their own personalised message. Anyone who has opted out, is on hold, or was texted in the last {cfg.cooldown_days} days is skipped automatically.</p>
                <div className="mt-4 rounded-lg p-3.5 border" style={{ background: "#0F0A1E", borderColor: "#2A1852" }}>
                  <div className="flex justify-end"><div className="max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2" style={{ background: PUR }}><p className="text-white text-xs leading-relaxed">{preview}</p><p className="text-white/60 text-[10px] mt-1.5">Opt out: link added automatically</p></div></div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div><div style={{ color: MUTED }}>Recipients</div><div className="font-semibold">{chosen.length}</div></div>
                  <div><div style={{ color: MUTED }}>Est. cost</div><div className="font-semibold">${estCost.toFixed(2)}</div></div>
                  <div><div style={{ color: MUTED }}>Left after</div><div className="font-semibold">{Math.max(0, data!.stats.remaining_today - chosen.length)}</div></div>
                </div>
                <div className="mt-5 flex gap-2">
                  <button autoFocus onClick={() => setRun(IDLE)} className="flex-1 py-2.5 rounded-lg text-sm border" style={{ borderColor: "#2A1852", color: PUR_LL }}>Cancel</button>
                  <button onClick={startSend} className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: PUR }}>Send {chosen.length} text{chosen.length === 1 ? "" : "s"}</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold">{run.running ? "Sending..." : run.stopped ? "Stopped" : "Done"}</div>
                <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "#2A1852" }}><div className="h-full rounded-full transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%`, background: run.finished ? "#34D399" : PUR_L }} /></div>
                <div className="mt-2 text-xs" style={{ color: PUR_LL }}>{run.done} of {run.total} processed · <span className="text-emerald-400">{run.sent} sent</span></div>
                {Object.keys(run.skipped).length > 0 && (
                  <div className="mt-3 rounded-lg border p-3 text-xs space-y-1" style={{ borderColor: "#2A1852", color: "#C4B5FD" }}>
                    <div className="font-semibold text-white">Not sent</div>
                    {Object.entries(run.skipped).map(([k, v]) => <div key={k}>{v} · {REASON[k] ?? k.replace(/_/g, " ")}</div>)}
                  </div>
                )}
                <div className="mt-5 flex gap-2">
                  {run.running
                    ? <button onClick={() => { stopRef.current = true; }} className="flex-1 py-2.5 rounded-lg text-sm border" style={{ borderColor: "rgba(244,63,94,.4)", color: "#FDA4AF" }}>Stop after this one</button>
                    : <button onClick={() => setRun(IDLE)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: PUR }}>Close</button>}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
