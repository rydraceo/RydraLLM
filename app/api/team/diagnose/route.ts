import { NextRequest, NextResponse } from "next/server";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";

// Owner-only. Shows the SHAPE of the data (column names, counts, how values look), never client names, phones or emails,
// so we can see how visits are linked to barbers.
const SAFE = /^(id|user_id|venue_id|barber|staff|team|employee|provider|stylist|event|date|type|service|revenue|amount|price|created|starts|status|source|appointment|booking)/i;
export async function GET(req: NextRequest) {
  const g = guard(req); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "env" }, { status: 503 });
  const s = db(); const out: Record<string, any> = {};
  for (const t of ["customer_events", "barbers", "barber_stats", "barber_diary", "barber_clients", "appointments", "bookings", "customers"]) {
    const { data, error, count } = await s.from(t).select("*", { count: "exact" }).limit(5);
    if (error) { out[t] = { error: error.message }; continue; }
    const cols = data?.[0] ? Object.keys(data[0]) : [];
    const sample = (data ?? []).map((r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => SAFE.test(k) && !/name|phone|email/i.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 40) : v])));
    out[t] = { count, columns: cols, sample: t === "customers" ? undefined : sample };
  }
  const rpc = await s.rpc("get_customers_with_scores", { p_venue_id: e.venueId }).range(0, 0);
  out.rpc_columns = rpc.error ? rpc.error.message : Object.keys(rpc.data?.[0] ?? {});
  // How many events carry something that looks like a barber reference?
  const ev = await s.from("customer_events").select("*").limit(1000);
  if (!ev.error && ev.data?.length) {
    const keys = Object.keys(ev.data[0]).filter((k) => /barber|staff|team|employee|provider|stylist|member/i.test(k));
    out.event_barber_columns = Object.fromEntries(keys.map((k) => [k, { filled: ev.data!.filter((r: any) => r[k] != null && r[k] !== "").length, distinct: [...new Set(ev.data!.map((r: any) => r[k]).filter(Boolean))].slice(0, 12) }]));
    out.event_types = [...new Set(ev.data.map((r: any) => r.event_type ?? r.type).filter(Boolean))].slice(0, 20);
  }
  try {
    const { count: evCount } = await s.from("events").select("event_id", { count: "exact", head: true }).eq("venue_id", e.venueId);
    const { count: evBarber } = await s.from("events").select("event_id", { count: "exact", head: true }).eq("venue_id", e.venueId).not("barber_id", "is", null);
    const { data: evs } = await s.from("events").select("event_type, state, occurred_at, barber_id, service_id, booking_id, appointment_datetime, deposit_amount_cents, is_return_visit, source, metadata").eq("venue_id", e.venueId).order("occurred_at", { ascending: false }).limit(1000);
    const types: Record<string, number> = {}; const barbersSeen: Record<string, number> = {}; const metaKeys: Record<string, number> = {};
    (evs ?? []).forEach((r: any) => { types[r.event_type] = (types[r.event_type] ?? 0) + 1; if (r.barber_id) barbersSeen[r.barber_id] = (barbersSeen[r.barber_id] ?? 0) + 1; if (r.metadata && typeof r.metadata === "object") Object.keys(r.metadata).forEach((k) => (metaKeys[k] = (metaKeys[k] ?? 0) + 1)); });
    const metaSample = (evs ?? []).find((r: any) => r.metadata && Object.keys(r.metadata).length)?.metadata;
    const safeMeta = metaSample ? Object.fromEntries(Object.entries(metaSample).filter(([k]) => !/name|phone|email/i.test(k)).map(([k, v]: any) => [k, typeof v === "string" ? v.slice(0, 30) : v])) : null;
    const { count: csTotal } = await s.from("customer_scores").select("score_id", { count: "exact", head: true }).eq("venue_id", e.venueId);
    const { count: csPref } = await s.from("customer_scores").select("score_id", { count: "exact", head: true }).eq("venue_id", e.venueId).not("preferred_barber_id", "is", null);
    const { data: prefs } = await s.from("customer_scores").select("preferred_barber_id").eq("venue_id", e.venueId).not("preferred_barber_id", "is", null).limit(3000);
    const prefDist: Record<string, number> = {}; (prefs ?? []).forEach((r: any) => (prefDist[r.preferred_barber_id] = (prefDist[r.preferred_barber_id] ?? 0) + 1));
    const { count: ab } = await s.from("appointment_bookings").select("id", { count: "exact", head: true });
    const { count: st } = await s.from("staff").select("id", { count: "exact", head: true });
    out.events_summary = { total: evCount, with_barber: evBarber, recent_types: types, recent_barbers: barbersSeen, metadata_keys: metaKeys, metadata_sample: safeMeta, newest: evs?.[0]?.occurred_at, oldest_in_sample: evs?.[evs.length - 1]?.occurred_at, sample: (evs ?? []).slice(0, 3).map((r: any) => ({ ...r, metadata: undefined })) };
    out.scores_summary = { total: csTotal, with_preferred_barber: csPref, distribution: prefDist };
    out.booking_tables = { appointment_bookings: ab, staff: st };
  } catch (err: any) { out.events_summary = String(err?.message ?? err); }
  try {
    const spec = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }).then((r) => r.json());
    out.tables = Object.keys(spec?.paths ?? {}).filter((p) => p !== "/").map((p) => p.slice(1));
    out.table_columns = Object.fromEntries(Object.entries(spec?.definitions ?? {}).map(([k, v]: any) => [k, Object.keys(v?.properties ?? {})]));
  } catch (err: any) { out.tables = String(err?.message ?? err); }
  return NextResponse.json(out);
}
