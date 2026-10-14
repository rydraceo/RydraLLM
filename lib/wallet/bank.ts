// Australian bank detail validation and the ABA ("Direct Entry" / Cemtex) payment file that every major
// Australian bank accepts for batch payments (CommBiz, NAB Connect, Westpac Live, ANZ Transactive, etc.).
// Spec: fixed-width 120-character records, CRLF line endings. Type 0 header, type 1 details, type 7 trailer.

export const cleanBsb = (s: string) => String(s ?? "").replace(/\D/g, "");
export const cleanAcct = (s: string) => String(s ?? "").replace(/[\s-]/g, "");

export function bsbProblem(bsb: string): string | null {
  const b = cleanBsb(bsb);
  if (b.length !== 6) return "BSB must be 6 digits.";
  if (/^0{6}$/.test(b)) return "That BSB isn't valid.";
  return null;
}
export function accountProblem(acct: string): string | null {
  const a = cleanAcct(acct);
  if (!/^\d{5,9}$/.test(a)) return "Account number must be 5 to 9 digits.";
  if (/^0+$/.test(a)) return "That account number isn't valid.";
  return null;
}
export const fmtBsb = (bsb: string) => { const b = cleanBsb(bsb); return `${b.slice(0, 3)}-${b.slice(3)}`; };
export const maskBsb = (bsb: string) => { const b = cleanBsb(bsb); return `${b.slice(0, 3)}-***`; };
export const last4 = (acct: string) => cleanAcct(acct).slice(-4);

/** Characters the ABA format allows (BECS character set). Everything else is replaced. */
export const abaText = (s: string) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 &'()*+,.\/\-]/g, " ").replace(/\s+/g, " ").trim();

const L = (s: string, n: number) => abaText(s).slice(0, n).padEnd(n, " ");
const R0 = (v: number | string, n: number) => { const s = String(v); if (s.length > n) throw new Error(`Value ${s} is too long for a ${n}-digit field.`); return s.padStart(n, "0"); };
const RB = (s: string, n: number) => { if (s.length > n) throw new Error(`Value is too long for a ${n}-character field.`); return s.padStart(n, " "); };
const blank = (n: number) => " ".repeat(n);

export type AbaHeader = { bankAbbrev: string; remitterName: string; apcaUserId: string; description: string; processDate: Date; traceBsb: string; traceAccount: string; balance?: boolean };
export type AbaPayment = { bsb: string; account: string; accountName: string; amountCents: number; reference: string };

function ddmmyy(d: Date) {
  const p = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("day")}${g("month")}${g("year")}`;
}

export function buildAba(h: AbaHeader, pays: AbaPayment[]): { text: string; totalCents: number; count: number } {
  if (!pays.length) throw new Error("No payments in this batch.");
  if (!/^[A-Z]{3}$/.test(h.bankAbbrev)) throw new Error("Bank code must be 3 letters (e.g. CBA, NAB, WBC, ANZ).");
  if (!/^\d{1,6}$/.test(h.apcaUserId)) throw new Error("APCA / Direct Entry user ID must be up to 6 digits.");
  const tb = bsbProblem(h.traceBsb); if (tb) throw new Error(`Business account: ${tb}`);
  const ta = accountProblem(h.traceAccount); if (ta) throw new Error(`Business account: ${ta}`);
  if (!abaText(h.remitterName)) throw new Error("Remitter name is required.");

  const lines: string[] = [];
  lines.push("0" + blank(17) + "01" + h.bankAbbrev + blank(7) + L(h.remitterName, 26) + R0(h.apcaUserId, 6) + L(h.description || "PAYMENT", 12) + ddmmyy(h.processDate) + blank(40));
  let credit = 0;
  for (const p of pays) {
    const bp = bsbProblem(p.bsb); if (bp) throw new Error(`${p.accountName}: ${bp}`);
    const ap = accountProblem(p.account); if (ap) throw new Error(`${p.accountName}: ${ap}`);
    if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new Error(`${p.accountName}: amount must be a positive whole number of cents.`);
    if (p.amountCents > 9_999_999_999) throw new Error(`${p.accountName}: amount too large.`);
    if (!abaText(p.accountName)) throw new Error("Every payment needs an account name.");
    credit += p.amountCents;
    lines.push("1" + fmtBsb(p.bsb) + RB(cleanAcct(p.account), 9) + " " + "53" + R0(p.amountCents, 10) + L(p.accountName, 32) + L(p.reference, 18)
      + fmtBsb(h.traceBsb) + RB(cleanAcct(h.traceAccount), 9) + L(h.remitterName, 16) + R0(0, 8));
  }
  let debit = 0;
  if (h.balance) {
    debit = credit;
    lines.push("1" + fmtBsb(h.traceBsb) + RB(cleanAcct(h.traceAccount), 9) + " " + "13" + R0(debit, 10) + L(h.remitterName, 32) + L(h.description || "PAYMENT", 18)
      + fmtBsb(h.traceBsb) + RB(cleanAcct(h.traceAccount), 9) + L(h.remitterName, 16) + R0(0, 8));
  }
  const count = lines.length - 1;
  lines.push("7" + "999-999" + blank(12) + R0(Math.abs(credit - debit), 10) + R0(credit, 10) + R0(debit, 10) + blank(24) + R0(count, 6) + blank(40));
  for (const l of lines) if (l.length !== 120) throw new Error(`Internal error: ABA line is ${l.length} characters.`);
  return { text: lines.join("\r\n") + "\r\n", totalCents: credit, count: pays.length };
}
