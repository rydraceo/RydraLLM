import { GST } from "@/lib/wallet/tax";

// Pure pay-run maths, in integer cents so nothing is ever lost to rounding.
export type PaySettings = {
  employment: "contractor" | "employee"; pay_model: "commission" | "chair_rent" | "owner";
  service_pct: number; product_pct: number; tips_pct: number; chair_rent_weekly_cents: number; gst_registered: boolean; reserve_pct: number;
};
export type Takings = { services_cents: number; products_cents: number; tips_cents: number };
export type PayLine = {
  barber_id: string; name: string; model: PaySettings["pay_model"]; takings: Takings;
  service_share_cents: number; product_share_cents: number; tips_share_cents: number; rent_cents: number;
  earning_ex_gst_cents: number; gst_cents: number; earning_cents: number; reserve_cents: number; reserve_pct: number; shop_keeps_cents: number; notes: string[];
};

const pct = (cents: number, p: number) => Math.round((cents * Math.max(0, Math.min(100, p))) / 100);

export function weeksIn(start: string, end: string) {
  const d = Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 864e5) + 1;
  return Math.max(1, d) / 7;
}

export function computeLine(barber: { id: string; name: string }, s: PaySettings, t: Takings, period: { start: string; end: string }): PayLine {
  const notes: string[] = [];
  const total = t.services_cents + t.products_cents + t.tips_cents;
  let svc = 0, prod = 0, tips = 0, rent = 0;
  if (s.pay_model === "owner") notes.push("Owner: no commission is calculated. Add a manual adjustment if you pay yourself through the wallet.");
  else if (s.pay_model === "chair_rent") {
    svc = t.services_cents; prod = t.products_cents; tips = t.tips_cents;
    rent = Math.round(s.chair_rent_weekly_cents * weeksIn(period.start, period.end));
    notes.push(`Chair rent for ${weeksIn(period.start, period.end).toFixed(1)} weeks deducted.`);
  } else { svc = pct(t.services_cents, s.service_pct); prod = pct(t.products_cents, s.product_pct); tips = pct(t.tips_cents, s.tips_pct); }
  const exGst = svc + prod + tips - rent;
  const gst = s.gst_registered && s.employment === "contractor" && exGst > 0 ? Math.round(exGst * GST) : 0;
  if (gst) notes.push("GST-registered: 10% GST added. It all goes in the tax pot for their BAS.");
  if (exGst < 0) notes.push("Takings were less than chair rent, so this barber owes the shop for the period.");
  const earning = exGst + gst;
  const reservePct = s.employment === "employee" ? 0 : s.reserve_pct;
  const reserve = earning > 0 ? Math.min(earning, pct(Math.max(0, exGst), reservePct) + gst) : 0;
  if (s.employment === "employee") notes.push("Employee: PAYG tax and super are handled through payroll, not this wallet.");
  return { barber_id: barber.id, name: barber.name, model: s.pay_model, takings: t, service_share_cents: svc, product_share_cents: prod, tips_share_cents: tips, rent_cents: rent, earning_ex_gst_cents: exGst, gst_cents: gst, earning_cents: earning, reserve_cents: reserve, reserve_pct: reservePct, shop_keeps_cents: total - (svc + prod + tips) + rent, notes };
}

/** Parse money the way Fresha writes it: "1710,25", "1,234.56", "$1,234", "125145.18". */
export function parseMoney(v: unknown): number {
  let s = String(v ?? "").trim().replace(/[$\s]/g, "");
  if (!s || s === "-") return 0;
  if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");          // decimal comma
  else s = s.replace(/,/g, "");                                      // thousands separators
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
export const toCents = (dollars: number) => Math.round(dollars * 100);
