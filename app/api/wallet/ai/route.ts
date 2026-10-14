import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
import { guard, env, db, asciiOnly } from "@/lib/campaigns/server";
import { loadWallets, walletError } from "@/lib/wallet/server";
import { GST, SUPER_GUARANTEE, MEDICARE } from "@/lib/wallet/tax";

export const runtime = "nodejs";
export const maxDuration = 60;

const $ = (c: number) => `$${(c / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const $d = (d: number) => `$${Math.round(d).toLocaleString("en-AU")}`;
const dollars = (t: string) => (t.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/[$,\s]/g, "")));

// POST { question, barber_id? } -> an answer that only uses figures computed by the wallet engine.
export async function POST(req: NextRequest) {
  const g = guard(req, 30); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const q = asciiOnly(String(b?.question ?? "")).slice(0, 500); if (q.length < 3) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  try {
    const st = await loadWallets(db(), e.venueId);
    const focus = b?.barber_id ? st.barbers.filter((x) => x.id === b.barber_id) : st.barbers;
    const lines: string[] = [`Financial year ${st.fy.label} (${st.fy.start} to ${st.fy.end}). Day ${st.fy.daysElapsed} of ${st.fy.daysIn}.`, `Rates used: resident income tax brackets for ${st.fy.label}, Medicare levy ${MEDICARE * 100}%, GST ${GST * 100}%, super guarantee ${SUPER_GUARANTEE * 100}%.`];
    for (const x of focus) {
      const s = x.settings, t = x.tax;
      lines.push(`\n## ${x.name}${/owner/i.test(x.role ?? "") ? " (owner)" : ""}`,
        `Engagement: ${s.employment}. Pay model: ${s.pay_model}${s.pay_model === "commission" ? ` (${s.service_pct}% of services, ${s.product_pct}% of products, ${s.tips_pct}% of tips)` : s.pay_model === "chair_rent" ? ` (chair rent ${$(s.chair_rent_weekly_cents)} a week)` : ""}. GST registered: ${s.gst_registered ? "yes" : "no"}.${x.configured ? "" : " (Default settings, not confirmed yet.)"}`,
        `Wallet: balance ${$(x.balance_cents)}, tax pot ${$(x.tax_pot_cents)}, available to withdraw ${$(x.available_cents)}, withdrawals in progress ${$(x.pending_cents)}. Earned through the wallet this financial year: ${$(x.ytd_earned_cents)}.`,
        `Bank details: ${x.bank ? `${x.bank.verified ? "verified" : "NOT verified"}, BSB ${x.bank.bsb_masked}, account ending ${x.bank.last4}` : "none on file"}.`);
      if (t.annualIncome > 0) lines.push(`Tax estimate (basis: ${t.basis === "wallet" ? "this year's wallet earnings, annualised" : `Fresha stats${t.stats_period ? ` for ${t.stats_period}` : ""} x their service commission`}): yearly income about ${$d(t.annualIncome)}, expenses ${$d(t.expenses)}, taxable ${$d(t.taxable)}, income tax ${$d(t.incomeTax)}, Medicare ${$d(t.medicare)}, total ${$d(t.totalTax)}, effective rate ${(t.effectiveRate * 100).toFixed(1)}%, marginal rate ${(t.marginalRate * 100).toFixed(0)}%. Set-aside rate in use: ${x.reserve_pct}% (${s.tax_reserve_pct_override != null ? "set by the owner" : "suggested"}). For every $1,000 earned, put aside ${$d(10 * x.reserve_pct)}.${t.gstThresholdWarning ? " Their estimated income is over the $75,000 GST registration threshold." : ""}`);
      else lines.push("Tax estimate: not enough income data yet.");
    }
    const last = st.payruns[0];
    if (last) lines.push(`\nLast pay run: ${last.period_start} to ${last.period_end}. Total paid to wallets ${$(last.totals?.earning_cents ?? 0)}, put aside for tax ${$(last.totals?.reserve_cents ?? 0)}, shop kept ${$(last.totals?.shop_keeps_cents ?? 0)}.`);
    const waiting = st.payouts.filter((p) => p.status === "requested"); if (waiting.length) lines.push(`Withdrawal requests waiting for approval: ${waiting.map((p) => `${p.barber_name} ${$(p.amount_cents)}`).join(", ")}.`);
    const approved = st.payouts.filter((p) => p.status === "approved"); if (approved.length) lines.push(`Approved and ready for the bank file: ${approved.length}, total ${$(approved.reduce((a, p) => a + Number(p.amount_cents), 0))}.`);
    lines.push(`Business bank file details: ${st.venue?.complete ? "complete" : "not complete"}.`);
    const facts = lines.join("\n");

    const system = `You are the Rydra wallet assistant for Alkami Barbershop in Canberra, Australia. You help the owner pay barbers and help barbers understand their earnings and tax set-aside.
Rules:
- Use ONLY the figures in the FACTS. Never invent amounts, rates or dates. If something isn't in the facts, say you don't have it.
- You may do simple arithmetic on the facts, but show the working in one line.
- You are not an accountant or financial adviser. For anything about obligations (super for contractors, sham contracting, BAS, deductions), explain plainly and suggest checking with their accountant or the ATO. Keep that to one sentence.
- Never ask for or repeat bank account numbers.
- Plain Australian English, short paragraphs or bullets, under 150 words. Finish your last sentence.`;
    const allowed = dollars(facts);
    const okNum = (n: number) => allowed.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.005));
    let answer = await ask({ system, user: `FACTS\n${facts}\n\nQUESTION\n${q}`, maxTokens: 1000 });
    if (!answer) return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 503 });
    let bad = dollars(answer).filter((n) => !okNum(n));
    if (bad.length) {
      const retry = await ask({ system, user: `FACTS\n${facts}\n\nQUESTION\n${q}\n\nYour previous answer used dollar amounts that are not in the facts (${bad.map((n) => "$" + n).join(", ")}). Write a fresh answer using only amounts from the facts, or show the exact working for any arithmetic. Do not mention or apologise for any earlier answer.`, maxTokens: 1000 });
      if (retry) { answer = retry; bad = dollars(answer).filter((n) => !okNum(n)); }
    }
    return NextResponse.json({ answer: answer.trim(), checked: bad.length === 0, derived_amounts: bad.length });
  } catch (err) { const w = walletError(err); return NextResponse.json({ error: w.message }, { status: w.status }); }
}
