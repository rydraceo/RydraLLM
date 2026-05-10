import { NextRequest, NextResponse } from "next/server";
 
// ─── POST: Given a cancelled slot datetime, rank clients and generate messages ─
export async function POST(req: NextRequest) {
  const { venue_id, slot_datetime, slot_barber } = await req.json();
 
  if (!venue_id || !slot_datetime) {
    return NextResponse.json({ error: "venue_id and slot_datetime required" }, { status: 400 });
  }
 
  const slotDate = new Date(slot_datetime);
  const slotDateLabel = slotDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const slotTime = slotDate.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
 
  try {
    // 1. Fetch at-risk clients using the working endpoint
    const host = req.headers.get("host") || "localhost:3000";
    const proto = process.env.NODE_ENV === "production" ? "https" : "http";
    const atRiskRes = await fetch(
      `${proto}://${host}/api/intelligence/at-risk-customers?venue_id=${venue_id}`
    );
    if (!atRiskRes.ok) throw new Error("Failed to fetch at-risk customers");
    const atRiskData = await atRiskRes.json();
 
    const allClients: any[] = atRiskData.customers || [];
 
    // 2. Filter: must have phone, must be actionable state
    const eligible = allClients.filter(
      c => c.phone && c.phone !== "No phone" &&
      ["R_at_risk", "R_on_fence", "X", "C"].includes(c.markov_state)
    );
 
    if (!eligible.length) {
      return NextResponse.json({ clients: [], slot_label: `${slotDateLabel} at ${slotTime}`, total_candidates: 0 });
    }
 
    // 3. Score and rank: ΔV × urgency multiplier × state boost
    const scored = eligible
      .map(c => {
        const iv = Number(c.intervention_value || 0);
        const urgency = c.days_overdue > 90 ? 1.5 : c.days_overdue > 45 ? 1.2 : 1.0;
        const stateBoost = c.markov_state === "R_at_risk" ? 1.3
          : c.markov_state === "X" ? 1.4
          : c.markov_state === "R_on_fence" ? 1.1 : 1.0;
        return { ...c, slot_score: Math.round(iv * urgency * stateBoost * 10) };
      })
      .sort((a, b) => b.slot_score - a.slot_score)
      .slice(0, 5);
 
    // 4. Generate personalised slot-fill SMS for top 3
    const clients = await Promise.all(
      scored.slice(0, 3).map(async (client) => {
        const firstName = client.name?.split(" ")[0] || "mate";
        let message = `Hey ${firstName}, a spot just opened up ${slotDateLabel} at ${slotTime}${slot_barber ? ` with ${slot_barber}` : ""}. Want it? Reply YES to lock it in — Alkami.`;
 
        try {
          const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
                content: `Write a short SMS (max 130 chars) for a barbershop client named ${firstName} offering a last-minute appointment slot.
 
Details:
- Slot: ${slotDateLabel} at ${slotTime}${slot_barber ? ` with ${slot_barber}` : ""}
- Client situation: ${client.days_overdue} days since last visit, ${
  client.markov_state === "R_at_risk" ? "at risk of churning" :
  client.markov_state === "X" ? "churned — needs win-back" :
  client.markov_state === "R_on_fence" ? "visits occasionally" : "first timer"
}
 
Rules:
- Start with "Hey ${firstName},"
- Say "a spot just opened up" (not "cancellation")
- Include date and time naturally
- End with "Reply YES to lock it in"
- Under 130 characters TOTAL
- No URLs, no hashtags
 
Return ONLY the SMS text.`
              }],
            }),
          });
          const aiData = await aiRes.json();
          const aiMsg = aiData.choices?.[0]?.message?.content?.trim();
          if (aiMsg && aiMsg.length <= 160) message = aiMsg;
        } catch { /* use fallback */ }
 
        return {
          user_id: client.user_id,
          name: client.name,
          phone: client.phone,
          markov_state: client.markov_state,
          days_overdue: client.days_overdue,
          intervention_value: Number(client.intervention_value || 0),
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
      total_candidates: eligible.length,
    });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
 