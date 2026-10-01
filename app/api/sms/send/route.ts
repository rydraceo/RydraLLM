import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveRecipient, resolveRecipientByPhone, appendOptOut, type SkipReason } from "@/lib/sms/guard";

const HTTP_STATUS: Record<SkipReason, number> = {
  not_found: 404, invalid_number: 409, opted_out: 409, held: 409, no_optout_token: 500, send_failed: 502,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, message, customer_name, venue_id, markov_state, risk_segment, gap_ratio, days_overdue } = body;
    // "to" is accepted only as a LOOKUP key. It must match a known client's number, and every
    // opt-out / hold / suppression check still applies. Arbitrary numbers can never be texted.

    if ((!customer_id && !body.to) || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "customer_id (or a client's phone number) and message are required" }, { status: 400 });
    }
    if (/[^\x20-\x7E\n]/.test(message)) {
      return NextResponse.json({ error: "Message contains unsupported characters. Use plain text only." }, { status: 400 });
    }

    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;
    if (!username || !apiKey) {
      return NextResponse.json({ error: "Missing CLICKSEND_USERNAME or CLICKSEND_API_KEY in environment" }, { status: 503 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Guard: opt-out, hold, valid AU mobile, suppression list ─────────────
    const r = customer_id
      ? await resolveRecipient(supabase, String(customer_id))
      : await resolveRecipientByPhone(supabase, String(body.to ?? ""));
    if (!r.ok) {
      return NextResponse.json(
        { error: `Not sent: ${r.reason.replace(/_/g, " ")}`, reason: r.reason },
        { status: HTTP_STATUS[r.reason] ?? 409 }
      );
    }

    // ── Double-click protection: same number, last 10 minutes ───────────────
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await supabase.from("sms_outreach")
      .select("phone").eq("phone", r.to).neq("status", "failed").gte("sent_at", since).limit(1);
    if (recent && recent.length > 0) {
      return NextResponse.json(
        { error: "A message was already sent to this number in the last 10 minutes.", reason: "recently_sent" },
        { status: 429 }
      );
    }

    // ── Daily limit + cooldown (server-side: the browser cannot bypass these) ───
    const venueKey = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
    const cap = Math.max(1, parseInt(process.env.SMS_DAILY_CAP ?? "50", 10) || 50);
    if (venueKey) {
      const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: sent24 } = await supabase.from("sms_outreach")
        .select("phone", { count: "exact", head: true })
        .eq("venue_id", venueKey).neq("status", "failed").gte("sent_at", since24);
      if ((sent24 ?? 0) >= cap) {
        return NextResponse.json({ error: `Daily limit of ${cap} texts reached. Try again tomorrow.`, reason: "daily_cap" }, { status: 429 });
      }
    }
    if (body.bulk === true) {
      const coolDays = Math.max(0, parseInt(process.env.SMS_COOLDOWN_DAYS ?? "7", 10) || 7);
      const sinceCool = new Date(Date.now() - coolDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: cooled } = await supabase.from("sms_outreach")
        .select("phone").eq("customer_id", r.customerId).neq("status", "failed").gte("sent_at", sinceCool).limit(1);
      if (cooled && cooled.length > 0) {
        return NextResponse.json({ error: `This client was texted in the last ${coolDays} days.`, reason: "cooldown" }, { status: 429 });
      }
    }

    // ── Append the mandatory opt-out line, then enforce a single SMS segment ─
    const finalBody = appendOptOut(message.trim(), r.token);
    if (!finalBody) {
      return NextResponse.json({ error: "SMS_OPTOUT_BASE_URL is not configured" }, { status: 503 });
    }
    if (finalBody.length > 160) {
      return NextResponse.json(
        { error: `Message is ${finalBody.length} characters with the opt-out link. Maximum is 160.`, reason: "too_long" },
        { status: 400 }
      );
    }

    console.log(`[ClickSend] Sending to ${customer_name ?? "customer"} (${r.to})`);
    const credentials = Buffer.from(`${username}:${apiKey}`).toString("base64");

    const response = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}` },
      body: JSON.stringify({ messages: [{ source: "api", body: finalBody, to: r.to }] }),
    });

    const data = await response.json();
    console.log("[ClickSend] Raw response:", JSON.stringify(data));

    // ClickSend can return an overall SUCCESS while the individual message failed
    // (e.g. INVALID_RECIPIENT), so check the per-message status too.
    const msgResult = data.data?.messages?.[0];
    const msgStatus = String(msgResult?.status ?? "");
    const accepted = /^(SUCCESS|QUEUED|SCHEDULED)/i.test(msgStatus);
    const success = response.ok && data.response_code === "SUCCESS" && accepted;

    // ── Log every attempt ───────────────────────────────────────────────────
    try {
      await supabase.from("sms_outreach").insert({
        venue_id: venueKey || venue_id,
        customer_id: r.customerId,
        customer_name: customer_name || null,
        phone: r.to,
        message: finalBody,
        status: success ? (msgResult?.status || "sent") : "failed",
        message_id: msgResult?.message_id || null,
        cost: msgResult?.message_price ? parseFloat(msgResult.message_price) : null,
        markov_state: markov_state || null,
        risk_segment: risk_segment || null,
        gap_ratio: gap_ratio || null,
        days_overdue: days_overdue || null,
        sent_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error("[Outreach] Failed to log to Supabase:", dbErr);
    }

    if (!success) {
      return NextResponse.json(
        {
          error: !accepted && msgStatus ? `ClickSend status: ${msgStatus}` : (data.response_msg || "ClickSend rejected the message"),
          details: data,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: msgResult?.message_id,
      status: msgResult?.status,
      cost: msgResult?.message_price,
    });
  } catch (error: any) {
    console.error("[ClickSend] Unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}