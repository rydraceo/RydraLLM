import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "@/lib/auth/basic";
import { corsHeaders } from "@/lib/ai/cors";

// Protects the merchant dashboard and every API route that reads client data, runs the AI or sends SMS,
// and answers CORS for the AI service when another app (e.g. the booking system in local dev) calls it.
// (Next.js 16 prints a deprecation notice for the name "middleware"; it still works.
//  To silence it later: npx @next/codemod@canary middleware-to-proxy .)

const PROTECTED = [
  "/merchant",
  "/api/ai", "/api/outreach", "/api/intelligence", "/api/insights",
  "/api/interventions", "/api/markov", "/api/sms", "/api/campaigns", "/api/clients", "/api/barber", "/api/barbers", "/api/team", "/api/wallet",
];
// Left open on purpose: they authenticate themselves.
const OPEN = [
  "/api/sms/inbound", // ClickSend webhook, checked with SMS_WEBHOOK_KEY
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (OPEN.some((p) => under(path, p))) return NextResponse.next();

  const isTestRoute = /^\/api\/test/.test(path); // /api/test-db, /api/test-env ... should be deleted before launch
  const protectedPath = isTestRoute || PROTECTED.some((p) => under(path, p));
  if (!protectedPath) return NextResponse.next();

  const isApi = path.startsWith("/api/");
  const cors = isApi ? corsHeaders(req.headers.get("origin")) : null;
  const finish = (res: NextResponse) => { if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };

  // Browser preflight carries no credentials, so it is answered before the login check.
  if (isApi && req.method === "OPTIONS") return cors ? finish(new NextResponse(null, { status: 204 })) : new NextResponse(null, { status: 403 });

  const access = checkAccess(req.headers, { allowCron: isApi, allowService: isApi });
  if (access === "ok") return finish(NextResponse.next());

  const json = (o: unknown) => JSON.stringify(o);
  if (access === "unconfigured") {
    const msg = "Sign-in is not configured. Set MERCHANT_PASSWORD (12+ characters).";
    return finish(new NextResponse(isApi ? json({ error: msg }) : msg, { status: 503, headers: { "Content-Type": isApi ? "application/json" : "text/plain" } }));
  }
  // The challenge header lets the browser reuse the saved login for API calls made by the pages.
  return finish(new NextResponse(isApi ? json({ error: "Sign-in required." }) : "Sign-in required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Rydra", charset="UTF-8"', "Content-Type": isApi ? "application/json" : "text/plain" },
  }));
}

export const config = { matcher: ["/merchant/:path*", "/api/:path*"] };
