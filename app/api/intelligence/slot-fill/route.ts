import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
 
// ─── POST: Given a cancelled slot datetime, rank clients and generate messages ─
export async function POST(req: NextRequest) {
  const { venue_id, slot_datetime, slot_barber } = await req.json();
 
  if (!venue_id || !slot_datetime) {
    return NextResponse.json({ error: "venue_id and slot_datetime required" }, { status: 400 });
  }
 
  const slotDate = new Date(slot_datetime);
  const slotDOW = slotDate.toLocaleDateString("en-AU", { weekday: "long" });
  const slotTime = slotDate.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
  const slotDateLabel = slotDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
 
  const db = supabase();
 
  try {
    // 1. Get at-risk/on-fence/churned clients (from the scoring view)
    const { data: candidates } = await db
      .from("customer_churn_scores")
      .select("*")
      .eq("venue_id", venue_id)
      .in("markov_state", ["R_at_risk", "R_on_fence", "X", "C"])
      .not("phone", "is", null)
      .neq("phone", "No phone")
      .order("intervention_value", { ascending: false, nullsFirst: false })
      .limit(50);
 
    if (!candidates?.length) {
      return NextResponse.json({ clients: [], message: "No eligible clients found" });
    }
 
    // 2. Check cooldown — skip anyone contacted in last 14 days
    const cooldownSince = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: recentOutreach } = await db
      .from("sms_outreach")
      .select("customer_id")
      .eq("venue_id", venue_id)
      .gte("created_at", cooldownSince);
 
    const recentlyContacted = new Set((recentOutreach || []).map(r => r.customer_id));
 
    // 3. Score and rank
    const scored = candidates
      .filter(c => !recentlyContacted.has(c.user_id))
      .map(c => {
        // Base score: intervention value
        const ivScore = (c.intervention_value || 0) * 10;
 
        // Urgency multiplier: more overdue = higher priority for a slot offer
        const urgencyMultiplier = c.days_overdue > 90 ? 1.5 : c.days_overdue > 45 ? 1.2 : 1.0;
 
        // Day-of-week preference: if they historically visit on this DOW, boost score
        // (We don't have per-client DOW data yet, so we use markov_state heuristic)
        const stateBoost = c.markov_state === "R_at_risk" ? 1.3 : c.markov_state === "R_on_fence" ? 1.1 : 1.0;
 
        return {
          ...c,
          slot_score: Math.round(ivScore * urgencyMultiplier * stateBoost),
        };
      })
      .sort((a, b) => b.slot_score - a.slot_score)
      .slice(0, 5); // Top 5 candidates
 
    // 4. Generate personalised slot-fill messages via AI
    const clients = await Promise.all(
      scored.slice(0, 3).map(async (client) => {
        let message = "";
        try {
          const firstName = client.name?.split(" ")[0] || "mate";
          const barberLine = slot_barber ? `with ${slot_barber} ` : "";
 
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              max_tokens: 80,
              messages: [{
                role: "user",
                content: `Write a short SMS (max 130 chars) for a barbershop client named ${firstName} offering a cancelled appointment slot.
 
Slot: ${slotDateLabel} at ${slotTime}${slot_barber ? ` with ${slot_barber}` : ""}
Client: ${client.days_overdue} days since last visit, ${client.markov_state === "R_at_risk" ? "at risk of churning" : client.markov_state === "X" ? "churned" : "occasional visitor"}
 
Rules:
- Start with "Hey ${firstName},"
- Mention we've had a cancellation (don't say "cancellation", say "a spot just opened up")
- Include the date and time naturally
- Ask them to reply YES to lock it in
- Friendly, direct, not pushy
- DO NOT include a URL
- Under 130 characters total
 
Return only the SMS text, nothing else.`
              }],
            }),
          });
          const aiData = await res.json();
          message = aiData.choices?.[0]?.message?.content?.trim() || "";
        } catch {
          const firstName = client.name?.split(" ")[0] || "mate";
          message = `Hey ${firstName}, a spot just opened up ${slotDateLabel} at ${slotTime}. Want it? Reply YES to lock it in — Alkami.`;
        }
 
        return {
          user_id: client.user_id,
          name: client.name,
          phone: client.phone,
          markov_state: client.markov_state,
          days_overdue: client.days_overdue,
          intervention_value: client.intervention_value,
          potential_value: client.potential_value,
          slot_score: client.slot_score,
          message,
          message_length: message.length,
        };
      })
    );
 
    return NextResponse.json({
      slot_datetime,
      slot_label: `${slotDateLabel} at ${slotTime}`,
      clients,
      total_candidates: scored.length,
    });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}