"use client";
// Manager console (owner only): pay runs, barber wallets, approvals, the bank file, pay settings, client-history import,
// the wallet assistant and a full audit log. Every amount is recalculated and every money movement is checked on the server.
import { useCallback, useEffect, useMemo, useState } from "react";
import { aiFetch } from "@/lib/ai/client";
import { parseCsv, norm } from "@/lib/wallet/csv";
import { parseMoney } from "@/lib/wallet/payrun";
import VisitImport from "@/app/components/wallet/visit-import";
import { Box, Btn, C, Field, Note, Pill, STATUS, WalletAsk, dshort, inputCls, inputStyle, money, walletPost } from "@/app/components/wallet/ui";

type Tab = "overview" | "payrun" | "payouts" | "settings" | "history" | "bank" | "ai" | "audit";
const TABS: [Tab, string][] = [["overview", "Overview"], ["payrun", "Pay run"], ["payouts", "Payouts & bank file"], ["settings", "Pay settings"], ["history", "Client history"], ["bank", "Business bank"], ["ai", "Wallet AI"], ["audit", "Audit log"]];
const syd = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function presets() {
  const t = syd(); const dow = new Date(t + "T12:00:00Z").getUTCDay(); const lastSun = addDays(t, -(dow === 0 ? 7 : dow)); const lastMon = addDays(lastSun, -6);
  const m = new Date(t + "T12:00:00Z"); const firstThis = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)); const lastPrev = new Date(firstThis.getTime() - 864e5); const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1));
  return [{ label: "Last week", start: lastMon, end: lastSun }, { label: "Last fortnight", start: addDays(lastMon, -7), end: lastSun }, { label: "Last month", start: firstPrev.toISOString().slice(0, 10), end: lastPrev.toISOString().slice(0, 10) }];
}
function download(name: string, text: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

export default function OwnerConsole({ teamStats, onChanged }: { teamStats?: { visits: number; links: number; level: string }; onChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => { try { const r = await aiFetch("/api/wallet"); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); setErr(""); } catch (e: any) { setErr(e?.message || "Couldn't load wallets"); } }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (body: any, ok: string | ((j: any) => string)) => { setBusy(true); setMsg(null); try { const j = await walletPost(body); setMsg({ tone: "good", text: typeof ok === "function" ? ok(j) : ok }); await load(); onChanged?.(); return j; } catch (e: any) { setMsg({ tone: "bad", text: e?.message || "That didn't work" }); return null; } finally { setBusy(false); } };

  if (err && !d) return <Note tone={/set up/i.test(err) ? "warn" : "bad"}>{err}</Note>;
  if (!d) return <div className="text-sm" style={{ color: C.MUTED }}>Loading the manager console...</div>;
  const bs: any[] = d.barbers;
  const requested = d.payouts.filter((p: any) => p.status === "requested"), approved = d.payouts.filter((p: any) => p.status === "approved"), exported = d.payouts.filter((p: any) => p.status === "exported");
  const totals = { bal: bs.reduce((a, b) => a + b.balance_cents, 0), pot: bs.reduce((a, b) => a + b.tax_pot_cents, 0), avail: bs.reduce((a, b) => a + Math.max(0, b.available_cents), 0) };
  const checklist: [boolean, string, Tab | null][] = [
    [d.ready, "Database tables created (run supabase/barbers-and-wallets.sql)", null],
    [d.encryption, "Encryption key set (WALLET_ENCRYPTION_KEY in .env.local and on Vercel)", null],
    [!!d.venue?.complete, "Business bank details for the bank file", "bank"],
    [bs.every((b) => b.configured), "Pay settings confirmed for every barber", "settings"],
    [bs.filter((b) => !/owner/i.test(b.role ?? "")).every((b) => b.bank?.verified), "Every barber's bank details verified", "overview"],
    [(teamStats?.visits ?? 0) > 0, "Client history imported from Fresha", "history"],
  ];
  const done = checklist.filter((c) => c[0]).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5 border flex flex-wrap items-center gap-6" style={{ background: "linear-gradient(135deg, #2A2108, #130C24)", borderColor: `${C.GOLD}55` }}>
        <div className="flex-1 min-w-[220px]"><div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.GOLD }}>Manager console</div><div className="text-xl font-bold mt-0.5">Pay the team, keep everyone's tax sorted</div><div className="text-xs mt-1" style={{ color: "#94A3B8" }}>Wallets hold what each barber has earned. You approve withdrawals and send them all at once with a bank file from your business account.</div></div>
        {[["Held in wallets", money(totals.bal, 0), "#fff"], ["Set aside for tax", money(totals.pot, 0), C.GOLD], ["Requests waiting", String(requested.length), requested.length ? C.GOLD : C.MUTED], ["Ready for bank file", String(approved.length), approved.length ? C.SKY : C.MUTED]].map(([l, v, c]) => <div key={l} className="text-center"><div className="text-2xl font-bold" style={{ color: c }}>{v}</div><div className="text-[10px] uppercase tracking-widest" style={{ color: C.MUTED }}>{l}</div></div>)}
      </div>

      <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: C.CARD2 }}>{TABS.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setMsg(null); }} className="px-3.5 py-2 rounded-lg text-xs font-semibold relative" style={tab === k ? { background: C.PUR_L, color: "#fff" } : { color: "#94A3B8" }}>{l}{k === "payouts" && requested.length > 0 && <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={{ background: C.GOLD, color: "#000" }}>{requested.length}</span>}</button>)}</div>
      {msg && <Note tone={msg.tone === "warn" ? "warn" : msg.tone}>{msg.text}</Note>}
      {!d.ready && <Note tone="warn">Wallet tables aren't in the database yet. Open Supabase &gt; SQL editor, paste <b>supabase/barbers-and-wallets.sql</b> and run it. Then refresh this page.</Note>}

      {tab === "overview" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
          <Box title="Barber wallets" right={<Btn kind="ghost" onClick={load}>Refresh</Btn>}>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: `1px solid ${C.BDR}` }}>{["Barber", "Pay", "Available", "Tax pot", "In progress", "Bank", ""].map((h) => <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: C.MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{bs.map((b) => <tr key={b.id} className="border-b" style={{ borderColor: "#1d1238" }}>
                <td className="px-2 py-2.5"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold" style={{ background: `linear-gradient(135deg, ${b.color_from}, ${b.color_to})` }}>{b.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div><div><div className="font-medium">{b.name}</div>{!b.configured && <div className="text-[10px]" style={{ color: C.GOLD }}>default settings</div>}</div></div></td>
                <td className="px-2 py-2.5 text-[11px] text-slate-400">{b.settings.pay_model === "commission" ? `${b.settings.service_pct}% / ${b.settings.product_pct}%` : b.settings.pay_model === "chair_rent" ? `Rent ${money(b.settings.chair_rent_weekly_cents, 0)}/wk` : "Owner"}<div className="text-[10px]" style={{ color: C.MUTED }}>{b.settings.employment}</div></td>
                <td className="px-2 py-2.5 font-semibold" style={{ color: b.available_cents > 0 ? C.GREEN : "#94A3B8" }}>{money(b.available_cents)}</td>
                <td className="px-2 py-2.5" style={{ color: C.GOLD }}>{money(b.tax_pot_cents)}</td>
                <td className="px-2 py-2.5 text-slate-400">{b.pending_cents ? money(b.pending_cents) : "–"}</td>
                <td className="px-2 py-2.5">{!b.bank ? <Pill label="None" color={C.MUTED} /> : b.bank.verified ? <Pill label={`✓ ...${b.bank.last4}`} color={C.GREEN} /> : <button disabled={busy} onClick={() => { if (confirm(`Have you confirmed ${b.name}'s new bank details (BSB ${b.bank.bsb_masked}, account ending ${b.bank.last4}) with them in person or by phone?`)) act({ action: "verify_bank", barber_id: b.id }, `${b.name}'s bank details are verified.`); }} className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: `${C.GOLD}22`, color: C.GOLD }}>Verify ...{b.bank.last4}</button>}</td>
                <td className="px-2 py-2.5 text-right">{b.available_cents > 0 && b.bank?.verified && <button disabled={busy} onClick={() => act({ action: "payout_create", barber_id: b.id, amount_cents: b.available_cents, by: "owner", note: "Owner payout" }, `${money(b.available_cents)} approved for ${b.name}. Create the bank file in Payouts.`)} className="text-[11px] font-semibold px-2.5 py-1 rounded" style={{ background: `${C.PUR_L}33`, color: C.PUR_LL }}>Pay out</button>}</td>
              </tr>)}</tbody></table></div>
            {totals.avail > 0 && <div className="flex items-center justify-between mt-4 rounded-lg p-3" style={{ background: C.CARD2 }}><div className="text-sm">Pay everyone their available balance: <b>{money(totals.avail)}</b></div><Btn disabled={busy} onClick={() => act({ action: "pay_all" }, (j) => { const ok = j.results.filter((r: any) => r.ok); const no = j.results.filter((r: any) => !r.ok); return `${ok.length} payout${ok.length === 1 ? "" : "s"} approved${no.length ? `. Skipped: ${no.map((r: any) => `${r.name} (${r.message})`).join(", ")}` : ""}. Create the bank file in Payouts.`; })}>Approve all</Btn></div>}
          </Box>
          <div className="space-y-5">
            <Box title="Set-up checklist" sub={`${done} of ${checklist.length} done`}>
              <div className="h-1.5 rounded-full mb-3" style={{ background: C.CARD2 }}><div className="h-full rounded-full" style={{ width: `${(done / checklist.length) * 100}%`, background: `linear-gradient(90deg, ${C.PUR_L}, ${C.GOLD})` }} /></div>
              <div className="space-y-2">{checklist.map(([ok, t, go]) => <div key={t} className="flex gap-2 text-xs items-start"><span style={{ color: ok ? C.GREEN : C.MUTED }}>{ok ? "✓" : "○"}</span><span className={`flex-1 ${ok ? "text-slate-400" : "text-slate-200"}`}>{t}</span>{!ok && go && <button onClick={() => setTab(go)} className="underline text-[11px]" style={{ color: C.PUR_LL }}>Open</button>}</div>)}</div>
            </Box>
            <Box title="Recent pay runs">{d.payruns.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>None yet. <button className="underline" style={{ color: C.PUR_LL }} onClick={() => setTab("payrun")}>Run the first one</button></div> : <div className="space-y-2">{d.payruns.slice(0, 5).map((r: any) => <div key={r.id} className="flex justify-between text-sm"><span className="text-slate-300">{dshort(r.period_start)} to {dshort(r.period_end)}</span><span className="font-semibold">{money(r.totals?.earning_cents ?? 0, 0)}</span></div>)}</div>}</Box>
          </div>
        </div>
      )}

      {tab === "payrun" && <PayRun barbers={bs} busy={busy} setBusy={setBusy} onPosted={() => { load(); onChanged?.(); }} setMsg={setMsg} payruns={d.payruns} />}

      {tab === "payouts" && (
        <div className="space-y-5">
          <Box title="Withdrawal requests" sub="Barbers ask, you approve. Declining puts the money straight back in their wallet.">
            {requested.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>No requests waiting.</div> : <div className="space-y-2">{requested.map((p: any) => <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={{ background: C.CARD2 }}>
              <div className="flex-1 min-w-[160px]"><div className="text-sm font-semibold">{p.barber_name} · {money(p.amount_cents)}{p.from_tax_pot && <span className="text-[10px] ml-2" style={{ color: C.GOLD }}>from tax pot</span>}</div><div className="text-[11px]" style={{ color: C.MUTED }}>{dshort(p.created_at)}{p.note ? ` · ${p.note}` : ""}</div></div>
              <Btn disabled={busy} onClick={() => act({ action: "payout_approve", id: p.id }, `Approved. It'll go in the next bank file.`)}>Approve</Btn><Btn kind="danger" disabled={busy} onClick={() => act({ action: "payout_cancel", id: p.id }, "Declined. The money is back in their wallet.")}>Decline</Btn></div>)}</div>}
          </Box>
          <Box title="Ready to send" sub="One file pays everyone. Upload it in your business banking (it's called a 'payment file', 'ABA file' or 'direct entry file').">
            {approved.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>Nothing approved yet.</div> : <>
              <div className="space-y-1.5">{approved.map((p: any) => { const b = bs.find((x) => x.id === String(p.barber_id)); return <div key={p.id} className="flex items-center gap-3 text-sm py-1.5 border-b" style={{ borderColor: "#1d1238" }}><div className="flex-1">{p.barber_name}</div><div>{!b?.bank ? <Pill label="No bank details" color={C.RED} /> : !b.bank.verified ? <Pill label="Bank not verified" color={C.GOLD} /> : <span className="text-[11px]" style={{ color: C.MUTED }}>BSB {b.bank.bsb_masked} ...{b.bank.last4}</span>}</div><div className="w-24 text-right font-semibold">{money(p.amount_cents)}</div><button disabled={busy} onClick={() => act({ action: "payout_cancel", id: p.id }, "Cancelled. Money returned to the wallet.")} className="text-[11px] underline" style={{ color: C.MUTED }}>Cancel</button></div>; })}</div>
              {!d.venue?.complete && <div className="mt-3"><Note tone="warn">Add your business bank details first. <button className="underline" onClick={() => setTab("bank")}>Business bank</button></Note></div>}
              <div className="flex items-center justify-between mt-4"><div className="text-sm">Total <b>{money(approved.reduce((a: number, p: any) => a + Number(p.amount_cents), 0))}</b></div>
                <Btn kind="gold" disabled={busy || !d.venue?.complete} onClick={async () => { const j = await act({ action: "export" }, (j) => `Bank file created: ${j.count} payment${j.count === 1 ? "" : "s"}, ${money(j.total_cents)}.${j.skipped?.length ? ` Not included: ${j.skipped.join("; ")}.` : ""} Upload it to your bank, then mark them paid below once the money has gone.`); if (j?.content) download(j.file_name, j.content); }}>Create bank file</Btn></div>
            </>}
          </Box>
          <Box title="Sent to the bank" sub="Once your bank shows the payments went through, mark them paid. If the bank bounces one, mark it failed and the money returns to that wallet.">
            {exported.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>Nothing waiting on the bank.</div> : <>
              <div className="space-y-1.5">{exported.map((p: any) => <div key={p.id} className="flex items-center gap-3 text-sm py-1.5 border-b" style={{ borderColor: "#1d1238" }}><div className="flex-1">{p.barber_name}<span className="text-[11px] ml-2" style={{ color: C.MUTED }}>{dshort(p.updated_at)}</span></div><div className="w-24 text-right font-semibold">{money(p.amount_cents)}</div><button disabled={busy} onClick={() => { if (confirm(`Mark ${p.barber_name}'s ${money(p.amount_cents)} as failed and return it to their wallet?`)) act({ action: "payout_fail", id: p.id }, "Marked failed. The money is back in their wallet."); }} className="text-[11px] underline" style={{ color: C.RED }}>Bank rejected it</button></div>)}</div>
              <Btn className="mt-4" disabled={busy} onClick={() => act({ action: "payout_mark_paid", ids: exported.map((p: any) => p.id) }, (j) => `${j.updated} marked as paid.`)}>Mark all {exported.length} as paid</Btn>
            </>}
          </Box>
          <Box title="Bank files">{d.batches.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>None yet.</div> : <div className="space-y-1.5">{d.batches.map((bt: any) => <div key={bt.id} className="flex items-center gap-3 text-sm py-1.5 border-b" style={{ borderColor: "#1d1238" }}><div className="flex-1">{bt.file_name}<span className="text-[11px] ml-2" style={{ color: C.MUTED }}>{dshort(bt.created_at)} · {bt.count} payments</span></div><div className="font-semibold">{money(bt.total_cents)}</div><button disabled={busy} onClick={async () => { if (!confirm("Only download this again if the first upload failed. Uploading the same file twice pays everyone twice. Continue?")) return; const j = await act({ action: "redownload", batch_id: bt.id }, "Downloaded again."); if (j?.content) download(j.file_name, j.content); }} className="text-[11px] underline" style={{ color: C.MUTED }}>Download again</button></div>)}</div>}</Box>
          <Box title="All withdrawals">{d.payouts.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>None yet.</div> : <div className="max-h-[320px] overflow-y-auto space-y-1">{d.payouts.map((p: any) => <div key={p.id} className="flex items-center gap-3 text-xs py-1.5 border-b" style={{ borderColor: "#1d1238" }}><span className="w-24" style={{ color: C.MUTED }}>{dshort(p.created_at)}</span><span className="flex-1">{p.barber_name}</span><Pill label={STATUS[p.status]?.label ?? p.status} color={STATUS[p.status]?.color ?? C.MUTED} /><span className="w-24 text-right font-semibold">{money(p.amount_cents)}</span></div>)}</div>}</Box>
        </div>
      )}

      {tab === "settings" && <PaySettings barbers={bs} busy={busy} act={act} />}
      {tab === "history" && <VisitImport stats={teamStats} onDone={() => { onChanged?.(); }} />}
      {tab === "bank" && <BusinessBank venue={d.venue} encryption={d.encryption} busy={busy} act={act} />}
      {tab === "ai" && <Box title="Wallet AI" sub="Answers from your real wallet numbers. Figures it works out itself are flagged."><WalletAsk prompts={["Who's owed money right now?", "How much should each barber put aside for tax?", "Summarise the last pay run", "Is anyone close to the GST threshold?", "What do I need to finish before paying everyone?"]} /></Box>}
      {tab === "audit" && <Box title="Audit log" sub="Every pay run, withdrawal, bank change and setting change. It can't be edited.">{d.audit.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>Nothing yet.</div> : <div className="space-y-1 max-h-[520px] overflow-y-auto">{d.audit.map((a: any) => <div key={a.id} className="flex gap-3 text-xs py-2 border-b" style={{ borderColor: "#1d1238" }}><span className="w-32 flex-shrink-0" style={{ color: C.MUTED }}>{new Date(a.created_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span><span className="w-40 flex-shrink-0 font-semibold">{String(a.action).replace(/_/g, " ")}</span><span className="flex-1 text-slate-400">{a.barber_name ? `${a.barber_name}. ` : ""}{describe(a.detail)}</span></div>)}</div>}</Box>}
    </div>
  );
}

function describe(d: any): string {
  if (!d) return ""; const parts: string[] = [];
  if (d.amount_cents != null) parts.push(money(Number(d.amount_cents)));
  if (d.totals?.earning_cents != null) parts.push(`${money(Number(d.totals.earning_cents))} to wallets`);
  if (d.start) parts.push(`${d.start} to ${d.end}`);
  if (d.count != null) parts.push(`${d.count} items`);
  if (d.total_cents != null) parts.push(money(Number(d.total_cents)));
  if (d.bsb) parts.push(`BSB ${d.bsb}`); if (d.account_last4) parts.push(`acct ...${d.account_last4}`);
  if (d.memo) parts.push(`"${d.memo}"`); if (d.pay_model) parts.push(`${d.pay_model}, ${d.service_pct}% services`);
  if (d.skipped?.length) parts.push(`skipped: ${d.skipped.join("; ")}`);
  return parts.join(" · ");
}

function PayRun({ barbers, busy, setBusy, onPosted, setMsg, payruns }: { barbers: any[]; busy: boolean; setBusy: (b: boolean) => void; onPosted: () => void; setMsg: (m: any) => void; payruns: any[] }) {
  const ps = useMemo(presets, []);
  const [start, setStart] = useState(ps[1].start); const [end, setEnd] = useState(ps[1].end);
  const [lines, setLines] = useState<Record<string, { services: string; products: string; tips: string }>>({});
  const [include, setInclude] = useState<Set<string>>(new Set(barbers.filter((b) => b.settings.pay_model !== "owner").map((b) => b.id)));
  const [csvNote, setCsvNote] = useState<string>(""); const [preview, setPreview] = useState<any>(null); const [confirmPost, setConfirmPost] = useState(false);
  const setL = (id: string, k: "services" | "products" | "tips", v: string) => { setPreview(null); setLines((x) => ({ ...x, [id]: { ...(x[id] ?? { services: "", products: "", tips: "" }), [k]: v.replace(/[^\d.]/g, "") } })); };

  function loadCsv(f: File) {
    const r = new FileReader();
    r.onload = () => {
      const rows = parseCsv(String(r.result ?? "")); if (rows.length < 2) { setCsvNote("That file looks empty."); return; }
      const h = rows[0].map((x) => norm(x)); const col = (n: string) => h.indexOf(n);
      const iName = col("team member"), iS = col("services"), iA = col("service add ons"), iP = col("products"), iT = col("tips");
      if (iName < 0 || iS < 0) { setCsvNote("This doesn't look like Fresha's Performance summary. It needs 'Team member' and 'Services' columns."); return; }
      const byName = new Map<string, any>(); barbers.forEach((b) => { byName.set(norm(b.name), b); });
      const next: typeof lines = {}; const matched: string[] = [], unmatched: string[] = [];
      for (const row of rows.slice(1)) {
        const name = row[iName]?.trim(); if (!name) continue; const b = byName.get(norm(name)) ?? barbers.find((x) => norm(x.name).split(" ")[0] === norm(name).split(" ")[0] && barbers.filter((y) => norm(y.name).split(" ")[0] === norm(name).split(" ")[0]).length === 1);
        if (!b) { unmatched.push(name); continue; }
        const svc = parseMoney(row[iS]) + (iA >= 0 ? parseMoney(row[iA]) : 0);
        next[b.id] = { services: svc.toFixed(2), products: iP >= 0 ? parseMoney(row[iP]).toFixed(2) : "0", tips: iT >= 0 ? parseMoney(row[iT]).toFixed(2) : "0" }; matched.push(b.name);
      }
      setLines(next); setPreview(null);
      setCsvNote(`Filled in ${matched.length} barber${matched.length === 1 ? "" : "s"}.${unmatched.length ? ` Not in Rydra (ignored): ${unmatched.join(", ")}.` : ""} Make sure the report covers exactly ${start} to ${end}.`);
    };
    r.readAsText(f);
  }
  const payload = () => barbers.filter((b) => include.has(b.id)).map((b) => ({ barber_id: b.id, services: Number(lines[b.id]?.services || 0), products: Number(lines[b.id]?.products || 0), tips: Number(lines[b.id]?.tips || 0) }));
  async function run(post: boolean) {
    setBusy(true); setMsg(null);
    try { const j = await walletPost({ action: post ? "payrun_post" : "payrun_preview", start, end, lines: payload(), source: csvNote ? "fresha_performance_csv" : "manual" });
      if (post) { setMsg({ tone: "good", text: `Pay run posted: ${money(j.totals.earning_cents)} added to wallets, ${money(j.totals.reserve_cents)} of it set aside for tax.` }); setPreview(null); setLines({}); setCsvNote(""); setConfirmPost(false); onPosted(); }
      else setPreview(j);
    } catch (e: any) { setMsg({ tone: "bad", text: e?.message || "That didn't work" }); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <Box title="1. Pay period">
        <div className="flex flex-wrap items-end gap-3">
          {ps.map((p) => <button key={p.label} onClick={() => { setStart(p.start); setEnd(p.end); setPreview(null); }} className="px-3 py-2 rounded-lg text-xs font-semibold" style={start === p.start && end === p.end ? { background: C.PUR_L } : { background: C.CARD2, color: "#94A3B8" }}>{p.label}</button>)}
          <Field label="From"><input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPreview(null); }} className={inputCls} style={inputStyle} /></Field>
          <Field label="To"><input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPreview(null); }} className={inputCls} style={inputStyle} /></Field>
        </div>
        {payruns.length > 0 && <div className="text-[11px] mt-2" style={{ color: C.MUTED }}>Last posted: {payruns[0].period_start} to {payruns[0].period_end}. Periods can't overlap.</div>}
      </Box>
      <Box title="2. Takings for the period" sub="Fastest: in Fresha go to Reports > Performance summary, set the same dates, Export > CSV, and drop it here.">
        <label className="block rounded-xl border-2 border-dashed p-4 text-center cursor-pointer hover:border-[#7C3AED] mb-3" style={{ borderColor: C.BDR }}><input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && loadCsv(e.target.files[0])} /><div className="text-sm font-semibold">Drop Fresha Performance summary CSV</div><div className="text-[11px]" style={{ color: C.MUTED }}>or type the amounts below</div></label>
        {csvNote && <div className="mb-3"><Note>{csvNote}</Note></div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["", "Barber", "Pay model", "Services $", "Products $", "Tips $"].map((h) => <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: C.MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{barbers.map((b) => { const on = include.has(b.id); return <tr key={b.id} className="border-t" style={{ borderColor: "#1d1238", opacity: on ? 1 : 0.45 }}>
            <td className="px-2 py-2"><input type="checkbox" checked={on} onChange={() => { setPreview(null); setInclude((s) => { const n = new Set(s); on ? n.delete(b.id) : n.add(b.id); return n; }); }} style={{ accentColor: C.PUR_L }} /></td>
            <td className="px-2 py-2 font-medium">{b.name}</td><td className="px-2 py-2 text-[11px] text-slate-400">{b.settings.pay_model === "commission" ? `${b.settings.service_pct}% / ${b.settings.product_pct}% / ${b.settings.tips_pct}%` : b.settings.pay_model.replace("_", " ")}</td>
            {(["services", "products", "tips"] as const).map((k) => <td key={k} className="px-2 py-2"><input disabled={!on} value={lines[b.id]?.[k] ?? ""} onChange={(e) => setL(b.id, k, e.target.value)} inputMode="decimal" placeholder="0" className="w-28 rounded-md px-2 py-1.5 text-sm outline-none text-white" style={inputStyle} /></td>)}</tr>; })}</tbody></table></div>
        <Btn className="mt-4" disabled={busy || include.size === 0} onClick={() => run(false)}>{busy ? "Calculating..." : "3. Calculate pay"}</Btn>
      </Box>
      {preview && (
        <Box tone="accent" title="Pay run preview" sub={`${start} to ${end}. Nothing is paid until you post it.`}>
          {preview.warnings.map((w: string) => <div key={w} className="mb-2"><Note tone="warn">{w}</Note></div>)}
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ borderBottom: `1px solid ${C.BDR}` }}>{["Barber", "Takings", "Their share", "GST", "To wallet", "Set aside for tax", "Shop keeps"].map((h) => <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: C.MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{preview.lines.map((l: any) => <tr key={l.barber_id} className="border-b align-top" style={{ borderColor: "#1d1238" }}>
              <td className="px-2 py-2.5 font-medium">{l.name}{l.notes.map((n: string) => <div key={n} className="text-[10px] font-normal mt-0.5" style={{ color: C.MUTED }}>{n}</div>)}</td>
              <td className="px-2 py-2.5 text-slate-300">{money(l.takings.services_cents + l.takings.products_cents + l.takings.tips_cents)}</td>
              <td className="px-2 py-2.5 text-slate-300">{money(l.earning_ex_gst_cents)}<div className="text-[10px]" style={{ color: C.MUTED }}>svc {money(l.service_share_cents, 0)} · prod {money(l.product_share_cents, 0)} · tips {money(l.tips_share_cents, 0)}{l.rent_cents ? ` · rent -${money(l.rent_cents, 0)}` : ""}</div></td>
              <td className="px-2 py-2.5 text-slate-400">{l.gst_cents ? money(l.gst_cents) : "–"}</td>
              <td className="px-2 py-2.5 font-bold" style={{ color: l.earning_cents >= 0 ? C.GREEN : C.RED }}>{money(l.earning_cents)}</td>
              <td className="px-2 py-2.5" style={{ color: C.GOLD }}>{money(l.reserve_cents)}<div className="text-[10px]" style={{ color: C.MUTED }}>{l.reserve_pct}%{l.gst_cents ? " + GST" : ""}</div></td>
              <td className="px-2 py-2.5 text-slate-300">{money(l.shop_keeps_cents)}</td></tr>)}</tbody>
            <tfoot><tr className="font-bold"><td className="px-2 py-3">Total</td><td className="px-2 py-3">{money(preview.totals.takings_cents)}</td><td /><td className="px-2 py-3">{preview.totals.gst_cents ? money(preview.totals.gst_cents) : "–"}</td><td className="px-2 py-3" style={{ color: C.GREEN }}>{money(preview.totals.earning_cents)}</td><td className="px-2 py-3" style={{ color: C.GOLD }}>{money(preview.totals.reserve_cents)}</td><td className="px-2 py-3">{money(preview.totals.shop_keeps_cents)}</td></tr></tfoot></table></div>
          {!confirmPost ? <Btn kind="gold" className="mt-4" disabled={!preview.can_post || busy} onClick={() => setConfirmPost(true)}>Post pay run</Btn> : (
            <div className="mt-4 rounded-lg p-4" style={{ background: "#2A2108", border: `1px solid ${C.GOLD}55` }}>
              <div className="text-sm" style={{ color: C.GOLD }}>This adds {money(preview.totals.earning_cents)} to the barbers' wallets for {start} to {end}. A period can only be posted once. Corrections are made with adjustments, so check the numbers.</div>
              <div className="flex gap-2 mt-3"><Btn kind="gold" disabled={busy} onClick={() => run(true)}>{busy ? "Posting..." : "Yes, post it"}</Btn><Btn kind="ghost" onClick={() => setConfirmPost(false)}>Go back</Btn></div>
            </div>)}
        </Box>
      )}
    </div>
  );
}

function PaySettings({ barbers, busy, act }: { barbers: any[]; busy: boolean; act: (b: any, ok: string) => Promise<any> }) {
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [adj, setAdj] = useState<Record<string, { amount: string; memo: string }>>({});
  const row = (b: any) => edit[b.id] ?? { employment: b.settings.employment, pay_model: b.settings.pay_model, service_pct: b.settings.service_pct, product_pct: b.settings.product_pct, tips_pct: b.settings.tips_pct, chair_rent_weekly: b.settings.chair_rent_weekly_cents / 100, gst_registered: b.settings.gst_registered, abn: b.settings.abn ?? "", tax_reserve_pct: b.settings.tax_reserve_pct_override ?? "", expenses_annual: b.settings.expenses_annual_cents / 100 };
  const set = (b: any, k: string, v: any) => setEdit((e) => ({ ...e, [b.id]: { ...row(b), [k]: v } }));
  return (
    <div className="space-y-4">
      <Note>Contractors get paid into their wallet and look after their own tax, so the wallet puts a share aside for them. Employees are paid through payroll (PAYG and super), so the wallet doesn't hold tax for them. Whether someone is really a contractor depends on how they work, not just what's written down. Check with your accountant.</Note>
      {barbers.map((b) => { const r = row(b); const a = adj[b.id] ?? { amount: "", memo: "" }; return (
        <Box key={b.id} title={b.name} right={!b.configured ? <Pill label="Default settings, not saved yet" color={C.GOLD} /> : <Pill label="Saved" color={C.GREEN} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Field label="Engagement"><select value={r.employment} onChange={(e) => set(b, "employment", e.target.value)} className={inputCls} style={inputStyle}><option value="contractor">Contractor (ABN)</option><option value="employee">Employee</option></select></Field>
            <Field label="Pay model"><select value={r.pay_model} onChange={(e) => set(b, "pay_model", e.target.value)} className={inputCls} style={inputStyle}><option value="commission">Commission</option><option value="chair_rent">Chair rent</option><option value="owner">Owner (no commission)</option></select></Field>
            {r.pay_model === "commission" && <><Field label="% of services"><input type="number" min={0} max={100} value={r.service_pct} onChange={(e) => set(b, "service_pct", e.target.value)} className={inputCls} style={inputStyle} /></Field>
              <Field label="% of products"><input type="number" min={0} max={100} value={r.product_pct} onChange={(e) => set(b, "product_pct", e.target.value)} className={inputCls} style={inputStyle} /></Field>
              <Field label="% of tips"><input type="number" min={0} max={100} value={r.tips_pct} onChange={(e) => set(b, "tips_pct", e.target.value)} className={inputCls} style={inputStyle} /></Field></>}
            {r.pay_model === "chair_rent" && <Field label="Chair rent per week $"><input type="number" min={0} value={r.chair_rent_weekly} onChange={(e) => set(b, "chair_rent_weekly", e.target.value)} className={inputCls} style={inputStyle} /></Field>}
            <Field label="Tax set-aside %" hint={`Blank = automatic (${b.tax.suggestedReservePct}%)`}><input type="number" min={0} max={60} value={r.tax_reserve_pct} onChange={(e) => set(b, "tax_reserve_pct", e.target.value)} placeholder={String(b.tax.suggestedReservePct)} className={inputCls} style={inputStyle} /></Field>
            <Field label="ABN"><input value={r.abn} onChange={(e) => set(b, "abn", e.target.value)} placeholder="11 digits" className={inputCls} style={inputStyle} /></Field>
            <Field label="Yearly work expenses $"><input type="number" min={0} value={r.expenses_annual} onChange={(e) => set(b, "expenses_annual", e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <label className="flex items-center gap-2 text-xs mt-5" style={{ color: "#94A3B8" }}><input type="checkbox" checked={!!r.gst_registered} onChange={(e) => set(b, "gst_registered", e.target.checked)} style={{ accentColor: C.GOLD }} />GST registered</label>
          </div>
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <Btn disabled={busy} onClick={() => act({ action: "save_barber", barber_id: b.id, ...r, tax_reserve_pct: r.tax_reserve_pct === "" ? null : r.tax_reserve_pct }, `${b.name}'s pay settings saved.`).then((j) => j && setEdit((e) => { const n = { ...e }; delete n[b.id]; return n; }))}>Save settings</Btn>
            <div className="flex-1" />
            <Field label="Adjustment (bonus, correction). Negative to deduct."><div className="flex gap-2"><input value={a.amount} onChange={(e) => setAdj((x) => ({ ...x, [b.id]: { ...a, amount: e.target.value.replace(/[^\d.-]/g, "") } }))} placeholder="$" className="w-24 rounded-lg px-3 py-2 text-sm outline-none text-white" style={inputStyle} /><input value={a.memo} onChange={(e) => setAdj((x) => ({ ...x, [b.id]: { ...a, memo: e.target.value } }))} placeholder="Reason" className="w-48 rounded-lg px-3 py-2 text-sm outline-none text-white" style={inputStyle} />
              <Btn kind="ghost" disabled={busy || !Number(a.amount) || !a.memo.trim()} onClick={() => act({ action: "adjust", barber_id: b.id, amount_cents: Math.round(Number(a.amount) * 100), memo: a.memo }, `Adjustment recorded for ${b.name}.`).then((j) => j && setAdj((x) => ({ ...x, [b.id]: { amount: "", memo: "" } })))}>Apply</Btn></div></Field>
          </div>
        </Box>); })}
    </div>
  );
}

function BusinessBank({ venue, encryption, busy, act }: { venue: any; encryption: boolean; busy: boolean; act: (b: any, ok: string) => Promise<any> }) {
  const [f, setF] = useState({ remitter_name: venue?.remitter_name ?? "Alkami Barbershop", bank_abbrev: venue?.bank_abbrev ?? "", apca_user_id: venue?.apca_user_id ?? "", bsb: "", account: "", description: venue?.description ?? "BARBER PAY", balance_record: !!venue?.balance_record });
  return (
    <Box title="Business bank account" sub="The account the barbers are paid from. Used only to build the bank file. Numbers are encrypted.">
      {!encryption && <div className="mb-3"><Note tone="warn">WALLET_ENCRYPTION_KEY isn't loaded. It's been added to .env.local: restart the dev server (Ctrl+C, then npm run dev).</Note></div>}
      {venue?.bsb_masked && <div className="mb-3 text-sm">Current: <b>{venue.remitter_name}</b> · {venue.bank_abbrev} · BSB {venue.bsb_masked} · account ending {venue.account_last4} · user ID {venue.apca_user_id}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Name on statements (max 26)"><input value={f.remitter_name} maxLength={26} onChange={(e) => setF({ ...f, remitter_name: e.target.value })} className={inputCls} style={inputStyle} /></Field>
        <Field label="Your bank"><select value={f.bank_abbrev} onChange={(e) => setF({ ...f, bank_abbrev: e.target.value })} className={inputCls} style={inputStyle}><option value="">Choose...</option>{[["CBA", "Commonwealth Bank"], ["NAB", "NAB"], ["WBC", "Westpac"], ["ANZ", "ANZ"], ["STG", "St.George"], ["BOM", "Bank of Melbourne"], ["BSA", "BankSA"], ["BQL", "Bank of Queensland"], ["BEN", "Bendigo Bank"], ["MBL", "Macquarie"], ["SUN", "Suncorp"], ["HSB", "HSBC"]].map(([v, l]) => <option key={v} value={v}>{l} ({v})</option>)}</select></Field>
        <Field label="Direct Entry user ID (APCA)" hint="Your bank gives you this when you turn on batch/payment-file payments."><input value={f.apca_user_id} onChange={(e) => setF({ ...f, apca_user_id: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={inputCls} style={inputStyle} /></Field>
        <Field label={`BSB${venue?.bsb_masked ? " (leave blank to keep)" : ""}`}><input value={f.bsb} onChange={(e) => setF({ ...f, bsb: e.target.value })} placeholder="062-000" autoComplete="off" className={inputCls} style={inputStyle} /></Field>
        <Field label={`Account number${venue?.account_last4 ? " (leave blank to keep)" : ""}`}><input value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} autoComplete="off" className={inputCls} style={inputStyle} /></Field>
        <Field label="Description (max 12)"><input value={f.description} maxLength={12} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} style={inputStyle} /></Field>
      </div>
      <label className="flex items-center gap-2 text-xs mt-3" style={{ color: "#94A3B8" }}><input type="checkbox" checked={f.balance_record} onChange={(e) => setF({ ...f, balance_record: e.target.checked })} style={{ accentColor: C.GOLD }} />My bank wants a self-balancing file (adds a matching debit line; most banks don't need it)</label>
      <Btn className="mt-4" disabled={busy || !encryption} onClick={() => act({ action: "save_venue", ...f }, "Business bank details saved.").then((j) => j && setF((x) => ({ ...x, bsb: "", account: "" })))}>Save</Btn>
      <div className="mt-4"><Note>How paying works: approve withdrawals, press <b>Create bank file</b>, then upload the .aba file in your business internet banking (CommBiz: Payments &gt; Import file; NAB Connect: Payments &gt; Import; Westpac Live: Payments &gt; Import payment file). Your bank pays everyone at once. Come back and mark them paid.</Note></div>
    </Box>
  );
}
