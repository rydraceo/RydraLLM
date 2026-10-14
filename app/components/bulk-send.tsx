"use client";
// Bulk personalised SMS: pick how many clients, let the AI write one message per client,
// review/edit/untick, then send. Every send still goes through /api/sms/send, which re-checks
// opt-out, hold, daily cap and cooldown on the server, so nothing here can bypass the safeguards.
import { useEffect, useMemo, useRef, useState } from "react";
import { aiFetch } from "@/lib/ai/client";

export interface BulkCustomer {
  user_id: string; name: string; phone: string; markov_state: string; risk_segment: string;
  gap_ratio: number; days_overdue: number; intervention_value: number; sms_blocked?: boolean;
}
type Draft = { id: string; text: string; source: string; on: boolean; state: "pending" | "ready" | "failed"; result?: string };
type Step = "setup" | "drafting" | "review" | "sending" | "done";

const MAX_BATCH = 25;      // matches the AI route's 40/min limit and keeps a batch reviewable
const COST_PER_SMS = 0.08; // AUD, shown as an estimate only
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BulkSendModal<T extends BulkCustomer>({
  customers, label, hex, maxChars, venueId, onClose, onSent, slot, fixed,
}: { customers: T[]; label: string; hex: string; maxChars: number; venueId?: string; onClose: () => void; onSent: () => void;
  /** An open slot to offer (day/time/barber). The AI is told exactly this and nothing else about availability. */
  slot?: { label: string; time?: string; barber?: string };
  /** Use the list exactly as given (already ranked) instead of re-sorting by value. */
  fixed?: boolean }) {
  const [step, setStep] = useState<Step>("setup");
  const [count, setCount] = useState(fixed ? Math.min(customers.length, MAX_BATCH) || 1 : 10);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cooling, setCooling] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState<{ sent: number; skipped: Record<string, number>; stopped: boolean }>({ sent: 0, skipped: {}, stopped: false });
  const stopRef = useRef(false);

  // Pull today's remaining allowance and who is in the cooldown window, so the count we offer is real.
  useEffect(() => {
    aiFetch("/api/outreach/overview").then((r) => r.json()).then((d) => {
      if (d?.stats) setRemaining(Math.max(0, d.stats.remaining_today));
      if (Array.isArray(d?.queue)) setCooling(new Set(d.queue.filter((q: any) => q.cooling_down).map((q: any) => q.user_id)));
    }).catch(() => {});
  }, []);

  const eligible = useMemo(
    () => { const l = [...customers].filter((c) => !c.sms_blocked && c.phone && !cooling.has(c.user_id)); return fixed ? l : l.sort((a, b) => b.intervention_value - a.intervention_value); },
    [customers, cooling, fixed],
  );
  const hardMax = Math.max(0, Math.min(MAX_BATCH, eligible.length, remaining ?? MAX_BATCH));
  useEffect(() => { setCount((n) => Math.min(Math.max(1, n), Math.max(1, hardMax))); }, [hardMax]);
  const byId = useMemo(() => new Map(customers.map((c) => [c.user_id, c])), [customers]);

  async function writeMessages() {
    const picked = eligible.slice(0, count);
    setDrafts(picked.map((c) => ({ id: c.user_id, text: "", source: "", on: true, state: "pending" })));
    setProgress({ done: 0, total: picked.length });
    setStep("drafting"); stopRef.current = false;
    let done = 0, i = 0;
    const worker = async () => {
      while (i < picked.length && !stopRef.current) {
        const c = picked[i++];
        let ok = false, text = "", source = "";
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const res = await aiFetch("/api/ai/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: c, max_chars: maxChars, slot }) });
            if (res.status === 429) { await sleep(6000); continue; }
            const d = await res.json().catch(() => ({}));
            if (res.ok && d.message) { text = String(d.message).slice(0, maxChars); source = String(d.source ?? "ai"); ok = true; }
            else break;
          } catch { await sleep(800); }
        }
        done++;
        setProgress((p) => ({ ...p, done }));
        setDrafts((ds) => ds.map((d) => d.id === c.user_id ? { ...d, text, source, state: ok ? "ready" : "failed", on: ok } : d));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setStep("review");
  }

  const chosen = drafts.filter((d) => d.on && d.state === "ready" && d.text.trim() && d.text.length <= maxChars);
  const edit = (id: string, text: string) => setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, text: text.slice(0, maxChars) } : d));
  const toggle = (id: string) => setDrafts((ds) => ds.map((d) => d.id === id && d.state === "ready" ? { ...d, on: !d.on } : d));

  async function send() {
    setStep("sending"); stopRef.current = false;
    let sent = 0, stopped = false; const skipped: Record<string, number> = {};
    setProgress({ done: 0, total: chosen.length });
    for (let n = 0; n < chosen.length; n++) {
      if (stopRef.current) { stopped = true; break; }
      const d = chosen[n]; const c = byId.get(d.id)!;
      let result = "sent";
      try {
        const res = await aiFetch("/api/sms/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: c.user_id, message: d.text, customer_name: c.name, venue_id: venueId, markov_state: c.markov_state, risk_segment: c.risk_segment, gap_ratio: c.gap_ratio, days_overdue: c.days_overdue, bulk: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok) sent++;
        else { result = String(j.reason || (res.status === 429 ? "rate_limited" : "error")); skipped[result] = (skipped[result] ?? 0) + 1; if (result === "daily_cap") { stopped = true; setProgress({ done: n + 1, total: chosen.length }); break; } }
      } catch { result = "network"; skipped.network = (skipped.network ?? 0) + 1; }
      setDrafts((ds) => ds.map((x) => x.id === d.id ? { ...x, result } : x));
      setProgress({ done: n + 1, total: chosen.length });
      await sleep(350);
    }
    setSummary({ sent, skipped, stopped: stopped || stopRef.current });
    setStep("done"); onSent();
  }

  const busy = step === "drafting" || step === "sending";
  const close = () => { if (step === "sending") stopRef.current = true; onClose(); };
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const nice = (r: string) => r.replace(/_/g, " ");

  return (
    <>
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40" onClick={() => !busy && close()} />
      <div className="fixed right-0 top-0 h-full w-[560px] max-w-full z-50 flex flex-col" style={{ background: "#0A0612", borderLeft: "1px solid #2A1852" }}>
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #2A1852" }}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: hex }}>Bulk outreach · {label}</div>
            <div className="text-sm font-semibold text-white">Personalised messages, one per client</div>
          </div>
          <button onClick={close} aria-label="Close" className="w-7 h-7 rounded-md flex items-center justify-center" style={{ border: "1px solid #2A1852", background: "#1A1030", color: "#A78BFA" }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "setup" && (
            <div>
              <p className="text-xs mb-5" style={{ color: "#A78BFA" }}>
                RydraAI writes a different message for each client from their own visit history. You choose how many, review every message, then send. {slot ? `Each message offers the open spot (${slot.label}${slot.time ? ` at ${slot.time}` : ""}${slot.barber ? ` with ${slot.barber}` : ""}). ` : ""}{fixed ? "Clients are in the order you ranked them." : "Highest-value clients come first."}
              </p>
              <div className="rounded-lg p-4 mb-5 border" style={{ background: "#1A1030", borderColor: "#2A1852" }}>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#6B5C8A" }}>How many clients?</span>
                  <span className="text-3xl font-bold text-white">{hardMax === 0 ? 0 : count}</span>
                </div>
                <input type="range" min={1} max={Math.max(1, hardMax)} value={Math.min(count, Math.max(1, hardMax))} disabled={hardMax === 0}
                  onChange={(e) => setCount(Number(e.target.value))} className="w-full" style={{ accentColor: hex }} />
                <div className="flex gap-2 mt-3">
                  {[5, 10, 25].filter((n) => n <= hardMax).map((n) => (
                    <button key={n} onClick={() => setCount(n)} className="text-[11px] px-2.5 py-1 rounded-md" style={{ border: "1px solid #2A1852", color: count === n ? hex : "#A78BFA", background: count === n ? `${hex}15` : "transparent" }}>{n}</button>
                  ))}
                  {hardMax > 0 && <button onClick={() => setCount(hardMax)} className="text-[11px] px-2.5 py-1 rounded-md" style={{ border: "1px solid #2A1852", color: "#A78BFA" }}>Max ({hardMax})</button>}
                </div>
                <div className="text-[11px] mt-4 space-y-1" style={{ color: "#6B5C8A" }}>
                  <div>{eligible.length.toLocaleString()} reachable in this segment{customers.length - eligible.length > 0 ? ` (${(customers.length - eligible.length).toLocaleString()} excluded: opted out, on hold, or texted recently)` : ""}</div>
                  <div>{remaining === null ? "Checking today's limit…" : `${remaining} texts left under today's daily limit`} · up to {MAX_BATCH} per batch</div>
                  <div>Estimated cost: ~${(count * COST_PER_SMS).toFixed(2)}</div>
                </div>
              </div>
              <button onClick={writeMessages} disabled={hardMax === 0 || remaining === null}
                className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: hex, color: "#fff" }}>
                {hardMax === 0 ? "No one available to message" : `Write ${count} personalised message${count === 1 ? "" : "s"}`}
              </button>
              <p className="text-[10px] mt-3" style={{ color: "#6B5C8A" }}>Nothing is sent until you review and confirm.</p>
            </div>
          )}

          {(step === "drafting" || step === "sending") && (
            <div className="mb-5">
              <div className="flex justify-between text-xs mb-2" style={{ color: "#A78BFA" }}>
                <span>{step === "drafting" ? "Writing messages…" : "Sending…"}</span><span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "#2A1852" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: hex, transition: "width .3s" }} /></div>
              <button onClick={() => { stopRef.current = true; }} className="mt-3 text-[11px] px-3 py-1.5 rounded-md" style={{ border: "1px solid #3A2268", color: "#C4B5FD" }}>Stop</button>
            </div>
          )}

          {step === "done" && (
            <div className="rounded-lg p-4 mb-5 border" style={{ background: "rgba(52,211,153,0.07)", borderColor: "rgba(52,211,153,0.3)" }}>
              <div className="text-sm font-semibold text-white mb-1">{summary.sent} message{summary.sent === 1 ? "" : "s"} sent{summary.stopped ? " (stopped early)" : ""}</div>
              {Object.entries(summary.skipped).length > 0 && (
                <div className="text-xs" style={{ color: "#FB923C" }}>Not sent: {Object.entries(summary.skipped).map(([k, v]) => `${v} ${nice(k)}`).join(", ")}</div>
              )}
              <button onClick={onClose} className="mt-3 text-xs font-semibold px-4 py-2 rounded-md" style={{ background: "#5B21B6", color: "#fff" }}>Done</button>
            </div>
          )}

          {drafts.length > 0 && step !== "setup" && (
            <ul className="space-y-3">
              {drafts.map((d) => {
                const c = byId.get(d.id); if (!c) return null;
                const editable = step === "review";
                return (
                  <li key={d.id} className="rounded-lg p-3 border" style={{ background: "#1A1030", borderColor: d.on ? `${hex}40` : "#2A1852", opacity: d.on || step === "done" ? 1 : 0.55 }}>
                    <div className="flex items-center gap-2 mb-2">
                      {editable && <input type="checkbox" checked={d.on} disabled={d.state !== "ready"} onChange={() => toggle(d.id)} style={{ accentColor: hex }} />}
                      <span className="text-xs font-semibold text-white">{c.name}</span>
                      <span className="text-[10px]" style={{ color: "#6B5C8A" }}>{c.days_overdue}d overdue · ${c.intervention_value.toFixed(0)} at stake</span>
                      <span className="ml-auto text-[10px]" style={{ color: d.result === "sent" ? "#34D399" : d.result ? "#FB923C" : "#6B5C8A" }}>
                        {d.result ? (d.result === "sent" ? "sent ✓" : nice(d.result)) : d.state === "pending" ? "writing…" : d.state === "failed" ? "could not draft" : d.source && d.source !== "ai" ? "template" : ""}
                      </span>
                    </div>
                    {d.state === "ready" && (editable
                      ? <><textarea value={d.text} onChange={(e) => edit(d.id, e.target.value)} rows={3} className="w-full rounded-md p-2 text-xs text-white resize-none focus:outline-none" style={{ background: "#0F0A1E", border: "1px solid #2A1852" }} />
                          <div className="text-[10px] text-right" style={{ color: d.text.length >= maxChars ? "#FB923C" : "#6B5C8A" }}>{d.text.length}/{maxChars}</div></>
                      : <p className="text-xs" style={{ color: "#C4B5FD" }}>{d.text}</p>)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {step === "review" && (
          <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid #2A1852" }}>
            {!confirm ? (
              <button onClick={() => setConfirm(true)} disabled={chosen.length === 0} className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: hex, color: "#fff" }}>
                Review &amp; send {chosen.length} message{chosen.length === 1 ? "" : "s"}
              </button>
            ) : (
              <div>
                <p className="text-xs mb-3 text-center" style={{ color: "#FBBF24" }}>
                  This will text {chosen.length} real client{chosen.length === 1 ? "" : "s"} (about ${(chosen.length * COST_PER_SMS).toFixed(2)}). Opt-out links are added automatically.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirm(false)} className="flex-1 py-3 rounded-lg text-sm" style={{ border: "1px solid #3A2268", color: "#C4B5FD" }}>Back</button>
                  <button onClick={send} className="flex-1 py-3 rounded-lg text-sm font-semibold" style={{ background: "#16A34A", color: "#fff" }}>Yes, send now</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
