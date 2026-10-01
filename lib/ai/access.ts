import type { NextRequest } from "next/server";
import { checkAccess } from "@/lib/auth/basic";

// Second line of defence: every AI / outreach data route re-checks the login itself,
// in case the middleware matcher is ever changed or bypassed.
export function authorize(req: NextRequest): boolean {
  return checkAccess(req.headers, { allowService: true }) === "ok";
}

export const DENIED_MESSAGE = "Sign-in required.";

// Best-effort limiter (per warm serverless instance).
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(req: NextRequest, max = 20): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + 60_000 }); return false; }
  h.n++;
  return h.n > max;
}
