// Browser-side helper. Every component that talks to the AI service goes through aiFetch().
//
//  NEXT_PUBLIC_AI_BASE_URL   unset or ""  -> same origin (the merged app, and any single-app setup)
//                            "http://localhost:3002" -> a separately running AI service (local dev)
// After the merge into the booking repo, delete the variable and nothing else changes.

const BASE = (process.env.NEXT_PUBLIC_AI_BASE_URL ?? "").replace(/\/+$/, "");

export const aiUrl = (path: string) => `${BASE}${path}`;

export function aiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(aiUrl(path), { credentials: BASE ? "include" : "same-origin", ...init });
}
