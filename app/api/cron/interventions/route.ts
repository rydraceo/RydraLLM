import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
// ─── Markov State Deriver ─────────────────────────────────────────────────────
function deriveMarkovState(visits: number, gap_ratio: number, state: string): string {
  if (visits <= 1) return "C";
  if (gap_ratio > 2.5 || state === "X") return "X";
  if (gap_ratio > 1.3) return "R_at_risk";
  if (gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
// ─── AI Message Generation ────────────────────────────────────────────────────
async function generatePersonalisedMessage(
  template: string,
  customer: { name: string; markov_state: string; gap_ratio: number; days_overdue: number; clv: number }
): Promise<string> {
  const firstName = customer.name.split(" ")[0];
  const baseMessage = template
    .replace("[NAME]", firstName)
    .replace("[BARBER]", "your barber");
 
  // If template already has real personalisation, use it directly
  if (!template.includes("[NAME]") || template.length < 80) return baseMessage;
 
  // Otherwise, let AI write a unique version based on their data
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
 
  const STATE_STRATEGIES: Record<string, string> = {
    C:          "First visit done. Nudge for second appointment. No discount needed.",
    X:          "Long lapsed. Warm win-back. $20-30 incentive acceptable.",
    R_at_risk:  "Loyal client drifting. Scarcity + personalisation. $10-20 if needed.",
    R_on_fence: "Gentle nudge only. No discount.",
    R_loyal:    "Appreciation. No discount ever.",
  };
 
  const prompt = `You are a barbershop messaging specialist. Write a personalised SMS for this client.
 
Client: ${firstName}
Markov state: ${customer.markov_state} — ${STATE_STRATEGIES[customer.markov_state] || "Re-engage"}
Days overdue: ${customer.days_overdue}
Gap ratio: ${customer.gap_ratio.toFixed(2)}×
CLV: $${customer.clv.toFixed(0)}
 
Base template (adapt this, don't copy verbatim): "${baseMessage}"
 
Rules:
- Max 160 characters
- Australian English
- Start with "Hey ${firstName}"
- End with a clear action (Reply YES, etc.)
- Never mention competitor names
- Never make up barber names — use "your barber" or "the team"
 
Output ONLY the SMS. No quotes, no explanation.`;
 
  try {
    if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 80, temperature: 0.7 }),
      });
      if (res.ok) {
        const data = await res.json();
        const msg = data.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
        if (msg.length <= 160) return msg;
      }
    }
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 80, messages: [{ role: "user", content: prompt }] }),
      });
      if (res.ok) {
        const data = await res.json();
        const msg = data.content[0].text.trim().replace(/^["']|["']$/g, "");
        if (msg.length <= 160) return msg;
      }
    }
  } catch (err) {
    console.error("[AutoEngine] AI generation failed:", err);
  }
 
  // Fallback to template substitution
  return baseMessage.slice(0, 160);
}
 
// ─── Send SMS via ClickSend ───────────────────────────────────────────────────
async function sendSMS(to: string, message: string): Promise<{ success: boolean; provider_id?: string; error?: string }> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return { success: false, error: "ClickSend not configured" };
 
  const phone = to.replace(/\s/g, "").startsWith("+") ? to : `+61${to.replace(/\s/g, "").replace(/^0/, "")}`;
 
  try {
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`,
      },
      body: JSON.stringify({ messages: [{ to: phone, body: message, source: "rydra-auto" }] }),
    });
    const data = await res.json();
    const msgResult = data?.data?.messages?.[0];
    if (msgResult?.status === "SUCCESS" || msgResult?.status === "QUEUED") {
      return { success: true, provider_id: msgResult.message_id };
    }
    return { success: false, error: data?.data?.messages?.[0]?.status || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
 
// ─── Main cron handler ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Auth — Vercel sends Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || "rydra-dev";
  const isVercelCron = authHeader === `Bearer ${expectedSecret}`;
  const isManualRun = cronSecret === expectedSecret;
 
  if (!isVercelCron && !isManualRun) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
 
  const body = await request.json().catch(() => ({}));
  const venue_id = body.venue_id || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID || "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
  const rule_id_filter: string | null = body.rule_id || null;
  const dry_run: boolean = body.dry_run === true;
 
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
 
  const startTime = Date.now();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
 
  console.log(`[AutoEngine] Starting. venue=${venue_id} dry_run=${dry_run} day=${today}`);
 
  // 1. Fetch active rules
  let rulesQuery = supabase
    .from("intervention_rules")
    .select("*")
    .eq("venue_id", venue_id)
    .eq("is_active", true)
    .eq("is_paused", false);
 
  if (rule_id_filter) rulesQuery = rulesQuery.eq("id", rule_id_filter);
 
  const { data: rules, error: rulesError } = await rulesQuery;
  if (rulesError || !rules?.length) {
    return NextResponse.json({ error: rulesError?.message || "No active rules found" }, { status: 200 });
  }
 
  // 2. Fetch all customers
  const BATCH_SIZE = 1000;
  let allCustomers: any[] = [];
  let from = 0;
  while (true) {
    const { data: batch } = await supabase
      .rpc("get_customers_with_scores", { p_venue_id: venue_id })
      .range(from, from + BATCH_SIZE - 1);
    const b = batch || [];
    allCustomers = [...allCustomers, ...b];
    if (b.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  console.log(`[AutoEngine] Loaded ${allCustomers.length} customers`);
 
  // 3. Fetch recent outreach (for cooldown checks)
  const maxCooldown = Math.max(...rules.map((r: any) => r.cooldown_days || 21));
  const cooldownWindow = new Date(Date.now() - maxCooldown * 24 * 60 * 60 * 1000).toISOString();
 
  const { data: recentOutreach } = await supabase
    .from("intervention_logs")
    .select("customer_id, created_at, rule_id")
    .eq("venue_id", venue_id)
    .eq("status", "sent")
    .gte("created_at", cooldownWindow);
 
  // Map: customer_id → last sent timestamp
  const lastContactMap: Record<string, Date> = {};
  (recentOutreach || []).forEach((o: any) => {
    const existing = lastContactMap[o.customer_id];
    const ts = new Date(o.created_at);
    if (!existing || ts > existing) lastContactMap[o.customer_id] = ts;
  });
 
  // 4. Process each rule
  const runResults: any[] = [];
 
  for (const rule of rules) {
    // Skip if today is not in send_days (only for scheduled runs, not manual)
    if (!rule_id_filter && !rule.send_days.includes(today)) {
      console.log(`[AutoEngine] Rule "${rule.name}" skipped — not scheduled for ${today}`);
      continue;
    }
 
    console.log(`[AutoEngine] Processing rule "${rule.name}"`);
 
    // 5. Filter matching customers
    const matching = allCustomers.filter((c: any) => {
      const visits    = Number(c.total_visits) || 0;
      const gap_ratio = Number(c.gap_ratio) || 0;
      const state     = c.current_state || "R";
      const markov    = deriveMarkovState(visits, gap_ratio, state);
      const clv_cents = Number(c.clv_cents) || 0;
      const days_od   = Number(c.days_since_last_visit) || 0;
 
      // State match
      if (!rule.target_states.includes(markov)) return false;
      // CLV threshold
      if (clv_cents < rule.min_clv_cents) return false;
      // Days overdue range
      if (days_od < rule.min_days_overdue || days_od > rule.max_days_overdue) return false;
      // Gap ratio
      if (gap_ratio < rule.min_gap_ratio) return false;
      // Must have phone
      if (!c.customer_phone || c.customer_phone === "No phone") return false;
      // Cooldown check
      const lastContact = lastContactMap[c.user_id];
      if (lastContact) {
        const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < rule.cooldown_days) return false;
      }
      return true;
    });
 
    console.log(`[AutoEngine] Rule "${rule.name}": ${matching.length} matching customers`);
 
    // Cap per run
    const targets = matching.slice(0, rule.max_sends_per_run);
 
    let sentCount = 0;
    let failCount = 0;
    const logs: any[] = [];
 
    for (const customer of targets) {
      const clv_cents = Number(customer.clv_cents) || 0;
      const gap_ratio = Number(customer.gap_ratio) || 0;
      const days_od   = Number(customer.days_since_last_visit) || 0;
      const markov    = deriveMarkovState(Number(customer.total_visits)||0, gap_ratio, customer.current_state||"R");
 
      let messageSent = "";
      let status = "pending";
      let skipReason = "";
      let providerId = "";
 
      try {
        // Generate personalised message
        messageSent = await generatePersonalisedMessage(rule.message_template, {
          name: customer.customer_name || "there",
          markov_state: markov,
          gap_ratio,
          days_overdue: days_od,
          clv: clv_cents / 100,
        });
 
        if (!dry_run) {
          const smsResult = await sendSMS(customer.customer_phone, messageSent);
          if (smsResult.success) {
            status = "sent";
            providerId = smsResult.provider_id || "";
            sentCount++;
            // Update cooldown map to prevent same client in same run
            lastContactMap[customer.user_id] = new Date();
          } else {
            status = "failed";
            skipReason = smsResult.error || "SMS send failed";
            failCount++;
          }
        } else {
          status = "dry_run";
          sentCount++;
        }
      } catch (err: any) {
        status = "failed";
        skipReason = err.message;
        failCount++;
      }
 
      logs.push({
        rule_id: rule.id,
        rule_name: rule.name,
        venue_id,
        customer_id: customer.user_id,
        customer_name: customer.customer_name,
        customer_phone: customer.customer_phone,
        markov_state: markov,
        gap_ratio,
        days_overdue: days_od,
        clv_cents,
        intervention_value_cents: Math.round((customer.intervention_value_cents || 0)),
        message_sent: messageSent,
        status,
        skip_reason: skipReason || null,
        sms_provider_id: providerId || null,
        sms_cost_cents: status === "sent" ? 8 : 0,
      });
 
      // Small delay to avoid hammering APIs
      await new Promise(r => setTimeout(r, 150));
    }
 
    // 6. Batch insert logs
    if (logs.length > 0 && !dry_run) {
      await supabase.from("intervention_logs").insert(logs);
    }
 
    // 7. Update rule stats + last_run_at
    if (!dry_run && sentCount > 0) {
      await supabase
        .from("intervention_rules")
        .update({
          last_run_at: new Date().toISOString(),
          total_sent: (rule.total_sent || 0) + sentCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id);
    } else if (!dry_run) {
      await supabase
        .from("intervention_rules")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", rule.id);
    }
 
    runResults.push({
      rule_id: rule.id,
      rule_name: rule.name,
      matched: matching.length,
      targeted: targets.length,
      sent: sentCount,
      failed: failCount,
      dry_run,
    });
  }
 
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSent = runResults.reduce((s, r) => s + r.sent, 0);
 
  console.log(`[AutoEngine] Complete. ${totalSent} messages sent in ${elapsed}s`);
 
  return NextResponse.json({
    success: true,
    elapsed_seconds: elapsed,
    dry_run,
    total_sent: totalSent,
    rules_processed: runResults.length,
    results: runResults,
  });
}
 
// GET — health check
export async function GET() {
  return NextResponse.json({
    service: "Rydra Automated Intervention Engine",
    status: "active",
    schedule: "0 23 * * *",
    timezone: "UTC (≈ 9am AEST)",
  });
}