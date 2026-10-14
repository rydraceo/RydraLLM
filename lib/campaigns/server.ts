import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";

export function guard(req: NextRequest, max = 30): NextResponse | null {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, max)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });
  return null;
}
export function env() {
  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return null;
  return { venueId, businessId };
}
export const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export const asciiOnly = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\n]/g, "").trim();
/** True when the error is "table does not exist" (the SQL has not been run yet). */
export const missingTable = (e: any) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(String(e.message ?? "")));
