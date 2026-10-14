// Australian tax maths for the wallet. Estimates only, to help barbers put the right amount aside.
// Resident individual rates (excluding offsets). Source: ATO / legislated Stage 3 cuts; the 16% bracket falls to 15%
// from 1 July 2026. Medicare levy 2% (low-income reductions and the Medicare levy surcharge are ignored).

type Bracket = { upTo: number; rate: number };
const RATES: Record<string, Bracket[]> = {
  "2025-26": [{ upTo: 18200, rate: 0 }, { upTo: 45000, rate: 0.16 }, { upTo: 135000, rate: 0.30 }, { upTo: 190000, rate: 0.37 }, { upTo: Infinity, rate: 0.45 }],
  "2026-27": [{ upTo: 18200, rate: 0 }, { upTo: 45000, rate: 0.15 }, { upTo: 135000, rate: 0.30 }, { upTo: 190000, rate: 0.37 }, { upTo: Infinity, rate: 0.45 }],
};
export const MEDICARE = 0.02;
export const GST = 0.1;
export const SUPER_GUARANTEE = 0.12;

/** Australian financial year label for a date, e.g. 2026-10-14 -> "2026-27". */
export function fyOf(d = new Date()): { label: string; start: string; end: string; daysIn: number; daysElapsed: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  const yy = get("year"), mm = get("month") - 1, dd = get("day");
  const y = mm >= 6 ? yy : yy - 1;
  const start = new Date(Date.UTC(y, 6, 1)), end = new Date(Date.UTC(y + 1, 5, 30));
  const today = Date.UTC(yy, mm, dd);
  return { label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), daysIn: Math.round((end.getTime() - start.getTime()) / 864e5) + 1, daysElapsed: Math.max(1, Math.round((today - start.getTime()) / 864e5) + 1) };
}

export function incomeTax(taxable: number, fy = fyOf().label): number {
  const b = RATES[fy] ?? RATES["2026-27"];
  let tax = 0, lower = 0;
  for (const { upTo, rate } of b) { if (taxable <= lower) break; tax += (Math.min(taxable, upTo) - lower) * rate; lower = upTo; }
  return Math.max(0, tax);
}

export type TaxEstimate = {
  fy: string; annualIncome: number; expenses: number; taxable: number; incomeTax: number; medicare: number; totalTax: number;
  effectiveRate: number; marginalRate: number; suggestedReservePct: number; gstRegistered: boolean; gstThresholdWarning: boolean; note: string;
};

/** Suggested share of every dollar to put aside, from an annual income estimate. */
export function estimate(annualIncome: number, opts: { expenses?: number; gstRegistered?: boolean; employment?: "contractor" | "employee"; fy?: string } = {}): TaxEstimate {
  const fy = opts.fy ?? fyOf().label;
  const income = Math.max(0, annualIncome), expenses = Math.max(0, opts.expenses ?? 0);
  const taxable = Math.max(0, income - expenses);
  const it = incomeTax(taxable, fy), med = taxable > 0 ? taxable * MEDICARE : 0, total = it + med;
  const b = RATES[fy] ?? RATES["2026-27"];
  const marginal = (b.find((x) => taxable <= x.upTo) ?? b[b.length - 1]).rate + MEDICARE;
  const eff = income > 0 ? total / income : 0;
  const employee = opts.employment === "employee";
  // Round up to the next whole percent, plus a 2-point buffer, so the pot is never short. Employees: PAYG is withheld by payroll.
  const suggested = employee ? 0 : income > 0 ? Math.min(45, Math.ceil(eff * 100) + 2) : 0;
  return {
    fy, annualIncome: income, expenses, taxable, incomeTax: round2(it), medicare: round2(med), totalTax: round2(total), effectiveRate: eff, marginalRate: marginal,
    suggestedReservePct: suggested, gstRegistered: !!opts.gstRegistered, gstThresholdWarning: !opts.gstRegistered && !employee && income >= 75000,
    note: employee ? "Employees have tax withheld through payroll (PAYG and Single Touch Payroll), so nothing needs to be put aside here." : "Estimate for a resident sole trader. Excludes tax offsets, HELP debts and other income. Check with an accountant.",
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
