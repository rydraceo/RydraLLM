"use client";
// One barber's wallet: what they've earned, what's set aside for tax, withdrawals, bank details and a tax calculator.
import { useCallback, useEffect, useMemo, useState } from "react";
import { aiFetch } from "@/lib/ai/client";
import { estimate, GST, SUPER_GUARANTEE } from "@/lib/wallet/tax";
import { Box, Btn, C, Field, Note, Pill, STATUS, WalletAsk, dollars, dshort, inputCls, inputStyle, money, walletPost } from "@/app/components/wallet/ui";

const KIND: Record<string, string> = { earning: "Pay run", adjustment: "Adjustment", payout: "Withdrawal", payout_reversal: "Returned", tax_reserve: "Tax pot" };

export default function BarberWallet({ barberId, barberName }: { barberId: string; barberName: string }) {
  const first = barberName.split(" ")[0];
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(""); const [fromPot, setFromPot] = useState(false);
  const [potMove, setPotMove] = useState("");
  const [bankOpen, setBankOpen] = useState(false); const [bank, setBank] = useState({ account_name: "", bsb: "", account: "" });
  const [calc, setCalc] = useState<{ income: number; expenses: number; gst: boolean } | null>(null);

  const load = useCallback(async () => {
    try { const r = await aiFetch(`/api/wallet?barber=${barberId}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); setErr(""); }
    catch (e: any) { setErr(e?.message || "Couldn't load the wallet"); }
  }, [barberId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (d?.barber && !calc) setCalc({ income: Math.round(d.barber.tax.annualIncome || 60000), expenses: Math.round((d.barber.settings.expenses_annual_cents || 0) / 100), gst: !!d.barber.settings.gst_registered }); }, [d, calc]);

  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setMsg(null); try { await fn(); setMsg({ tone: "good", text: ok }); await load(); } catch (e: any) { setMsg({ tone: "bad", text: e?.message || "That didn't work" }); } setBusy(false); };
  const est = useMemo(() => (calc && d?.barber ? estimate(calc.income, { expenses: calc.expenses, gstRegistered: calc.gst, employment: d.barber.settings.employment }) : null), [calc, d]);

  if (err) return <Note tone={/set up/i.test(err) ? "warn" : "bad"}>{err}</Note>;
  if (!d) return <div className="text-sm" style={{ color: C.MUTED }}>Loading wallet...</div>;
  if (!d.ready) return <Note tone="warn">Wallets aren't set up yet. Run <b>supabase/barbers-and-wallets.sql</b> in the Supabase SQL editor, then refresh.</Note>;
  const b = d.barber; const s = b.settings;
  const bal = b.balance_cents, pot = b.tax_pot_cents, avail = b.available_cents;
  const amtCents = Math.round(Number(amount) * 100); const maxCents = fromPot ? Math.min(pot, bal) : avail;
  const amtProblem = !amount ? "" : !Number.isFinite(amtCents) || amtCents <= 0 ? "Enter an amount" : amtCents > maxCents ? `Only ${money(maxCents)} available${fromPot ? " in the tax pot" : ""}` : "";
  const potPct = bal > 0 ? Math.min(100, (pot / bal) * 100) : 0;

  return (
    <div className="space-y-5">
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
        <Box tone="accent" title={`${first}'s wallet`} sub={`Financial year ${d.fy.label}`} right={<button onClick={load} className="text-[11px] underline" style={{ color: C.MUTED }}>Refresh</button>}>
          <div className="flex flex-wrap items-end gap-8">
            <div><div className="text-[11px]" style={{ color: C.MUTED }}>Available to withdraw</div><div className="text-4xl font-bold tracking-tight" style={{ color: avail > 0 ? C.GREEN : "#fff" }}>{money(avail)}</div></div>
            <div><div className="text-[11px]" style={{ color: C.MUTED }}>Set aside for tax</div><div className="text-2xl font-bold" style={{ color: C.GOLD }}>{money(pot)}</div></div>
            <div><div className="text-[11px]" style={{ color: C.MUTED }}>Total balance</div><div className="text-2xl font-bold">{money(bal)}</div></div>
            <div><div className="text-[11px]" style={{ color: C.MUTED }}>Earned this year</div><div className="text-2xl font-bold">{money(b.ytd_earned_cents, 0)}</div></div>
          </div>
          <div className="mt-4 h-3 rounded-full overflow-hidden flex" style={{ background: C.CARD2 }}><div style={{ width: `${100 - potPct}%`, background: C.GREEN }} /><div style={{ width: `${potPct}%`, background: C.GOLD }} /></div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: C.MUTED }}><span>Spendable</span><span>Tax pot ({s.employment === "employee" ? "not needed: employee" : `${b.reserve_pct}% of each pay`})</span></div>
          {b.pending_cents > 0 && <div className="mt-3"><Note>{money(b.pending_cents)} in withdrawals on the way.</Note></div>}
        </Box>

        <Box title="Withdraw" sub="Goes into the next bank file once approved">
          {!b.bank ? <Note tone="warn">Add bank details below before withdrawing.</Note> : !b.bank.verified ? <Note tone="warn">New bank details need confirming by the owner before money is sent. You can still request now.</Note> : null}
          <div className="flex gap-2 mt-3"><div className="relative flex-1"><span className="absolute left-3 top-2 text-sm" style={{ color: C.MUTED }}>$</span><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" className={inputCls + " pl-6"} style={inputStyle} /></div>
            <Btn kind="ghost" onClick={() => setAmount(((fromPot ? Math.min(pot, bal) : avail) / 100).toFixed(2))} disabled={maxCents <= 0}>Max</Btn></div>
          <label className="flex items-center gap-2 text-xs mt-2" style={{ color: "#94A3B8" }}><input type="checkbox" checked={fromPot} onChange={(e) => setFromPot(e.target.checked)} style={{ accentColor: C.GOLD }} />Take it from the tax pot (e.g. to pay the ATO)</label>
          {amtProblem && <div className="text-[11px] mt-1" style={{ color: C.RED }}>{amtProblem}</div>}
          <Btn className="w-full mt-3 py-2.5" disabled={busy || !amount || !!amtProblem} onClick={() => run(() => walletPost({ action: "payout_create", barber_id: b.id, amount_cents: amtCents, from_tax_pot: fromPot, by: "barber" }).then(() => setAmount("")), "Withdrawal requested. The owner approves it and it goes out in the next bank file.")}>Request {amount && !amtProblem ? money(amtCents) : "withdrawal"}</Btn>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: C.BDR }}>
            <div className="text-[11px] mb-1.5" style={{ color: C.MUTED }}>Move money in or out of the tax pot</div>
            <div className="flex gap-2"><input value={potMove} onChange={(e) => setPotMove(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Amount" className={inputCls} style={inputStyle} />
              <Btn kind="ghost" disabled={busy || !Number(potMove)} onClick={() => run(() => walletPost({ action: "move_pot", barber_id: b.id, delta_cents: Math.round(Number(potMove) * 100) }).then(() => setPotMove("")), "Moved into the tax pot.")}>Put aside</Btn>
              <Btn kind="ghost" disabled={busy || !Number(potMove)} onClick={() => run(() => walletPost({ action: "move_pot", barber_id: b.id, delta_cents: -Math.round(Number(potMove) * 100) }).then(() => setPotMove("")), "Released from the tax pot.")}>Release</Btn></div>
          </div>
        </Box>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Box title="Tax calculator" sub={b.tax.basis === "wallet" ? "Pre-filled from this year's pay, annualised" : b.tax.basis === "stats" ? `Pre-filled from Fresha stats (${b.tax.stats_period ?? "imported period"}) x ${s.service_pct}% commission` : "Enter an expected yearly income"}>
          {s.employment === "employee" ? <Note>{first} is set up as an employee, so tax (PAYG) and super are handled through payroll. Nothing needs to be put aside here.</Note> : calc && est && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expected income this year"><input type="number" min={0} value={calc.income} onChange={(e) => setCalc({ ...calc, income: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} style={inputStyle} /></Field>
                <Field label="Work expenses (tools, products, phone)"><input type="number" min={0} value={calc.expenses} onChange={(e) => setCalc({ ...calc, expenses: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} style={inputStyle} /></Field>
              </div>
              <input type="range" min={0} max={250000} step={1000} value={Math.min(calc.income, 250000)} onChange={(e) => setCalc({ ...calc, income: Number(e.target.value) })} className="w-full mt-3" style={{ accentColor: C.PUR_L }} />
              <label className="flex items-center gap-2 text-xs mt-1" style={{ color: "#94A3B8" }}><input type="checkbox" checked={calc.gst} onChange={(e) => setCalc({ ...calc, gst: e.target.checked })} style={{ accentColor: C.GOLD }} />Registered for GST</label>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                {[["Income tax", dollars(est.incomeTax)], ["Medicare levy", dollars(est.medicare)], ["Total for the year", dollars(est.totalTax)]].map(([l, v]) => <div key={l} className="rounded-lg py-2.5" style={{ background: C.CARD2 }}><div className="text-[10px]" style={{ color: C.MUTED }}>{l}</div><div className="text-lg font-bold">{v}</div></div>)}
              </div>
              <div className="rounded-lg p-4 mt-3 text-center" style={{ background: "#2A2108" }}>
                <div className="text-[11px]" style={{ color: C.GOLD }}>Put aside from every pay</div>
                <div className="text-3xl font-bold" style={{ color: C.GOLD }}>{est.suggestedReservePct}%</div>
                <div className="text-[11px] text-slate-400">{dollars(est.suggestedReservePct * 10)} of every $1,000{calc.gst ? `, plus all the GST (${GST * 100}% on top of commission)` : ""}. Effective rate {(est.effectiveRate * 100).toFixed(1)}%, top rate {(est.marginalRate * 100).toFixed(0)}% (incl. Medicare).</div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Btn kind="gold" disabled={busy || est.suggestedReservePct === b.reserve_pct} onClick={() => run(() => walletPost({ action: "save_barber", barber_id: b.id, employment: s.employment, pay_model: s.pay_model, service_pct: s.service_pct, product_pct: s.product_pct, tips_pct: s.tips_pct, chair_rent_weekly: s.chair_rent_weekly_cents / 100, gst_registered: calc.gst, abn: s.abn, tax_reserve_pct: est.suggestedReservePct, expenses_annual: calc.expenses }), `Future pays will put ${est.suggestedReservePct}% aside.`)}>Use {est.suggestedReservePct}% for future pays</Btn>
                {s.tax_reserve_pct_override != null && <Btn kind="ghost" disabled={busy} onClick={() => run(() => walletPost({ action: "save_barber", barber_id: b.id, employment: s.employment, pay_model: s.pay_model, service_pct: s.service_pct, product_pct: s.product_pct, tips_pct: s.tips_pct, chair_rent_weekly: s.chair_rent_weekly_cents / 100, gst_registered: s.gst_registered, abn: s.abn, tax_reserve_pct: null, expenses_annual: s.expenses_annual_cents / 100 }), "Back to the automatic suggestion.")}>Use automatic</Btn>}
              </div>
              <div className="space-y-2 mt-3">
                {est.gstThresholdWarning && !calc.gst && <Note tone="warn">At this income {first} is likely over the $75,000 GST threshold and may need to register for GST.</Note>}
                {s.employment === "contractor" && <Note>Contractors paid mainly for their labour can still be owed super ({SUPER_GUARANTEE * 100}%) by the shop. Worth confirming with an accountant.</Note>}
                <div className="text-[10px]" style={{ color: C.MUTED }}>{est.note} Rates for {est.fy}.</div>
              </div>
            </>
          )}
        </Box>

        <div className="space-y-5">
          <Box title="Bank details" right={b.bank ? <Pill label={b.bank.verified ? "Verified" : "Waiting for owner to verify"} color={b.bank.verified ? C.GREEN : C.GOLD} /> : null}>
            {b.bank ? <div className="text-sm"><div className="font-semibold">{b.bank.account_name}</div><div style={{ color: C.MUTED }}>BSB {b.bank.bsb_masked} · Account ending {b.bank.last4}</div><div className="text-[10px] mt-1" style={{ color: C.MUTED }}>Updated {dshort(b.bank.updated_at)}. Full numbers are encrypted and never shown.</div></div> : <div className="text-sm" style={{ color: C.MUTED }}>No bank account yet.</div>}
            {!d.encryption ? <div className="mt-3"><Note tone="warn">Bank details can't be saved until WALLET_ENCRYPTION_KEY is set and the server restarted.</Note></div> : !bankOpen ? <Btn kind="ghost" className="mt-3" onClick={() => setBankOpen(true)}>{b.bank ? "Change bank details" : "Add bank details"}</Btn> : (
              <div className="mt-3 space-y-2.5">
                <Note tone="warn">For safety, new details stay paused until the owner confirms them with {first} in person. That stops anyone redirecting pay with a fake request.</Note>
                <Field label="Account name"><input value={bank.account_name} onChange={(e) => setBank({ ...bank, account_name: e.target.value })} maxLength={32} className={inputCls} style={inputStyle} autoComplete="off" /></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="BSB"><input value={bank.bsb} onChange={(e) => setBank({ ...bank, bsb: e.target.value })} placeholder="062-000" maxLength={7} className={inputCls} style={inputStyle} autoComplete="off" /></Field>
                  <Field label="Account number"><input value={bank.account} onChange={(e) => setBank({ ...bank, account: e.target.value })} maxLength={12} className={inputCls} style={inputStyle} autoComplete="off" /></Field></div>
                <div className="flex gap-2"><Btn disabled={busy} onClick={() => run(() => walletPost({ action: "save_bank", barber_id: b.id, ...bank }).then(() => { setBankOpen(false); setBank({ account_name: "", bsb: "", account: "" }); }), "Bank details saved. The owner needs to verify them before payments go out.")}>Save securely</Btn><Btn kind="ghost" onClick={() => setBankOpen(false)}>Cancel</Btn></div>
              </div>
            )}
          </Box>
          <Box title="Ask about my pay">
            <WalletAsk barberId={b.id} prompts={[`How much should ${first} put aside for tax?`, "Explain my last pay", "Am I close to the GST threshold?"]} />
          </Box>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Box title="Withdrawals">
          {d.payouts.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>No withdrawals yet.</div> : <div className="space-y-2">{d.payouts.map((p: any) => <div key={p.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: C.CARD2 }}>
            <div className="flex-1"><div className="text-sm font-semibold">{money(p.amount_cents)}{p.from_tax_pot && <span className="text-[10px] ml-2" style={{ color: C.GOLD }}>from tax pot</span>}</div><div className="text-[10px]" style={{ color: C.MUTED }}>{dshort(p.created_at)}{p.note ? ` · ${p.note}` : ""}</div></div>
            <Pill label={STATUS[p.status]?.label ?? p.status} color={STATUS[p.status]?.color ?? C.MUTED} />
            {p.status === "requested" && <button disabled={busy} onClick={() => run(() => walletPost({ action: "payout_cancel", id: p.id }), "Withdrawal cancelled. The money is back in the wallet.")} className="text-[11px] underline" style={{ color: C.MUTED }}>Cancel</button>}</div>)}</div>}
        </Box>
        <Box title="Wallet history">
          {d.ledger.length === 0 ? <div className="text-sm" style={{ color: C.MUTED }}>Nothing yet. Money arrives here when the owner posts a pay run.</div> : <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">{d.ledger.map((l: any) => <div key={l.id} className="flex items-center gap-3 py-2 border-b text-sm" style={{ borderColor: "#1d1238" }}>
            <div className="w-24 text-[11px]" style={{ color: C.MUTED }}>{dshort(l.created_at)}</div>
            <div className="flex-1"><div>{KIND[l.kind] ?? l.kind}</div><div className="text-[10px]" style={{ color: C.MUTED }}>{l.memo}</div></div>
            <div className="text-right">{Number(l.amount_cents) !== 0 && <div className="font-semibold" style={{ color: Number(l.amount_cents) > 0 ? C.GREEN : "#fff" }}>{Number(l.amount_cents) > 0 ? "+" : ""}{money(Number(l.amount_cents))}</div>}{Number(l.tax_pot_cents) !== 0 && <div className="text-[10px]" style={{ color: C.GOLD }}>tax pot {Number(l.tax_pot_cents) > 0 ? "+" : ""}{money(Number(l.tax_pot_cents))}</div>}</div></div>)}</div>}
        </Box>
      </div>
    </div>
  );
}
