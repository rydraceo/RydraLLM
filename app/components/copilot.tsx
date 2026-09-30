"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FxStyles } from "@/app/components/fx";
import { emitAction, queueAction } from "@/lib/ai/bus";
import type { CampaignDraft, CopilotAction, CopilotResponse, UiAction } from "@/lib/ai/types";

type Msg = { id: string; role: "user" | "assistant"; content: string; actions?: UiAction[]; drafts?: CampaignDraft[]; error?: boolean };

const STORE = "rydra:copilot:v1";
const DASH = "/merchant/dashboard";
const GOLD = "#D4A017";
const PUR = "#5B21B6";
const PUR_LL = "#A78BFA";

const PROMPTS: Record<string, string[]> = {
  dashboard: ["What should I do first today?", "Who should I text this week?", "Show churned clients I can still message", "Draft a win-back text for my at-risk regulars"],
  outreach: ["How have my recent texts performed?", "Who is due a rebook nudge?", "How much have I spent on SMS this month?"],
  campaign: ["Draft a campaign for at-risk regulars", "What would a first-timer rebook campaign cost?", "Who is on hold, and why?"],
  clients: ["Find clients with 5+ visits who have gone quiet", "Who has opted out or is on hold?", "Show my highest value clients"],
  barbers: ["Which barber looks strongest right now?", "Summarise barber performance"],
};

function tabOf(path: string) {
  if (path.includes("/outreach")) return "outreach";
  if (path.includes("/campaign")) return "campaign";
  if (path.includes("/clients")) return "clients";
  if (path.includes("/barber")) return "barbers";
  return "dashboard";
}

const uid = () => Math.random().toString(36).slice(2, 10);

function describe(a: UiAction): string {
  switch (a.type) {
    case "navigate": return `Opened ${a.label}`;
    case "scroll_to": return `Scrolled to ${a.section === "ai" ? "RydraAI" : a.section}`;
    case "open_sms": return "Opened the SMS composer";
    case "set_filters": {
      const p: string[] = [];
      if (a.segment && a.segment !== "all") p.push(a.segment);
      if (a.sms_status && a.sms_status !== "all") p.push(a.sms_status === "ok" ? "messageable" : a.sms_status.replace("_", " "));
      if (a.search) p.push(`"${a.search}"`);
      return p.length ? `Filtered clients: ${p.join(", ")}` : "Cleared client filters";
    }
  }
}

// ─── Small text renderer (bold, bullets) ─────────────────────────────────────
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
      )}
    </>
  );
}
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((l, i) => {
        const b = l.match(/^\s*[-•*]\s+(.*)/);
        const n = l.match(/^\s*(\d+)[.)]\s+(.*)/);
        if (b) return <div key={i} className="flex gap-2.5"><span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: GOLD }} /><span><Inline text={b[1]} /></span></div>;
        if (n) return <div key={i} className="flex gap-2"><span className="font-mono text-xs mt-0.5" style={{ color: PUR_LL }}>{n[1]}.</span><span><Inline text={n[2]} /></span></div>;
        if (!l.trim()) return <div key={i} className="h-1" />;
        return <p key={i}><Inline text={l} /></p>;
      })}
    </div>
  );
}

function DraftCard({ d, onReview }: { d: CampaignDraft; onReview: (d: CampaignDraft) => void }) {
  const [copied, setCopied] = useState(false);
  const preview = d.message.replace("{first_name}", "Jack");
  return (
    <div className="mt-3 rounded-xl border p-3.5" style={{ background: "rgba(26,16,48,.7)", borderColor: "#3A2268" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{d.name}</div>
        <div className="text-[11px]" style={{ color: "#6B5C8A" }}>Draft, not sent</div>
      </div>
      <div className="mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed text-white" style={{ background: PUR }}>{preview}</div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        <div><div style={{ color: "#6B5C8A" }}>Audience</div><div className="text-white font-semibold">{d.audience_size.toLocaleString()}</div></div>
        <div><div style={{ color: "#6B5C8A" }}>Est. cost</div><div className="text-white font-semibold">${d.est_cost_aud.toFixed(2)}</div></div>
        <div><div style={{ color: "#6B5C8A" }}>Excluded</div><div className="text-white font-semibold">{d.excluded_blocked.toLocaleString()}</div></div>
      </div>
      <div className="mt-1.5 text-[11px]" style={{ color: "#6B5C8A" }}>{d.filters_summary}</div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => { navigator.clipboard?.writeText(d.message).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {}); }}
          className="flex-1 rounded-md border py-1.5 text-[11px] font-medium" style={{ borderColor: "#3A2268", color: PUR_LL, background: "#1A1030" }}>
          {copied ? "Copied" : "Copy message"}
        </button>
        <button onClick={() => onReview(d)} className="flex-1 rounded-md py-1.5 text-[11px] font-semibold" style={{ background: "rgba(212,160,23,.12)", border: "1px solid rgba(212,160,23,.35)", color: GOLD }}>
          Review recipients
        </button>
      </div>
    </div>
  );
}

// ─── Copilot ─────────────────────────────────────────────────────────────────
export default function Copilot() {
  const pathname = usePathname() || DASH;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tab = tabOf(pathname);

  // restore / persist conversation across tab changes and reloads
  useEffect(() => {
    try { const raw = sessionStorage.getItem(STORE); if (raw) setMessages(JSON.parse(raw)); } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);

  // open / close: Cmd+K, Escape, or a page dispatching "rydra:toggle-copilot"
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("keydown", key);
    window.addEventListener("rydra:toggle-copilot", toggle);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("rydra:toggle-copilot", toggle); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, open]);
  useEffect(() => {
    if (!loading) return;
    setPhase(0);
    const t = setInterval(() => setPhase((p) => p + 1), 1600);
    return () => clearInterval(t);
  }, [loading]);

  // Apply UI actions. Dashboard-only actions navigate first and are queued until the page mounts.
  const runActions = useCallback((actions: UiAction[]) => {
    let here = pathname;
    let waitingForMount = false;
    for (const a of actions) {
      if (a.type === "navigate") {
        if (here !== a.path) { router.push(a.path); here = a.path; waitingForMount = true; }
        continue;
      }
      if (!here.startsWith(DASH)) { router.push(DASH); here = DASH; waitingForMount = true; }
      if (waitingForMount) queueAction(a as CopilotAction); else emitAction(a as CopilotAction);
    }
  }, [pathname, router]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const next: Msg[] = [...messages, { id: uid(), role: "user", content: t }];
    setMessages(next); setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), context: { path: pathname } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Copilot could not answer that.");
      const r = data as CopilotResponse;
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: r.reply, actions: r.actions, drafts: r.drafts }]);
      if (r.actions?.length) runActions(r.actions);
    } catch (e: any) {
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: e?.message || "Something went wrong.", error: true }]);
    } finally { setLoading(false); }
  }

  const review = (d: CampaignDraft) => runActions([{ type: "set_filters", segment: d.segment ?? "all", sms_status: "ok" }]);
  const status = ["Reading your client data", "Checking who can be messaged", "Working out the best move"][phase % 3];

  return (
    <>
      <FxStyles />
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Rydra Copilot" className="fixed bottom-6 right-6 z-[60] h-14 w-14 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
          <span className="rydra-anim absolute inset-0 rounded-full" style={{ background: "rgba(124,58,237,.5)", animation: "rydra-ring 2.8s ease-out infinite" }} />
          <span className="rydra-anim absolute inset-0 rounded-full" style={{ background: "rgba(212,160,23,.35)", animation: "rydra-ring 2.8s ease-out 1.4s infinite" }} />
          <span className="relative flex h-full w-full items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,#5B21B6,#D4A017)", boxShadow: "0 8px 32px rgba(91,33,182,.55)" }}>
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Rydra Copilot" className="rydra-anim fixed bottom-4 right-4 top-4 z-[60] w-[440px] max-w-[calc(100vw-2rem)]" style={{ animation: "rydra-panel-in .28s cubic-bezier(.2,.8,.2,1)" }}>
          <div className="rydra-anim h-full rounded-2xl p-[1px]" style={{ background: "linear-gradient(120deg,#5B21B6,#D4A017,#7C3AED,#5B21B6)", backgroundSize: "300% 300%", animation: "rydra-flow 9s linear infinite" }}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl" style={{ background: "rgba(10,6,18,.97)" }}>
              {/* header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #2A1852" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg,#5B21B6,#D4A017)" }}>
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Rydra Copilot</div>
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6B5C8A" }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Online, on {tab}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {messages.length > 0 && <button onClick={() => setMessages([])} className="rounded-md px-2.5 py-1 text-[11px]" style={{ color: "#6B5C8A" }}>New chat</button>}
                  <button onClick={() => setOpen(false)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ borderColor: "#2A1852", background: "#1A1030", color: PUR_LL }}>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* messages */}
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {messages.length === 0 && (
                  <div>
                    <div className="text-lg font-semibold text-white">What should we work on?</div>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#A78BFA" }}>I can read your client data, move around the dashboard, and stage texts for you to review. I never send anything myself.</p>
                    <div className="mt-4 flex flex-col gap-2">
                      {PROMPTS[tab].map((p) => (
                        <button key={p} onClick={() => send(p)} className="rounded-lg border px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-[rgba(91,33,182,.15)]" style={{ borderColor: "#2A1852", color: "#C4B5FD" }}>{p}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={`rydra-anim flex ${m.role === "user" ? "justify-end" : "justify-start"}`} style={{ animation: "rydra-msg-in .22s ease-out" }}>
                    <div className="max-w-[92%]">
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-sm text-white" : "rounded-tl-sm"}`}
                        style={m.role === "user" ? { background: PUR } : { background: "#1A1030", border: `1px solid ${m.error ? "rgba(244,63,94,.4)" : "#2A1852"}`, color: m.error ? "#FDA4AF" : "#C4B5FD" }}>
                        {m.role === "user" ? m.content : <Rich text={m.content} />}
                      </div>
                      {m.actions && m.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.actions.map((a, i) => (
                            <span key={i} className="rounded-md px-2 py-1 text-[11px]" style={{ background: "rgba(212,160,23,.08)", border: "1px solid rgba(212,160,23,.25)", color: GOLD }}>{describe(a)}</span>
                          ))}
                        </div>
                      )}
                      {m.drafts?.map((d) => <DraftCard key={d.id} d={d} onReview={review} />)}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2.5 text-[13px]">
                    <span className="rydra-anim h-2 w-2 rounded-full" style={{ background: GOLD, animation: "rydra-ring 1.4s ease-out infinite" }} />
                    <span className="rydra-think">{status}</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* input */}
              <div className="px-4 pb-4 pt-3" style={{ borderTop: "1px solid #160C30" }}>
                <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
                  <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} maxLength={500}
                    placeholder="Ask, or tell me what to do..." className="flex-1 rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#6B5C8A] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                    style={{ background: "#0F0A1E", border: "1px solid #2A1852" }} />
                  <button type="submit" disabled={loading || !input.trim()} aria-label="Send" className="flex items-center rounded-lg px-4 text-white disabled:opacity-40" style={{ background: PUR }}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </button>
                </form>
                <div className="mt-2 text-center text-[11px]" style={{ color: "#6B5C8A" }}>Drafts and stages only. You press Send. Cmd K to toggle.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
