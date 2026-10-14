// Small RFC-4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes, BOM). Keeps duplicate headers by position.
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
export const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Dates the way Fresha and Australian spreadsheets write them, to YYYY-MM-DD. */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(v: string): string | null {
  const s = String(v ?? "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -,]+(\d{4})/))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if ((m = s.match(/^[A-Za-z]{3},? (\d{1,2}) ([A-Za-z]{3}) (\d{4})/))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
