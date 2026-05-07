import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
export async function POST(request: NextRequest) {
  try {
    const { venue_id } = await request.json();
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    const { data: customers } = await supabase
      .rpc("get_customers_with_scores", { p_venue_id: venue_id })
      .range(0, 999);
 
    const all = customers || [];
    const atRisk = all.filter((c: any) => c.gap_ratio > 1.5);
    const onFence = all.filter((c: any) => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
    const churned = all.filter((c: any) => c.gap_ratio > 2.5);
    const avgChurn = all.reduce((s: number, c: any) => s + (c.churn_score_10 || 0), 0) / (all.length || 1);
    const topTargets = all
      .filter((c: any) => (c.clv_cents || 0) > 0 && (c.days_since_last_visit || 0) > 30)
      .sort((a: any, b: any) => (b.clv_cents || 0) - (a.clv_cents || 0))
      .slice(0, 3);
 
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOutreach } = await supabase
      .from("sms_outreach").select("id, status").eq("venue_id", venue_id).gte("created_at", sevenDaysAgo);
 
    const outreachCount = (recentOutreach || []).length;
    const delivered = (recentOutreach || []).filter((o: any) => ["delivered", "queued", "sent"].includes(o.status)).length;
    const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
 
    const prompt = `Morning intelligence brief for Alkami Barbershop owner, ${today}.
 
LIVE DATA:
- ${all.length} total clients | ${atRisk.length} at-risk | ${onFence.length} on-fence | ${churned.length} churned
- Avg churn score: ${(avgChurn * 10).toFixed(1)}/10
- SMS last 7 days: ${outreachCount} sent, ${delivered} delivered
- Top CLV clients overdue:
${topTargets.map((c: any) => `  • ${c.customer_name || "Client"} — ${c.days_since_last_visit || 0} days, $${((c.clv_cents || 0) / 100).toFixed(0)} CLV`).join("\n")}
 
Respond in EXACTLY this format:
📊 HEALTH SCORE
[1 sentence, 1 key number]
 
🎯 TODAY'S PRIORITY
[Single most important action — specific]
 
👥 WHO TO CONTACT
[2-3 named clients with reason]
 
📈 THIS WEEK'S FOCUS
[One metric + specific target]
 
Under 120 words. Direct. Australian English. No fluff.`;
 
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: "Terse barbershop business intelligence. Always specific, never generic." }, { role: "user", content: prompt }], max_tokens: 300, temperature: 0.6 }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}`);
        const data = await res.json();
        return NextResponse.json({ brief: data.choices[0].message.content, stats: { atRisk: atRisk.length, onFence: onFence.length, outreachCount, delivered, total: all.length } });
      } catch (err) { console.error("[Brief] OpenAI:", err); }
    }
 
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      return NextResponse.json({ brief: data.content[0].text, stats: { atRisk: atRisk.length, onFence: onFence.length, outreachCount, delivered, total: all.length } });
    }
 
    return NextResponse.json({ error: "No AI keys" }, { status: 503 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}