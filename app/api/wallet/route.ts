import { NextRequest, NextResponse } from "next/server";
import { guard, env, db } from "@/lib/campaigns/server";
import { loadWallets, walletError, audit, decryptBank } from "@/lib/wallet/server";
import { encrypt, decrypt, encryptionReady } from "@/lib/wallet/crypto";
import { bsbProblem, accountProblem, cleanBsb, cleanAcct, maskBsb, last4, abaText, buildAba } from "@/lib/wallet/bank";
import { computeLine, toCents, type PayLine } from "@/lib/wallet/payrun";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const money = (v: any, max = 10_000_000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

// GET            -> owner overview (all barbers)
// GET ?barber=ID -> one barber's wallet, ledger and withdrawals
export async function GET(req: NextRequest) {
  const g = guard(req, 120); if (g) return g;
  const e = env(); if (!e) return fail("Server misconfigured.", 503);
  const s = db();
  try {
    const state = await loadWallets(s, e.venueId);
    const bid = req.nextUrl.searchParams.get("barber");
    if (bid) {
      const me = state.barbers.find((b) => b.id === bid || b.slug === bid);
      if (!me) return fail("Barber not found.", 404);
      const { data: ledger } = await s.from("wallet_ledger").select("id, kind, amount_cents, tax_pot_cents, memo, period_start, period_end, created_at").eq("venue_id", e.venueId).eq("barber_id", me.id).order("created_at", { ascending: false }).limit(60);
      return NextResponse.json({ ready: state.ready, encryption: state.encryption, fy: state.fy, barber: me, ledger: ledger ?? [], payouts: state.payouts.filter((p) => String(p.barber_id) === me.id).slice(0, 40) });
    }
    return NextResponse.json(state);
  } catch (err) { const w = walletError(err); return fail(w.message, w.status); }
}

export async function POST(req: NextRequest) {
  const g = guard(req, 60); if (g) return g;
  const e = env(); if (!e) return fail("Server misconfigured.", 503);
  let b: any; try { b = await req.json(); } catch { return fail("Invalid request."); }
  const s = db(); const venue = e.venueId; const a = String(b?.action ?? "");
  const barberOk = async (id: any) => { if (!UUID.test(String(id))) return false; const { data } = await s.from("barbers").select("id").eq("id", id).eq("venue_id", venue).maybeSingle(); return !!data; };

  try {
    // ── Settings ─────────────────────────────────────────────────────────────
    if (a === "save_barber") {
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const pctOk = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };
      const row: any = {
        barber_id: b.barber_id, venue_id: venue, updated_at: new Date().toISOString(),
        employment: b.employment === "employee" ? "employee" : "contractor",
        pay_model: ["commission", "chair_rent", "owner"].includes(b.pay_model) ? b.pay_model : "commission",
        service_pct: pctOk(b.service_pct), product_pct: pctOk(b.product_pct), tips_pct: pctOk(b.tips_pct),
        chair_rent_weekly_cents: toCents(money(b.chair_rent_weekly, 100000) ?? NaN), gst_registered: !!b.gst_registered,
        abn: b.abn ? String(b.abn).replace(/\s/g, "") : null,
        tax_reserve_pct: b.tax_reserve_pct === null || b.tax_reserve_pct === "" || b.tax_reserve_pct === undefined ? null : pctOk(b.tax_reserve_pct),
        expenses_annual_cents: toCents(money(b.expenses_annual, 1_000_000) ?? 0),
      };
      if ([row.service_pct, row.product_pct, row.tips_pct].some((x) => x === null) || !Number.isFinite(row.chair_rent_weekly_cents)) return fail("Check the percentages (0 to 100) and chair rent.");
      if (row.tax_reserve_pct !== null && row.tax_reserve_pct > 60) return fail("Tax set-aside can't be more than 60%.");
      if (row.abn && !/^\d{11}$/.test(row.abn)) return fail("An ABN is 11 digits.");
      const { error } = await s.from("barber_wallets").upsert(row, { onConflict: "barber_id" }); if (error) throw error;
      await audit(s, venue, "pay_settings_changed", { employment: row.employment, pay_model: row.pay_model, service_pct: row.service_pct, product_pct: row.product_pct, tips_pct: row.tips_pct, gst: row.gst_registered, reserve: row.tax_reserve_pct }, b.barber_id);
      return NextResponse.json({ ok: true });
    }

    if (a === "save_bank") {
      if (!encryptionReady()) return fail("Bank details can't be saved until WALLET_ENCRYPTION_KEY is set on the server.", 503);
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const name = abaText(String(b.account_name ?? "")).slice(0, 32);
      if (name.length < 2) return fail("Enter the account name as the bank has it.");
      const bp = bsbProblem(b.bsb); if (bp) return fail(bp); const ap = accountProblem(b.account); if (ap) return fail(ap);
      const bsb = cleanBsb(b.bsb), acct = cleanAcct(b.account);
      const { data: existing } = await s.from("barber_wallets").select("barber_id").eq("barber_id", b.barber_id).maybeSingle();
      const patch = { bank_account_name: name, bank_bsb_enc: encrypt(bsb), bank_account_enc: encrypt(acct), bank_bsb_masked: maskBsb(bsb), bank_last4: last4(acct), bank_verified: false, bank_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { error } = existing ? await s.from("barber_wallets").update(patch).eq("barber_id", b.barber_id) : await s.from("barber_wallets").insert({ barber_id: b.barber_id, venue_id: venue, ...patch });
      if (error) throw error;
      await audit(s, venue, "bank_details_changed", { bsb: maskBsb(bsb), account_last4: last4(acct), note: "Needs verifying before payments go to it." }, b.barber_id);
      return NextResponse.json({ ok: true });
    }

    if (a === "verify_bank") {
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const { data, error } = await s.from("barber_wallets").update({ bank_verified: true, updated_at: new Date().toISOString() }).eq("barber_id", b.barber_id).not("bank_bsb_enc", "is", null).select("barber_id");
      if (error) throw error; if (!data?.length) return fail("There are no bank details to verify.");
      await audit(s, venue, "bank_details_verified", {}, b.barber_id);
      return NextResponse.json({ ok: true });
    }

    if (a === "save_venue") {
      if (!encryptionReady()) return fail("Set WALLET_ENCRYPTION_KEY on the server first.", 503);
      const remitter = abaText(String(b.remitter_name ?? "")).slice(0, 26), abbrev = String(b.bank_abbrev ?? "").toUpperCase().trim(), apca = String(b.apca_user_id ?? "").trim();
      const desc = abaText(String(b.description ?? "BARBER PAY")).slice(0, 12) || "BARBER PAY";
      if (remitter.length < 2) return fail("Enter the business name for bank statements.");
      if (!/^[A-Z]{3}$/.test(abbrev)) return fail("Bank code is 3 letters, e.g. CBA, NAB, WBC or ANZ.");
      if (!/^\d{1,6}$/.test(apca)) return fail("The Direct Entry (APCA) user ID is up to 6 digits. Your bank gives you this.");
      const row: any = { venue_id: venue, remitter_name: remitter, bank_abbrev: abbrev, apca_user_id: apca, description: desc, balance_record: !!b.balance_record, updated_at: new Date().toISOString() };
      if (b.bsb || b.account) {
        const bp = bsbProblem(b.bsb); if (bp) return fail(`Business account: ${bp}`); const ap = accountProblem(b.account); if (ap) return fail(`Business account: ${ap}`);
        Object.assign(row, { bsb_enc: encrypt(cleanBsb(b.bsb)), account_enc: encrypt(cleanAcct(b.account)), bsb_masked: maskBsb(b.bsb), account_last4: last4(b.account) });
      }
      const { error } = await s.from("wallet_venue_settings").upsert(row, { onConflict: "venue_id" }); if (error) throw error;
      await audit(s, venue, "business_bank_settings_changed", { bank: abbrev, bsb: row.bsb_masked ?? "(unchanged)", account_last4: row.account_last4 ?? "(unchanged)" });
      return NextResponse.json({ ok: true });
    }

    // ── Pay runs (amounts are always recalculated here; the browser's numbers are never trusted) ──
    if (a === "payrun_preview" || a === "payrun_post") {
      if (!isDate(b.start) || !isDate(b.end) || b.start > b.end) return fail("Choose a valid pay period.");
      if (b.end > today()) return fail("The pay period can't end in the future.");
      const days = (Date.parse(b.end) - Date.parse(b.start)) / 864e5 + 1; if (days > 93) return fail("A pay run can cover at most about 3 months.");
      const inLines = Array.isArray(b.lines) ? b.lines.slice(0, 50) : []; if (!inLines.length) return fail("Add at least one barber's takings.");
      const state = await loadWallets(s, venue); if (!state.ready) return fail("Wallets aren't set up yet. Run supabase/barbers-and-wallets.sql.", 503);
      const seen = new Set<string>(); const lines: PayLine[] = []; const warnings: string[] = [];
      for (const l of inLines) {
        const me = state.barbers.find((x) => x.id === l.barber_id); if (!me) return fail("One of the barbers isn't part of this shop.");
        if (seen.has(me.id)) return fail(`${me.name} appears twice.`); seen.add(me.id);
        const sv = money(l.services), pr = money(l.products), tp = money(l.tips); if (sv === null || pr === null || tp === null) return fail(`${me.name}: amounts must be between $0 and $10,000,000.`);
        if (!me.configured) warnings.push(`${me.name} is using default pay settings (50% services, 10% products, 100% tips). Check them before posting.`);
        lines.push(computeLine({ id: me.id, name: me.name }, me.settings, { services_cents: toCents(sv), products_cents: toCents(pr), tips_cents: toCents(tp) }, { start: b.start, end: b.end }));
      }
      const totals = lines.reduce((t, l) => ({ takings_cents: t.takings_cents + l.takings.services_cents + l.takings.products_cents + l.takings.tips_cents, earning_cents: t.earning_cents + l.earning_cents, reserve_cents: t.reserve_cents + l.reserve_cents, gst_cents: t.gst_cents + l.gst_cents, shop_keeps_cents: t.shop_keeps_cents + l.shop_keeps_cents }), { takings_cents: 0, earning_cents: 0, reserve_cents: 0, gst_cents: 0, shop_keeps_cents: 0 });
      const overlap = state.payruns.find((r) => !(r.period_end < b.start || r.period_start > b.end));
      if (overlap) warnings.unshift(`This overlaps the pay run for ${overlap.period_start} to ${overlap.period_end}, so it can't be posted.`);
      if (a === "payrun_preview") return NextResponse.json({ lines, totals, warnings, can_post: !overlap });
      if (overlap) return fail(warnings[0], 409);
      const { data, error } = await s.rpc("wallet_post_payrun", { p_venue: venue, p_start: b.start, p_end: b.end, p_lines: lines.map((l) => ({ ...l, memo: `Pay ${b.start} to ${b.end}` })), p_totals: totals, p_source: String(b.source ?? "manual").slice(0, 40), p_actor: "owner" });
      if (error) throw error;
      return NextResponse.json({ ok: true, payrun_id: data, totals });
    }

    // ── Money movement (all through the tested SQL functions) ───────────────
    if (a === "payout_create") {
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const amt = Math.round(Number(b.amount_cents)); if (!Number.isInteger(amt) || amt <= 0 || amt > 100_000_000) return fail("Enter an amount greater than zero.");
      const by = b.by === "barber" ? "barber" : "owner";
      const { data, error } = await s.rpc("wallet_create_payout", { p_venue: venue, p_barber: b.barber_id, p_amount: amt, p_from_tax_pot: !!b.from_tax_pot, p_by: by, p_note: b.note ? String(b.note).slice(0, 140) : null });
      if (error) throw error; return NextResponse.json({ ok: true, payout_id: data });
    }
    if (a === "payout_approve") { if (!UUID.test(String(b.id))) return fail("Invalid."); const { error } = await s.rpc("wallet_approve_payout", { p_venue: venue, p_payout: b.id, p_actor: "owner" }); if (error) throw error; return NextResponse.json({ ok: true }); }
    if (a === "payout_cancel" || a === "payout_fail") { if (!UUID.test(String(b.id))) return fail("Invalid."); const { error } = await s.rpc("wallet_reverse_payout", { p_venue: venue, p_payout: b.id, p_status: a === "payout_fail" ? "failed" : "cancelled", p_actor: "owner" }); if (error) throw error; return NextResponse.json({ ok: true }); }
    if (a === "payout_mark_paid") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: any) => UUID.test(String(x))).slice(0, 200); if (!ids.length) return fail("Nothing selected.");
      const { data, error } = await s.from("wallet_payouts").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", ids).eq("venue_id", venue).eq("status", "exported").select("id");
      if (error) throw error; await audit(s, venue, "payouts_marked_paid", { count: data?.length ?? 0, ids: (data ?? []).map((x: any) => x.id) });
      return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
    }
    if (a === "pay_all") {
      const state = await loadWallets(s, venue);
      const only = Array.isArray(b.barber_ids) ? new Set(b.barber_ids.map(String)) : null;
      const results: { name: string; ok: boolean; message: string; amount_cents?: number }[] = [];
      for (const me of state.barbers) {
        if (only && !only.has(me.id)) continue;
        if (me.available_cents <= 0) continue;
        if (!me.bank?.verified) { results.push({ name: me.name, ok: false, message: me.bank ? "Bank details not verified yet" : "No bank details" }); continue; }
        const { error } = await s.rpc("wallet_create_payout", { p_venue: venue, p_barber: me.id, p_amount: me.available_cents, p_from_tax_pot: false, p_by: "owner", p_note: "Pay out available balance" });
        results.push(error ? { name: me.name, ok: false, message: walletError(error).message } : { name: me.name, ok: true, message: "Ready to export", amount_cents: me.available_cents });
      }
      return NextResponse.json({ ok: true, results });
    }
    if (a === "move_pot") {
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const d = Math.round(Number(b.delta_cents)); if (!Number.isInteger(d) || d === 0) return fail("Enter an amount.");
      const { error } = await s.rpc("wallet_move_pot", { p_venue: venue, p_barber: b.barber_id, p_delta: d, p_actor: "owner" }); if (error) throw error; return NextResponse.json({ ok: true });
    }
    if (a === "adjust") {
      if (!(await barberOk(b.barber_id))) return fail("Barber not found.", 404);
      const amt = Math.round(Number(b.amount_cents)); if (!Number.isInteger(amt) || amt === 0 || Math.abs(amt) > 10_000_000) return fail("Enter an amount (negative to deduct).");
      const { error } = await s.rpc("wallet_adjust", { p_venue: venue, p_barber: b.barber_id, p_amount: amt, p_memo: String(b.memo ?? "").slice(0, 140), p_actor: "owner" }); if (error) throw error; return NextResponse.json({ ok: true });
    }

    // ── Bank file (ABA) ───────────────────────────────────────────────────────
    if (a === "export") {
      if (!encryptionReady()) return fail("WALLET_ENCRYPTION_KEY isn't set on the server.", 503);
      const { data: v } = await s.from("wallet_venue_settings").select("*").eq("venue_id", venue).maybeSingle();
      if (!v?.bsb_enc || !v?.account_enc || !v?.apca_user_id || !v?.bank_abbrev || !v?.remitter_name) return fail("Add the business bank details (Settings tab) before creating a bank file.");
      let q = s.from("wallet_payouts").select("*").eq("venue_id", venue).eq("status", "approved");
      const ids = Array.isArray(b.ids) ? b.ids.filter((x: any) => UUID.test(String(x))) : null; if (ids?.length) q = q.in("id", ids);
      const { data: approved, error: pe } = await q; if (pe) throw pe;
      if (!approved?.length) return fail("There are no approved withdrawals to send.");
      const { data: wallets } = await s.from("barber_wallets").select("*").in("barber_id", approved.map((p: any) => p.barber_id));
      const wBy = new Map((wallets ?? []).map((w: any) => [String(w.barber_id), w]));
      const { data: names } = await s.from("barbers").select("id, name").eq("venue_id", venue); const nBy = new Map((names ?? []).map((x: any) => [String(x.id), x.name]));
      const skipped: string[] = []; const payable: { p: any; bank: { bsb: string; account: string; name: string } }[] = [];
      for (const p of approved) {
        const w = wBy.get(String(p.barber_id)); const who = nBy.get(String(p.barber_id)) ?? "A barber";
        if (!w?.bank_bsb_enc) { skipped.push(`${who}: no bank details`); continue; }
        if (!w.bank_verified) { skipped.push(`${who}: bank details not verified`); continue; }
        try { payable.push({ p, bank: decryptBank(w) }); } catch { skipped.push(`${who}: bank details couldn't be read (was the encryption key changed?)`); }
      }
      if (!payable.length) return fail(`Nothing can be sent yet. ${skipped.join("; ")}`);
      const header = { bankAbbrev: v.bank_abbrev, remitterName: v.remitter_name, apcaUserId: v.apca_user_id, description: v.description || "BARBER PAY", processDate: new Date(), traceBsb: decrypt(v.bsb_enc), traceAccount: decrypt(v.account_enc), balance: !!v.balance_record };
      const toPayments = (rows: typeof payable) => rows.map(({ p, bank }) => ({ bsb: bank.bsb, account: bank.account, accountName: bank.name, amountCents: Number(p.amount_cents), reference: abaText(`${v.remitter_name}`).slice(0, 12) + " PAY" }));
      buildAba(header, toPayments(payable)); // validate everything before changing any status
      const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Australia/Sydney" }).replace(/[-: ]/g, "").slice(0, 12);
      const fileName = `alkami-pay-${stamp}.aba`;
      const { data: batch, error: be } = await s.from("wallet_batches").insert({ venue_id: venue, file_name: fileName, total_cents: 0, count: 0 }).select("id").single(); if (be) throw be;
      const { data: moved, error: me } = await s.from("wallet_payouts").update({ status: "exported", batch_id: batch.id, updated_at: new Date().toISOString() }).in("id", payable.map((x) => x.p.id)).eq("status", "approved").select("id");
      if (me) { await s.from("wallet_batches").delete().eq("id", batch.id); throw me; }
      const movedIds = new Set((moved ?? []).map((x: any) => x.id));
      const final = payable.filter((x) => movedIds.has(x.p.id));
      if (!final.length) { await s.from("wallet_batches").delete().eq("id", batch.id); return fail("Those withdrawals changed while the file was being made. Refresh and try again.", 409); }
      const aba = buildAba(header, toPayments(final));
      await s.from("wallet_batches").update({ total_cents: aba.totalCents, count: aba.count }).eq("id", batch.id);
      await audit(s, venue, "bank_file_created", { batch_id: batch.id, file_name: fileName, count: aba.count, total_cents: aba.totalCents, skipped });
      return NextResponse.json({ ok: true, file_name: fileName, content: aba.text, total_cents: aba.totalCents, count: aba.count, skipped });
    }
    if (a === "redownload") {
      if (!UUID.test(String(b.batch_id))) return fail("Invalid.");
      const { data: v } = await s.from("wallet_venue_settings").select("*").eq("venue_id", venue).maybeSingle(); if (!v?.bsb_enc) return fail("Business bank details are missing.");
      const { data: batch } = await s.from("wallet_batches").select("*").eq("id", b.batch_id).eq("venue_id", venue).maybeSingle(); if (!batch) return fail("Batch not found.", 404);
      const { data: ps } = await s.from("wallet_payouts").select("*").eq("batch_id", b.batch_id).in("status", ["exported", "paid"]); if (!ps?.length) return fail("Nothing left in that batch.");
      const { data: wallets } = await s.from("barber_wallets").select("*").in("barber_id", ps.map((p: any) => p.barber_id)); const wBy = new Map((wallets ?? []).map((w: any) => [String(w.barber_id), w]));
      const aba = buildAba({ bankAbbrev: v.bank_abbrev, remitterName: v.remitter_name, apcaUserId: v.apca_user_id, description: v.description || "BARBER PAY", processDate: new Date(batch.created_at), traceBsb: decrypt(v.bsb_enc), traceAccount: decrypt(v.account_enc), balance: !!v.balance_record },
        ps.map((p: any) => { const bk = decryptBank(wBy.get(String(p.barber_id))); return { bsb: bk.bsb, account: bk.account, accountName: bk.name, amountCents: Number(p.amount_cents), reference: abaText(`${v.remitter_name}`).slice(0, 12) + " PAY" }; }));
      await audit(s, venue, "bank_file_downloaded_again", { batch_id: b.batch_id });
      return NextResponse.json({ ok: true, file_name: batch.file_name, content: aba.text, total_cents: aba.totalCents, count: aba.count, warning: "Only upload this if the first upload failed, or everyone gets paid twice." });
    }

    return fail("Unknown action.");
  } catch (err) {
    const w = walletError(err); if (w.status === 500) console.error("[wallet]", a, err);
    return fail(w.message, w.status);
  }
}
