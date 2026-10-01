// Shared-login gate for the merchant area. Uses only Web APIs, so it runs in both the Edge and Node runtimes.
//
//  MERCHANT_PASSWORD  required in production (12+ characters). Use a long random one.
//  MERCHANT_USER      optional, defaults to "owner".
//  CRON_SECRET        if set, `Authorization: Bearer <CRON_SECRET>` is accepted on protected API routes only.
//  AI_SERVICE_KEY     if set, `Authorization: Bearer <AI_SERVICE_KEY>` is accepted for server-to-server calls
//                     (e.g. the booking backend calling a separately hosted AI service). Never ship it to a browser.

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function parseBasic(header: string | null): { user: string; pass: string } | null {
  if (!header || !/^basic /i.test(header)) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const i = decoded.indexOf(":");
    return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch { return null; }
}

// "unconfigured" = production with no usable password. Fails CLOSED with a clear message.
export type Access = "ok" | "denied" | "unconfigured";

export function checkAccess(headers: Headers, opts: { allowCron?: boolean; allowService?: boolean } = {}): Access {
  const pass = process.env.MERCHANT_PASSWORD;
  const isProd = process.env.NODE_ENV === "production";
  if (!pass) return isProd ? "unconfigured" : "ok"; // local dev without a password stays open
  if (isProd && pass.length < 12) return "unconfigured";

  const auth = headers.get("authorization");
  const cron = process.env.CRON_SECRET;
  if (opts.allowCron && cron && auth && /^bearer /i.test(auth) && safeEqual(auth.slice(7).trim(), cron)) return "ok";

  const svc = process.env.AI_SERVICE_KEY;
  if (opts.allowService && svc && svc.length >= 24 && auth && /^bearer /i.test(auth) && safeEqual(auth.slice(7).trim(), svc)) return "ok";

  const p = parseBasic(auth);
  const user = process.env.MERCHANT_USER || "owner";
  return p && safeEqual(p.user, user) && safeEqual(p.pass, pass) ? "ok" : "denied";
}
