"use client";
import { useState } from "react";
import { aiFetch } from "@/lib/ai/client";

export const C = { GOLD: "#D4A017", PUR: "#5B21B6", PUR_L: "#7C3AED", PUR_LL: "#A78BFA", MUTED: "#6B5C8A", GREEN: "#34D399", RED: "#F43F5E", CARD: "#130C24", CARD2: "#1A1030", BDR: "#2A1852", BG: "#0A0612", SKY: "#38BDF8" };
export const money = (cents: number, dp = 2) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const dollars = (d: number) => `$${Math.round(d).toLocaleString("en-AU")}`;
export const dshort = (s: string | null | undefined) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: s.length <= 10 ? "UTC" : "Australia/Sydney" }) : "–");

export async function walletPost(body: Record<string, unknown>) {
  const r = await aiFetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}

export const STATUS: Record<string, { label: string; color: string }> = {
  requested: { label: "Waiting for approval", color: C.GOLD }, approved: { label: "Approved, not sent yet", color: C.SKY }, exported: { label: "In bank file", color: C.PUR_LL },
  paid: { label: "Paid", color: C.GREEN }, cancelled: { label: "Cancelled", color: C.MUTED }, failed: { label: "Failed, money returned", color: C.RED },
};

export function Box({ title, sub, right, children, className = "", tone }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; tone?: "accent" }) {
  return (
    <div className={`rounded-xl p-5 border ${className}`} style={tone === "accent" ? { background: "linear-gradient(135deg, #1B1240, #130C24)", borderColor: `${C.PUR_L}66` } : { background: C.CARD, borderColor: C.BDR }}>
      {(title || right) && <div className="flex items-start justify-between gap-3 mb-3"><div>{title && <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: tone === "accent" ? C.PUR_LL : C.MUTED }}>{title}</div>}{sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}</div>{right}</div>}
      {children}
    </div>
  );
}
export function Pill({ label, color }: { label: string; color: string }) { return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: `${color}1f` }}>{label}</span>; }
export function Btn({ children, onClick, disabled, kind = "primary", className = "", type = "button" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: "primary" | "ghost" | "gold" | "danger"; className?: string; type?: "button" | "submit" }) {
  const st = kind === "primary" ? { background: `linear-gradient(135deg, ${C.PUR}, ${C.PUR_L})`, color: "#fff" } : kind === "gold" ? { background: C.GOLD, color: "#000" } : kind === "danger" ? { background: "#3A1020", color: C.RED } : { background: "transparent", color: C.PUR_LL, border: `1px solid ${C.BDR}` };
  return <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-35 disabled:cursor-not-allowed transition-opacity ${className}`} style={st}>{children}</button>;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] mb-1" style={{ color: C.MUTED }}>{label}</div>{children}{hint && <div className="text-[10px] mt-1" style={{ color: C.MUTED }}>{hint}</div>}</label>;
}
export const inputCls = "w-full rounded-lg px-3 py-2 text-sm outline-none text-white";
export const inputStyle = { background: C.BG, border: `1px solid ${C.BDR}` };
export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const c = tone === "warn" ? C.GOLD : tone === "bad" ? "#FDA4AF" : tone === "good" ? C.GREEN : C.PUR_LL;
  const bg = tone === "warn" ? "#2A2108" : tone === "bad" ? "#2A0F1A" : tone === "good" ? "#0F2A1E" : "#1B1240";
  return <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed" style={{ background: bg, color: c, border: `1px solid ${c}33` }}>{children}</div>;
}

/** Small grounded Q&A box for the wallet assistant. */
export function WalletAsk({ barberId, prompts }: { barberId?: string; prompts: string[] }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [items, setItems] = useState<{ q: string; a: string; checked: boolean }[]>([]); const [err, setErr] = useState("");
  async function go(text = q) {
    const t = text.trim(); if (t.length < 3 || busy) return; setBusy(true); setErr(""); setQ("");
    try { const r = await aiFetch("/api/wallet/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: t, barber_id: barberId }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setItems((x) => [{ q: t, a: j.answer, checked: j.checked }, ...x].slice(0, 6)); }
    catch (e: any) { setErr(e?.message || "Unavailable"); } setBusy(false);
  }
  return (
    <div>
      <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Ask about pay, tax set-aside, GST..." className={inputCls} style={inputStyle} /><Btn onClick={() => go()} disabled={busy || q.trim().length < 3}>{busy ? "Working..." : "Ask"}</Btn></div>
      <div className="flex flex-wrap gap-1.5 mt-2">{prompts.map((p) => <button key={p} onClick={() => go(p)} disabled={busy} className="text-[11px] px-2.5 py-1 rounded-full border hover:text-white disabled:opacity-40" style={{ borderColor: C.BDR, color: "#94A3B8", background: C.CARD2 }}>{p}</button>)}</div>
      {err && <div className="mt-2"><Note tone="bad">{err}</Note></div>}
      <div className="space-y-3 mt-3">{items.map((it, i) => <div key={i} className="rounded-lg p-3" style={{ background: C.CARD2 }}><div className="text-[11px] font-semibold mb-1.5" style={{ color: C.PUR_LL }}>{it.q}</div><div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{it.a}</div><div className="text-[10px] mt-2" style={{ color: it.checked ? C.GREEN : C.GOLD }}>{it.checked ? "✓ Every figure checked against your wallet data" : "Includes figures the assistant calculated. Double-check them before acting."}</div></div>)}</div>
    </div>
  );
}
