import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  name: string;
  phone: string;
  email: string | null;
  gap_ratio: number;
  days_overdue: number;
  visits: number;
  potential_value: string;
  churn_score: number | null;
  risk_segment: string;
  intervention_recommended: boolean;
  last_visit: string;
  avg_gap_days: number;
}

// ─── OpenAI Tool Definitions ──────────────────────────────────────────────────

const tools = [
  {
    type: "function",
    function: {
      name: "get_customers_by_segment",
      description:
        "Fetch customers filtered by risk segment. Use this to answer questions about specific groups.",
      parameters: {
        type: "object",
        properties: {
          segment: {
            type: "string",
            enum: ["at_risk", "on_fence", "loyal", "intervention_ready"],
            description:
              "at_risk = gap_ratio > 1.5, on_fence = 0.5–1.5, loyal = < 0.5, intervention_ready = flagged for outreach",
          },
          limit: {
            type: "number",
            description: "Max customers to return. Default 10, max 50.",
          },
        },
        required: ["segment"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_customers",
      description:
        "Get top N customers ranked by a specific metric. Use for 'who are the most at-risk' or 'highest value' type questions.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["gap_ratio", "churn_score", "potential_value", "days_overdue"],
          },
          limit: {
            type: "number",
            description: "Number of results. Default 10, max 50.",
          },
          segment: {
            type: "string",
            enum: ["at_risk", "on_fence", "loyal", "all"],
            description: "Optionally pre-filter by segment before ranking. Default: all.",
          },
        },
        required: ["metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_customer",
      description: "Find a specific customer by name or phone number.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Name fragment or phone number to search.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_breakdown",
      description:
        "Get total and per-segment CLV revenue breakdown. Use for revenue or financial questions.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// ─── Tool Executor (runs against in-memory customer array) ────────────────────

function executeTool(name: string, args: any, customers: Customer[]): any {
  switch (name) {
    case "get_customers_by_segment": {
      const { segment, limit = 10 } = args;
      let filtered = customers;
      if (segment === "at_risk") filtered = customers.filter((c) => c.gap_ratio > 1.5);
      else if (segment === "on_fence")
        filtered = customers.filter((c) => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
      else if (segment === "loyal") filtered = customers.filter((c) => c.gap_ratio <= 0.5);
      else if (segment === "intervention_ready")
        filtered = customers.filter((c) => c.intervention_recommended);

      return filtered.slice(0, Math.min(limit, 50)).map((c) => ({
        name: c.name,
        phone: c.phone,
        gap_ratio: c.gap_ratio,
        days_overdue: c.days_overdue,
        potential_value: c.potential_value,
        churn_score: c.churn_score,
        visits: c.visits,
        risk_segment: c.risk_segment,
      }));
    }

    case "get_top_customers": {
      const { metric, limit = 10, segment = "all" } = args;
      let filtered = customers;
      if (segment === "at_risk") filtered = customers.filter((c) => c.gap_ratio > 1.5);
      else if (segment === "on_fence")
        filtered = customers.filter((c) => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
      else if (segment === "loyal") filtered = customers.filter((c) => c.gap_ratio <= 0.5);

      const sorted = [...filtered].sort((a: any, b: any) => {
        const aVal =
          metric === "potential_value" ? parseFloat(a[metric]) : a[metric] ?? 0;
        const bVal =
          metric === "potential_value" ? parseFloat(b[metric]) : b[metric] ?? 0;
        return bVal - aVal;
      });

      return sorted.slice(0, Math.min(limit, 50)).map((c) => ({
        name: c.name,
        phone: c.phone,
        gap_ratio: c.gap_ratio,
        days_overdue: c.days_overdue,
        potential_value: c.potential_value,
        churn_score: c.churn_score,
        visits: c.visits,
      }));
    }

    case "search_customer": {
      const { query } = args;
      const q = query.toLowerCase();
      return customers
        .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
        .slice(0, 5)
        .map((c) => ({
          name: c.name,
          phone: c.phone,
          gap_ratio: c.gap_ratio,
          days_overdue: c.days_overdue,
          potential_value: c.potential_value,
          churn_score: c.churn_score,
          visits: c.visits,
          last_visit: c.last_visit,
          risk_segment: c.risk_segment,
          intervention_recommended: c.intervention_recommended,
        }));
    }

    case "get_revenue_breakdown": {
      const atRisk = customers.filter((c) => c.gap_ratio > 1.5);
      const onFence = customers.filter((c) => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
      const loyal = customers.filter((c) => c.gap_ratio <= 0.5);
      const interventionReady = customers.filter((c) => c.intervention_recommended);
      const sumValue = (arr: Customer[]) =>
        arr.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0);
      const total = sumValue(customers);

      return {
        total_clv: `$${total.toFixed(2)}`,
        at_risk_clv: `$${sumValue(atRisk).toFixed(2)}`,
        on_fence_clv: `$${sumValue(onFence).toFixed(2)}`,
        loyal_clv: `$${sumValue(loyal).toFixed(2)}`,
        intervention_ready_clv: `$${sumValue(interventionReady).toFixed(2)}`,
        avg_clv_per_customer: `$${(total / customers.length).toFixed(2)}`,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Build Summary Snapshot (always injected as context) ──────────────────────

function buildSummary(customers: Customer[]) {
  const total = customers.length;
  const atRisk = customers.filter((c) => c.gap_ratio > 1.5);
  const onFence = customers.filter((c) => c.gap_ratio > 0.5 && c.gap_ratio <= 1.5);
  const loyal = customers.filter((c) => c.gap_ratio <= 0.5);
  const interventionReady = customers.filter((c) => c.intervention_recommended);

  const sumValue = (arr: Customer[]) =>
    arr.reduce((s, c) => s + parseFloat(c.potential_value || "0"), 0);

  const avgGapRatio =
    customers.reduce((s, c) => s + c.gap_ratio, 0) / (total || 1);
  const avgChurn =
    customers.reduce((s, c) => s + (c.churn_score ?? 0), 0) / (total || 1);

  const topAtRisk = [...atRisk]
    .sort((a, b) => b.gap_ratio - a.gap_ratio)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      gap_ratio: c.gap_ratio.toFixed(2),
      days_overdue: c.days_overdue,
      clv: `$${c.potential_value}`,
    }));

  return {
    totalCustomers: total,
    atRisk: { count: atRisk.length, pct: ((atRisk.length / total) * 100).toFixed(1) },
    onFence: { count: onFence.length, pct: ((onFence.length / total) * 100).toFixed(1) },
    loyal: { count: loyal.length, pct: ((loyal.length / total) * 100).toFixed(1) },
    interventionReady: { count: interventionReady.length, clv: `$${sumValue(interventionReady).toFixed(0)}` },
    totalCLV: `$${sumValue(customers).toFixed(0)}`,
    avgGapRatio: avgGapRatio.toFixed(2),
    avgChurnScore: (avgChurn * 10).toFixed(1),
    topAtRisk,
  };
}

// ─── OpenAI with Function Calling (primary) ───────────────────────────────────

async function runOpenAI(
  systemPrompt: string,
  userMessage: string,
  customers: Customer[],
  structured: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // Recommendations mode: no tools, just get JSON back
  if (structured) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Chat mode: function calling loop (max 5 rounds)
  let round = 0;
  while (round < 5) {
    round++;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 1000,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
    const data = await response.json();
    const choice = data.choices[0];

    // If no tool calls → we have the final answer
    if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
      return choice.message.content;
    }

    // Execute all tool calls and append results
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = executeTool(toolCall.function.name, args, customers);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("OpenAI function calling loop exceeded max rounds");
}

// ─── Anthropic Fallback (context-only, no function calling) ───────────────────

async function runAnthropic(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Parse body ONCE (previous code called request.json() twice — this broke chat)
    const body = await request.json();
    const { venue_id, type, query } = body;

    if (!venue_id) {
      return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
    }

    // ── Fetch customers from Supabase ──────────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rawCustomers, error: dbError } = await supabase.rpc(
      "get_customers_with_scores",
      { p_venue_id: venue_id }
    );

    if (dbError) {
      console.error("[AI] DB error:", dbError);
      return NextResponse.json({ error: "Failed to fetch customer data" }, { status: 500 });
    }

    // Transform to match Customer type
    const customers: Customer[] = (rawCustomers ?? []).map((row: any) => ({
      name: row.customer_name || "Unknown",
      phone: row.customer_phone || "",
      email: row.customer_email || null,
      gap_ratio: parseFloat(row.gap_ratio?.toFixed(2) || "0"),
      days_overdue: row.days_since_last_visit || 0,
      visits: row.total_visits || 0,
      potential_value: ((row.clv_cents || 0) / 100).toFixed(2),
      churn_score: row.churn_score_10 ? parseFloat(row.churn_score_10.toFixed(2)) : null,
      risk_segment: row.risk_segment || "unknown",
      intervention_recommended: row.intervention_recommended || false,
      last_visit: row.last_event_at || "",
      avg_gap_days: row.avg_visit_gap_days || 0,
    }));

    const summary = buildSummary(customers);

    // ── RECOMMENDATIONS mode ───────────────────────────────────────────────
    if (type === "recommendations") {
      const systemPrompt = `You are RydraAI, a revenue intelligence assistant for Alkami Barbershop.
Your job is to generate sharp, specific, data-driven recommendations — not generic advice.
Always reference the actual numbers from the data provided.
Return ONLY valid JSON. No markdown, no preamble.`;

      const userMessage = `Here is the current customer data summary for Alkami Barbershop:

${JSON.stringify(summary, null, 2)}

Generate exactly 3 actionable recommendations. Each must be specific to this data.
Return this exact JSON structure:
{
  "recommendations": [
    {
      "title": "Max 5 words",
      "description": "2-3 sentences referencing specific numbers from the data",
      "impact": "Specific metric e.g. +$450 revenue, +18% conversion",
      "actionLabel": "One of: Send SMS | Create Offer | Launch Campaign | Adjust Pricing | Feature Item"
    }
  ]
}`;

      try {
        const aiResponse = await runOpenAI(systemPrompt, userMessage, customers, true);
        const parsed = JSON.parse(aiResponse);
        return NextResponse.json({ recommendations: parsed.recommendations });
      } catch (err) {
        console.error("[AI] Recommendations failed:", err);
        // Anthropic fallback
        try {
          const fallbackResponse = await runAnthropic(systemPrompt, userMessage);
          const clean = fallbackResponse.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          return NextResponse.json({ recommendations: parsed.recommendations });
        } catch (fallbackErr) {
          console.error("[AI] Anthropic fallback also failed:", fallbackErr);
          return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
        }
      }
    }

    // ── CHAT mode ─────────────────────────────────────────────────────────
    if (type === "chat") {
      if (!query) {
        return NextResponse.json({ error: "query is required for chat" }, { status: 400 });
      }

      const systemPrompt = `You are RydraAI, an intelligent assistant for Alkami Barbershop's customer retention dashboard.
You have access to tools that can query the full customer database (${customers.length} customers).
Use tools to look up specific data before answering — don't guess.
Be concise and actionable. Reference real numbers. No corporate fluff.

Summary snapshot (always available without tools):
${JSON.stringify(summary, null, 2)}`;

      try {
        const aiResponse = await runOpenAI(systemPrompt, query, customers, false);
        return NextResponse.json({ response: aiResponse });
      } catch (err) {
        console.error("[AI] OpenAI chat failed, trying Anthropic:", err);
        // Anthropic fallback — inject summary + top 10 as context (no function calling)
        try {
          const fallbackSystem = `${systemPrompt}

Note: You don't have tool access in fallback mode. Use the summary snapshot above to answer as best you can.`;
          const fallbackResponse = await runAnthropic(fallbackSystem, query);
          return NextResponse.json({ response: fallbackResponse });
        } catch (fallbackErr) {
          console.error("[AI] Anthropic fallback also failed:", fallbackErr);
          return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
        }
      }
    }

    return NextResponse.json({ error: "Invalid type. Use 'recommendations' or 'chat'" }, { status: 400 });

  } catch (error: any) {
    console.error("[AI] Unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}