import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptionReady, decrypt } from "@/lib/wallet/crypto";
import { estimate, fyOf, type TaxEstimate } from "@/lib/wallet/tax";
import type { PaySettings } from "@/lib/wallet/payrun";

export const DEFAULT_SETTINGS = { employment: "contractor", pay_model: "commission", service_pct: 50, product_pct: 10, tips_pct: 100, chair_rent_weekly_cents: 0, gst_registered: false, abn: null, tax_reserve_pct: null, expenses_annual_cents: 0 } as const;

/** Friendly text for the exceptions the wallet SQL functions raise. */
export function walletError(e: any): { status: number; message: string } {
  const m = String(e?.message ?? e ?? "");
  const map: Record<string, string> = {
    INSUFFICIENT_FUNDS: "Not enough available in the wallet for that (money set aside for tax isn't included).",
    PERIOD_ALREADY_POSTED: "A pay run for exactly this period has already been posted. Use an adjustment to correct it.",
    PERIOD_OVERLAPS: "This period overlaps a pay run that's already posted. Pick dates that don't overlap.",
    UNKNOWN_BARBER: "One of the barbers isn't part of this shop.", INVALID_AMOUNT: "Enter an amount greater than zero.",
    NOT_APPROVABLE: "That withdrawal isn't waiting for approval any more.", NOT_CANCELLABLE: "That withdrawal has already gone to the bank, so it can't be cancelled. If the bank rejected it, mark it as failed.",
    NOT_FAILABLE: "Only payments that were sent to the bank can be marked as failed.", NOT_FOUND: "That withdrawal wasn't found.",
    INVALID_POT_MOVE: "The tax pot can't go below zero or above the balance.", MEMO_REQUIRED: "Add a short reason for the adjustment.", INVALID_STATUS: "Invalid status.",
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return { status: 409, message: map[k] };
  if (/does not exist|schema cache|Could not find the (table|function)/i.test(m)) return { status: 503, message: "Wallets aren't set up yet. Run supabase/barbers-and-wallets.sql in the Supabase SQL editor." };
  return { status: 500, message: "Something went wrong. Nothing was changed." };
}

export async function audit(s: SupabaseClient, venue: string, action: string, detail: Record<string, unknown>, barber?: string | null) {
  await s.from("wallet_audit").insert({ venue_id: venue, barber_id: barber ?? null, actor: "owner", action, detail });
}

export function settingsFor(row: any): PaySettings & { abn: string | null; expenses_annual_cents: number; tax_reserve_pct_override: number | null } {
  const r = { ...DEFAULT_SETTINGS, ...(row ?? {}) };
  return {
    employment: r.employment === "employee" ? "employee" : "contractor", pay_model: ["commission", "chair_rent", "owner"].includes(r.pay_model) ? r.pay_model : "commission",
    service_pct: Number(r.service_pct), product_pct: Number(r.product_pct), tips_pct: Number(r.tips_pct), chair_rent_weekly_cents: Number(r.chair_rent_weekly_cents) || 0,
    gst_registered: !!r.gst_registered, reserve_pct: r.tax_reserve_pct == null ? -1 : Number(r.tax_reserve_pct), abn: r.abn ?? null, expenses_annual_cents: Number(r.expenses_annual_cents) || 0,
    tax_reserve_pct_override: r.tax_reserve_pct == null ? null : Number(r.tax_reserve_pct),
  };
}

export type WalletState = Awaited<ReturnType<typeof loadWallets>>;

/** Everything the owner console and each barber's wallet card needs. Bank numbers are never decrypted here. */
export async function loadWallets(s: SupabaseClient, venue: string) {
  const fy = fyOf();
  const { data: barbers } = await s.from("barbers").select("id, name, slug, role, color_from, color_to").eq("venue_id", venue).eq("is_active", true).order("created_at");
  const [w, bal, payouts, runs, batches, auditRows, venueRow, fyLedger, statsRows] = await Promise.all([
    s.from("barber_wallets").select("*").eq("venue_id", venue),
    s.rpc("wallet_balances", { p_venue: venue }),
    s.from("wallet_payouts").select("*").eq("venue_id", venue).order("created_at", { ascending: false }).limit(200),
    s.from("wallet_payruns").select("id, period_start, period_end, totals, source, created_at, lines").eq("venue_id", venue).order("period_start", { ascending: false }).limit(30),
    s.from("wallet_batches").select("*").eq("venue_id", venue).order("created_at", { ascending: false }).limit(20),
    s.from("wallet_audit").select("*").eq("venue_id", venue).order("created_at", { ascending: false }).limit(60),
    s.from("wallet_venue_settings").select("*").eq("venue_id", venue).maybeSingle(),
    s.from("wallet_ledger").select("barber_id, amount_cents, kind, period_end, created_at").eq("venue_id", venue).eq("kind", "earning").gte("created_at", fy.start).limit(5000),
    s.from("barber_stats").select("barber_id, total_revenue, services_revenue, total_appts, period_label").eq("venue_id", venue),
  ]);
  const ready = !w.error && !bal.error;
  const wBy = new Map<string, any>((w.data ?? []).map((r: any) => [String(r.barber_id), r]));
  const bBy = new Map<string, any>(((bal.data as any[]) ?? []).map((r: any) => [String(r.barber_id), r]));
  const statBy = new Map<string, any>((statsRows.data ?? []).map((r: any) => [String(r.barber_id), r]));
  const ytd = new Map<string, number>(); (fyLedger.data ?? []).forEach((r: any) => ytd.set(String(r.barber_id), (ytd.get(String(r.barber_id)) ?? 0) + Number(r.amount_cents)));
  const pend = new Map<string, number>(); (payouts.data ?? []).forEach((p: any) => { if (["requested", "approved", "exported"].includes(p.status)) pend.set(String(p.barber_id), (pend.get(String(p.barber_id)) ?? 0) + Number(p.amount_cents)); });

  const list = (barbers ?? []).map((b: any) => {
    const raw = wBy.get(String(b.id)); const st = settingsFor(raw ?? (/owner/i.test(b.role ?? "") ? { pay_model: "owner" } : null)); const bl = bBy.get(String(b.id));
    const balance = Number(bl?.balance_cents ?? 0), pot = Number(bl?.tax_pot_cents ?? 0);
    const ytdCents = ytd.get(String(b.id)) ?? 0;
    // Annual income estimate: wallet earnings so far this financial year, annualised. Before any pay runs, a rough guide
    // from the Fresha stats (assumes the commission rate on services).
    const annualFromWallet = ytdCents > 0 ? (ytdCents / 100) * (fy.daysIn / fy.daysElapsed) : 0;
    const stat = statBy.get(String(b.id));
    const annualFromStats = stat && st.pay_model === "commission" ? Number(stat.services_revenue ?? stat.total_revenue ?? 0) * (st.service_pct / 100) : 0;
    const annual = annualFromWallet || annualFromStats;
    const est: TaxEstimate = estimate(annual, { expenses: st.expenses_annual_cents / 100, gstRegistered: st.gst_registered, employment: st.employment });
    const reservePct = st.employment === "employee" ? 0 : st.tax_reserve_pct_override ?? est.suggestedReservePct;
    return {
      id: String(b.id), name: b.name, slug: b.slug, role: b.role, color_from: b.color_from || "#7c3aed", color_to: b.color_to || "#db2777",
      configured: !!raw, settings: { ...st, reserve_pct: reservePct },
      bank: raw?.bank_bsb_enc ? { account_name: raw.bank_account_name, bsb_masked: raw.bank_bsb_masked, last4: raw.bank_last4, verified: !!raw.bank_verified, updated_at: raw.bank_updated_at } : null,
      balance_cents: balance, tax_pot_cents: pot, available_cents: balance - pot, pending_cents: pend.get(String(b.id)) ?? 0, ytd_earned_cents: ytdCents,
      tax: { ...est, basis: annualFromWallet ? "wallet" : annualFromStats ? "stats" : "none", stats_period: stat?.period_label ?? null }, reserve_pct: reservePct,
    };
  });
  const names = new Map(list.map((b) => [b.id, b.name]));
  const v = venueRow.data as any;
  return {
    ready, encryption: encryptionReady(), fy,
    venue: v ? { remitter_name: v.remitter_name, bank_abbrev: v.bank_abbrev, apca_user_id: v.apca_user_id, bsb_masked: v.bsb_masked, account_last4: v.account_last4, description: v.description, balance_record: !!v.balance_record, complete: !!(v.remitter_name && v.bank_abbrev && v.apca_user_id && v.bsb_enc && v.account_enc) } : null,
    barbers: list,
    payouts: (payouts.data ?? []).map((p: any) => ({ ...p, barber_name: names.get(String(p.barber_id)) ?? "Unknown" })),
    payruns: (runs.data ?? []).map((r: any) => ({ id: r.id, period_start: r.period_start, period_end: r.period_end, totals: r.totals, source: r.source, created_at: r.created_at, lines: (r.lines ?? []).map((l: any) => ({ barber_id: l.barber_id, name: l.name, earning_cents: l.earning_cents, reserve_cents: l.reserve_cents })) })),
    batches: batches.data ?? [], audit: (auditRows.data ?? []).map((a: any) => ({ ...a, barber_name: a.barber_id ? names.get(String(a.barber_id)) ?? null : null })),
  };
}

/** Decrypt bank details for the bank file only. Throws if anything is missing or unreadable. */
export function decryptBank(row: any): { bsb: string; account: string; name: string } {
  if (!row?.bank_bsb_enc || !row?.bank_account_enc) throw new Error("missing bank details");
  return { bsb: decrypt(row.bank_bsb_enc), account: decrypt(row.bank_account_enc), name: String(row.bank_account_name ?? "") };
}
