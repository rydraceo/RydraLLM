import { z } from 'zod';
import { chat } from './gateway';
import { createClient } from '@supabase/supabase-js';
import { getCustomers, SMS_COST_AUD, type CopilotCustomer, type MarkovKey } from '@/lib/ai/customers';
import { fallbackTemplate, templateProblem, parseJsonLoose } from '@/lib/ai/briefs';

// Create the Supabase client inside the function instead of at module level
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials. Check .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// audience_size, target_user_ids and source are optional, so existing consumers keep working.
export const InsightSchema = z.object({
  insights: z.array(
    z.object({
      type: z.string(),
      headline: z.string(),
      action: z.string(),
      revenue_impact: z.string(),
      urgency: z.string(),
      confidence: z.number(),
      audience_size: z.number().optional(),
      target_user_ids: z.array(z.string()).optional(),
    })
  ).min(1),
  summary: z.string(),
  source: z.enum(['ai', 'data']).optional(),
});

export type VenueInsights = z.infer<typeof InsightSchema>;

// ─── What the model is told ──────────────────────────────────────────────────
// The numbers, counts, dollar figures and client lists all come from code (below), never from the model.
// The model only writes wording and picks the ranking.
const SYSTEM_PROMPT = `You are the Rydra insights advisor for Alkami Barbershop in Canberra, Australia.

TASK
Write 3 to 5 campaign insights from the data provided, best estimated value first. Skip any group with 0 messageable clients.

FIELDS (return exactly this JSON shape)
{"insights":[{"type":string,"headline":string,"action":string,"revenue_impact":string,"urgency":string,"confidence":number}],"summary":string}
- type: use the group's type exactly (at_risk_sms, churned_winback, rebook_reminder, first_timer_followup, loyal_appreciation).
- headline: max 90 characters. Must include that group's messageable client count exactly as given.
- action: Send: "<SMS text>" followed by one short sentence on timing or why. Use double quotes around the SMS text and none inside it.
- revenue_impact: the estimated extra revenue figure given for that group, e.g. "$840 estimated".
- urgency: today, this_week or monitor.
- confidence: 0 to 1, higher for bigger audiences.
- summary: one or two sentences naming the biggest opportunity, using only numbers from the data.

SMS TEXT RULES (strict)
- Maximum 90 characters. Include the literal placeholder {first_name} once. Mention "Alkami" once.
- Plain ASCII, Australian English, warm and casual. At most one exclamation mark. No emoji.
- No digits at all. No links, no phone numbers, no prices, no discounts or offers, no "reply" or "call" instructions.
- Do not invent barber names, slots or availability. A booking link and opt-out line are added automatically.
- Loyal clients get appreciation only. Never offer them anything.

GENERAL
- Use ONLY numbers that appear in the data. Never invent statistics, percentages or benchmarks.
- Return ONLY the JSON object, nothing else.`;

// ─── Real data → per-group stats ─────────────────────────────────────────────
type GroupDef = { type: string; state: MarkovKey; label: string; urgency: 'today' | 'this_week' | 'monitor' };
const GROUPS: GroupDef[] = [
  { type: 'at_risk_sms', state: 'R_at_risk', label: 'at-risk regulars', urgency: 'today' },
  { type: 'churned_winback', state: 'X', label: 'churned clients', urgency: 'this_week' },
  { type: 'rebook_reminder', state: 'R_on_fence', label: 'on-the-fence regulars', urgency: 'this_week' },
  { type: 'first_timer_followup', state: 'C', label: 'first-timers', urgency: 'this_week' },
  { type: 'loyal_appreciation', state: 'R_loyal', label: 'loyal regulars', urgency: 'monitor' },
];

type GroupStats = GroupDef & { total: number; ok: CopilotCustomer[]; n_ok: number; excluded: number; iv: number; avg_days: number; avg_gap: number };

export function buildStats(rows: CopilotCustomer[]): GroupStats[] {
  return GROUPS.map((g) => {
    const all = rows.filter((r) => r.markov_state === g.state);
    const ok = all.filter((r) => r.sms_status === 'ok').sort((a, b) => b.intervention_value_aud - a.intervention_value_aud);
    const avg = (f: (r: CopilotCustomer) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0);
    return {
      ...g, total: all.length, ok, n_ok: ok.length, excluded: all.length - ok.length,
      iv: ok.reduce((s, r) => s + r.intervention_value_aud, 0),
      avg_days: Math.round(avg((r) => r.days_since_last_visit)),
      avg_gap: Math.round(avg((r) => r.gap_ratio) * 100) / 100,
    };
  });
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

export function dataBlock(rows: CopilotCustomer[], stats: GroupStats[]): string {
  const messageable = rows.filter((r) => r.sms_status === 'ok').length;
  const by = (s: string) => rows.filter((r) => r.sms_status === s).length;
  const groups = stats.map((s) => `${s.type} (${s.label}):
- clients in group: ${s.total}
- messageable clients: ${s.n_ok}
- not messageable (held, opted out or no valid mobile): ${s.excluded}
- estimated extra revenue if the messageable clients are texted: ${money(s.iv)}
- average days since last visit: ${s.avg_days}
- average gap ratio: ${s.avg_gap}
- five highest-value: ${s.ok.slice(0, 5).map((c) => `${c.days_since_last_visit} days since visit, ${c.visits} visits, ${money(c.clv_aud)} lifetime value`).join('; ') || 'none'}`).join('\n\n');

  return `ALKAMI BARBERSHOP - REAL CLIENT DATA (${rows.length} total clients, ${messageable} messageable)
Not messageable overall: ${by('held')} on hold, ${by('opted_out')} opted out, ${by('invalid_number')} without a valid mobile.
Estimated revenue is a model estimate of extra revenue from texting, net of SMS cost (${money(SMS_COST_AUD * 100)} per 100 texts).
Clients with an upcoming booking count as recently active.

${groups}`;
}

// ─── Guards on whatever the model returns ────────────────────────────────────
const nums = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ''));
const numbersOk = (text: string, allowed: Set<string>) => nums(text).every((n) => allowed.has(n));

function cleanSms(action: string): string | null {
  const m = action.match(/"([^"]{8,200})"/) ?? action.match(/'(.{8,200})'/);
  const text = m?.[1]?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (templateProblem(text, 90) || /\d/.test(text)) return null;
  return text;
}

function build(s: GroupStats, ai?: { headline?: string; action?: string; urgency?: string; confidence?: number }, allowed?: Set<string>) {
  const headlineOk = !!ai?.headline && ai.headline.length <= 110 && (ai.headline.includes(String(s.n_ok)) || ai.headline.includes(s.n_ok.toLocaleString('en-AU'))) && (!allowed || numbersOk(ai.headline, allowed));
  const sms = (ai?.action && cleanSms(ai.action)) || fallbackTemplate(s.state, 90);
  const tail = ai?.action?.split(/"[^"]*"/).slice(1).join(' ').replace(/^[\s\-—.:]+/, '').trim();
  const tailOk = !!tail && tail.length <= 140 && !/[$%]/.test(tail) && !/\d/.test(tail) && !/\b(reply|call)\b/i.test(tail);
  const conf = Number(ai?.confidence);
  return {
    type: s.type,
    headline: headlineOk ? ai!.headline! : `${s.n_ok.toLocaleString('en-AU')} ${s.label} can be messaged`,
    action: `Send: "${sms}"${tailOk ? ` ${tail}` : ''}`,
    revenue_impact: s.iv >= 1 ? `${money(s.iv)} estimated extra revenue (${s.n_ok.toLocaleString('en-AU')} clients)` : `Retention only, no extra revenue estimated (${s.n_ok.toLocaleString('en-AU')} clients)`,
    urgency: ['today', 'this_week', 'monitor'].includes(String(ai?.urgency)) ? String(ai!.urgency) : s.urgency,
    confidence: Number.isFinite(conf) ? Math.min(Math.max(conf, 0.3), 0.95) : s.n_ok >= 25 ? 0.8 : 0.6,
    audience_size: s.n_ok,
    target_user_ids: s.ok.slice(0, 25).map((c) => c.user_id),
  };
}

function summaryOf(stats: GroupStats[]) {
  const sorted = [...stats].filter((s) => s.n_ok > 0).sort((a, b) => b.iv - a.iv);
  const total = stats.reduce((s, g) => s + g.n_ok, 0);
  const iv = stats.reduce((s, g) => s + g.iv, 0);
  if (!sorted.length) return 'No clients can be messaged right now. Check holds and opt-outs before planning a campaign.';
  return `${total.toLocaleString('en-AU')} clients can be messaged, worth an estimated ${money(iv)} in extra revenue. Biggest opportunity: ${sorted[0].n_ok.toLocaleString('en-AU')} ${sorted[0].label} (about ${money(sorted[0].iv)}).`;
}

export function finalise(parsed: VenueInsights, stats: GroupStats[], block: string): VenueInsights | null {
  const allowed = new Set(nums(block));
  const seen = new Set<string>();
  const out: ReturnType<typeof build>[] = [];
  for (const ins of parsed.insights) {
    const s = stats.find((g) => g.type === ins.type);
    if (!s || s.n_ok === 0 || seen.has(s.type)) continue;
    seen.add(s.type);
    out.push(build(s, ins, allowed));
  }
  if (!out.length) return null;
  const byIv = (t: string) => stats.find((g) => g.type === t)?.iv ?? 0;
  out.sort((a, b) => byIv(b.type) - byIv(a.type));
  const summary = parsed.summary && parsed.summary.length <= 320 && numbersOk(parsed.summary, allowed) ? parsed.summary : summaryOf(stats);
  return { insights: out.slice(0, 5), summary, source: 'ai' };
}

export function fallbackInsights(stats: GroupStats[]): VenueInsights {
  const live = stats.filter((s) => s.n_ok > 0).sort((a, b) => b.iv - a.iv).slice(0, 4);
  if (!live.length) {
    return { insights: [{ type: 'loyal_appreciation', headline: 'No clients can be messaged right now', action: 'Check SMS holds and opt-outs before planning a campaign.', revenue_impact: '$0', urgency: 'monitor', confidence: 0.9 }], summary: summaryOf(stats), source: 'data' };
  }
  return { insights: live.map((s) => build(s)), summary: summaryOf(stats), source: 'data' };
}

// ─── Main ────────────────────────────────────────────────────────────────────
export async function generateInsights(venueId: string): Promise<VenueInsights> {
  console.log(`Generating AI insights for venue: ${venueId}`);
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!businessId) throw new Error('ALKAMI_BUSINESS_ID is not set');

  // Same loader as the dashboard: pages past the 1000-row limit and uses the same segment rules.
  const rows = await getCustomers(getSupabaseClient(), venueId, businessId);
  const stats = buildStats(rows);
  const block = dataBlock(rows, stats);
  console.log('Client data context:', block.slice(0, 400) + '...');

  if (!stats.some((s) => s.n_ok > 0)) return fallbackInsights(stats);

  try {
    // Goes through the Portkey gateway (fallbacks, logging and cost tracking live there).
    const res = await chat({
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: block }],
      maxTokens: 1500,
    });
    const json = parseJsonLoose(res.text);
    if (!json) throw new Error('Model did not return JSON');
    const parsed = InsightSchema.parse(json);
    const result = finalise(parsed, stats, block);
    if (result) {
      console.log(`Generated ${result.insights.length} insights for Alkami Barbershop`);
      return result;
    }
    console.error('[insights] Model output had no usable insights, using data-only version');
  } catch (e) {
    console.error('[insights] Model call failed, using data-only version:', e);
  }
  return fallbackInsights(stats);
}
