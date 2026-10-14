import Portkey from 'portkey-ai';

// The ONE place the app talks to an LLM. Everything goes through Portkey, so keys, fallbacks,
// logs and cost tracking live in Portkey and no provider key needs to be in this app's env.
//
// Env:
//   PORTKEY_API_KEY        required
//   PORTKEY_CONFIG_ID      optional. A saved Portkey config (fallbacks, retries, caching) managed in the Portkey UI.
//                          If set, it wins and the variables below are ignored.
//   PORTKEY_PRIMARY_KEY    provider / virtual-key slug for the primary model  (default: claude-haiku-secondary-key)
//   AI_PRIMARY_MODEL       primary model                                      (default: claude-sonnet-5-5)
//   PORTKEY_FALLBACK_KEY   slug for the fallback                              (default: gpt-4o-mini)
//   AI_FALLBACK_MODEL      fallback model                                     (default: gpt-4o-mini)
// A model written as "@slug/model" (Portkey Model Catalog syntax) needs no separate key slug.

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatMsg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: unknown } };
export type ChatResult = { text: string; toolCalls: ToolCall[]; finishReason: string; model: string | null };

export class GatewayError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.name = 'GatewayError'; this.status = status; }
}

type Target = { virtual_key?: string; override_params: { model: string } };

function target(slug: string, model: string): Target {
  return model.startsWith('@') ? { override_params: { model } } : { virtual_key: slug, override_params: { model } };
}

export function gatewayTargets() {
  return {
    primary: target(process.env.PORTKEY_PRIMARY_KEY || 'claude-haiku-secondary-key', process.env.AI_PRIMARY_MODEL || 'claude-sonnet-5-5'),
    fallback: target(process.env.PORTKEY_FALLBACK_KEY || 'gpt-4o-mini', process.env.AI_FALLBACK_MODEL || 'gpt-4o-mini'),
  };
}

export function gatewayConfig(): string | Record<string, unknown> {
  const id = process.env.PORTKEY_CONFIG_ID?.trim();
  if (id) return id;
  const t = gatewayTargets();
  return { strategy: { mode: 'fallback', on_status_codes: [401, 402, 403, 404, 408, 429, 500, 502, 503, 504, 529] }, targets: [t.primary, t.fallback] };
}

export function describeGateway() {
  const id = process.env.PORTKEY_CONFIG_ID?.trim();
  if (id) return { mode: 'saved-config' as const, config_id: id };
  const t = gatewayTargets();
  return { mode: 'fallback' as const, primary: { key: t.primary.virtual_key ?? null, model: t.primary.override_params.model }, fallback: { key: t.fallback.virtual_key ?? null, model: t.fallback.override_params.model } };
}

// Created lazily (never at import time) and rebuilt if the env changes.
let client: Portkey | null = null;
let clientSig = '';
function getClient(): Portkey {
  const apiKey = process.env.PORTKEY_API_KEY;
  if (!apiKey) throw new GatewayError('PORTKEY_API_KEY is not set.', 503);
  const config = gatewayConfig();
  const sig = JSON.stringify([apiKey, config]);
  if (!client || sig !== clientSig) { client = new Portkey({ apiKey, config } as any); clientSig = sig; }
  return client;
}

export async function chat(o: { messages: ChatMsg[]; tools?: ToolDef[]; maxTokens?: number; temperature?: number }): Promise<ChatResult> {
  const c = getClient();
  const body: Record<string, unknown> = {
    // Each target's override_params.model replaces this, so it only needs to be a valid placeholder.
    model: gatewayTargets().primary.override_params.model,
    messages: o.messages,
    max_tokens: o.maxTokens ?? 1200,
  };
  if (o.tools?.length) body.tools = o.tools;
  if (o.temperature != null) body.temperature = o.temperature;

  let res: any;
  try {
    res = await (c.chat.completions.create as (b: unknown) => Promise<unknown>).call(c.chat.completions, body);
  } catch (e: any) {
    const status = Number(e?.status ?? e?.response?.status) || 502;
    console.error('[gateway] Portkey call failed:', status, String(e?.message ?? e).slice(0, 300));
    throw new GatewayError(`AI gateway error (${status}).`, status >= 400 && status < 600 ? 502 : 502);
  }

  const choice = res?.choices?.[0];
  const msg = choice?.message ?? {};
  const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.filter((t: any) => t?.function?.name).map((t: any) => ({ id: String(t.id), type: 'function' as const, function: { name: String(t.function.name), arguments: String(t.function.arguments ?? '{}') } }))
    : [];
  return { text: typeof msg.content === 'string' ? msg.content.trim() : '', toolCalls, finishReason: String(choice?.finish_reason ?? ''), model: res?.model ? String(res.model) : null };
}

/**
 * Simple text completion through the gateway (Portkey, with fallback).
 * Returns the trimmed text, or null when the gateway fails or returns nothing, so callers can use their own
 * data-only fallback. Use this for every "write me a short message" call instead of calling a provider directly.
 */
export async function ask(o: {
  user?: string;
  system?: string;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const messages: ChatMsg[] = [];
  if (o.system) messages.push({ role: 'system', content: o.system });
  if (o.messages?.length) messages.push(...o.messages.map((m) => ({ role: m.role, content: m.content }) as ChatMsg));
  if (o.user) messages.push({ role: 'user', content: o.user });
  if (!messages.length) return null;
  try {
    const r = await chat({ messages, maxTokens: o.maxTokens, temperature: o.temperature });
    return r.text || null;
  } catch {
    return null;
  }
}
