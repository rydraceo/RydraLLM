// Edge-safe CORS helper for the AI service. Same-origin (the merged app) needs none of this.
//
//  AI_ALLOWED_ORIGINS  comma-separated list, e.g. "http://localhost:3000,https://booking.example.com"
//  Default in development: localhost / 127.0.0.1 on ports 3000, 3001, 3003 and 5173.
//  Default in production: nothing is allowed cross-origin.

export function allowedOrigins(): string[] {
  const fromEnv = (process.env.AI_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  if (process.env.NODE_ENV === "production") return [];
  return ["localhost", "127.0.0.1"].flatMap((h) => [3000, 3001, 3003, 5173].map((p) => `http://${h}:${p}`));
}

export function corsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin || !allowedOrigins().includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin, // never "*": credentials are allowed
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
