import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      to,
      message,
      customer_name,
      customer_id,
      venue_id,
      markov_state,
      risk_segment,
      gap_ratio,
      days_overdue,
    } = body;
 
    if (!to || !message) {
      return NextResponse.json(
        { error: "to and message are required" },
        { status: 400 }
      );
    }
 
    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;
 
    if (!username || !apiKey) {
      return NextResponse.json(
        { error: "Missing CLICKSEND_USERNAME or CLICKSEND_API_KEY in environment" },
        { status: 503 }
      );
    }
 
    // Strip ALL non-numeric characters, then normalise to E.164
    const digits = to.replace(/\D/g, "");
    let normalised: string;
 
    if (digits.startsWith("61") && digits.length === 11) {
      normalised = "+" + digits;
    } else if (digits.startsWith("0") && digits.length === 10) {
      normalised = "+61" + digits.slice(1);
    } else if (digits.length === 9) {
      normalised = "+61" + digits;
    } else {
      normalised = "+" + digits;
    }
 
    console.log(`[ClickSend] Sending to ${customer_name} (${normalised})`);
 
    const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");
 
    const response = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        messages: [
          {
            source: "api",
            body: message,
            to: normalised,
          },
        ],
      }),
    });
 
    const data = await response.json();
    console.log("[ClickSend] Raw response:", JSON.stringify(data));
 
    const success = response.ok && data.response_code === "SUCCESS";
    const msgResult = data.data?.messages?.[0];
 
    // ── Save to Supabase regardless of success/failure ─────────────────────
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
 
      await supabase.from("sms_outreach").insert({
        venue_id: venue_id || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID,
        customer_id: customer_id || null,
        customer_name: customer_name || null,
        phone: normalised,
        message,
        status: success ? (msgResult?.status || "sent") : "failed",
        message_id: msgResult?.message_id || null,
        cost: msgResult?.message_price ? parseFloat(msgResult.message_price) : null,
        markov_state: markov_state || null,
        risk_segment: risk_segment || null,
        gap_ratio: gap_ratio || null,
        days_overdue: days_overdue || null,
        sent_at: new Date().toISOString(),
      });
 
      console.log(`[Outreach] Logged SMS to ${customer_name} — status: ${success ? "sent" : "failed"}`);
    } catch (dbErr) {
      // Don't fail the whole request if logging fails
      console.error("[Outreach] Failed to log to Supabase:", dbErr);
    }
 
    if (!success) {
      return NextResponse.json(
        {
          error: data.response_msg || "ClickSend rejected the message",
          details: data,
        },
        { status: 400 }
      );
    }
 
    console.log(`[ClickSend] Sent to ${customer_name} (${normalised}): status ${msgResult?.status}`);
 
    return NextResponse.json({
      success: true,
      message_id: msgResult?.message_id,
      to: normalised,
      status: msgResult?.status,
      cost: msgResult?.message_price,
    });
  } catch (error: any) {
    console.error("[ClickSend] Unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}