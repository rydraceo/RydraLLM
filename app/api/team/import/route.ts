import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { guard, env, db, missingTable } from "@/lib/campaigns/server";
import { clearTeamCache } from "@/lib/barbers/data";
import { norm, parseDate } from "@/lib/wallet/csv";
import { parseMoney, toCents } from "@/lib/wallet/payrun";

export const runtime = "nodejs";
export const maxDuration = 60;

// Imports Fresha appointments (Sales > Appointments > Export > CSV) into barber_visits.
// The browser parses the file and sends mapped rows in chunks; matching and writing happen here.
// POST { action: "import", dry_run: boolean, rows: [{ref,date,client,phone,email,team_member,service,price,status}] }
// POST { action: "refresh" }  -> rebuilds barber_clients (who each client's barber is)

const phoneKey = (p: string) => { const d = String(p ?? "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
const statusOf = (s: string) => (/cancel/i.test(s) ? "cancelled" : /no.?show/i.test(s) ? "no_show" : "completed");

export async function POST(req: NextRequest) {
  const g = guard(req, 120); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const s = db();

  if (b?.action === "refresh") {
    const { data, error } = await s.rpc("rydra_refresh_barber_clients", { p_venue: e.venueId });
    if (error) return NextResponse.json({ error: missingTable(error) || /function/i.test(error.message) ? "Run supabase/barbers-and-wallets.sql in Supabase first." : error.message }, { status: 400 });
    clearTeamCache();
    return NextResponse.json({ ok: true, primaries: data });
  }

  const rows: any[] = Array.isArray(b?.rows) ? b.rows.slice(0, 1000) : [];
  if (!rows.length) return NextResponse.json({ error: "No rows." }, { status: 400 });

  const [{ data: barbers }, custs] = await Promise.all([
    s.from("barbers").select("id, name").eq("venue_id", e.venueId),
    (async () => { const out: any[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await s.from("customers").select("user_id, name, phone, email").eq("business_id", e.businessId).not("user_id", "is", null).order("id").range(f, f + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break; } return out; })(),
  ]);
  const byBarber = new Map<string, string>();
  (barbers ?? []).forEach((x: any) => { byBarber.set(norm(x.name), x.id); const first = norm(x.name).split(" ")[0]; if (first && ![...(barbers ?? [])].some((y: any) => y.id !== x.id && norm(y.name).split(" ")[0] === first)) byBarber.set(first, x.id); });
  const byPhone = new Map<string, string>(), byEmail = new Map<string, string>(), byName = new Map<string, string | null>();
  custs.forEach((c: any) => {
    const p = phoneKey(c.phone); if (p) byPhone.set(p, c.user_id);
    const em = String(c.email ?? "").trim().toLowerCase(); if (em) byEmail.set(em, c.user_id);
    const n = norm(c.name); if (n) byName.set(n, byName.has(n) && byName.get(n) !== c.user_id ? null : c.user_id); // null = ambiguous
  });

  const unmatchedBarbers = new Map<string, number>(); let matchedClients = 0, unmatchedClients = 0, badDates = 0;
  const visits: any[] = []; let minDate = "9999", maxDate = "0000";
  for (const r of rows) {
    const date = parseDate(r.date); if (!date) { badDates++; continue; }
    const tm = String(r.team_member ?? "").trim(); const barber = byBarber.get(norm(tm)) ?? byBarber.get(norm(tm).split(" ")[0]);
    if (!barber) { unmatchedBarbers.set(tm || "(blank)", (unmatchedBarbers.get(tm || "(blank)") ?? 0) + 1); continue; }
    const cust = byPhone.get(phoneKey(r.phone)) ?? byEmail.get(String(r.email ?? "").trim().toLowerCase()) ?? byName.get(norm(r.client)) ?? null;
    if (cust) matchedClients++; else unmatchedClients++;
    const price = parseMoney(r.price);
    const ref = String(r.ref ?? "").trim() ? `fresha:${String(r.ref).trim()}:${norm(r.service).slice(0, 40)}` : `h:${createHash("sha1").update([date, norm(r.client), barber, norm(r.service), price].join("|")).digest("hex")}`;
    if (date < minDate) minDate = date; if (date > maxDate) maxDate = date;
    visits.push({ venue_id: e.venueId, barber_id: barber, customer_id: cust, visit_date: date, service: String(r.service ?? "").slice(0, 120) || null, revenue_cents: Math.max(0, toCents(price)), status: statusOf(String(r.status ?? "")), source: "fresha_import", external_ref: ref });
  }
  const summary = { received: rows.length, usable: visits.length, matched_clients: matchedClients, unmatched_clients: unmatchedClients, bad_dates: badDates, unmatched_barbers: Object.fromEntries(unmatchedBarbers), from: visits.length ? minDate : null, to: visits.length ? maxDate : null };
  if (b.dry_run) return NextResponse.json({ dry_run: true, ...summary });

  let written = 0;
  for (let i = 0; i < visits.length; i += 500) {
    const { data, error } = await s.from("barber_visits").upsert(visits.slice(i, i + 500), { onConflict: "venue_id,external_ref", ignoreDuplicates: true }).select("id");
    if (error) return NextResponse.json({ error: missingTable(error) ? "Run supabase/barbers-and-wallets.sql in Supabase first." : error.message, ...summary, written }, { status: 400 });
    written += data?.length ?? 0;
  }
  return NextResponse.json({ ...summary, written, duplicates_skipped: visits.length - written });
}
