// lib/sms/clicksend-service.ts - Using REST API directly

export interface SendSMSParams {
  to: string;
  message: string;
  userId?: string;
  venueId?: string;
}

export interface SendSMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  cost?: number;
}

export async function sendSMS({
  to,
  message,
}: SendSMSParams): Promise<SendSMSResult> {
  try {
    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;

    if (!username || !apiKey) {
      throw new Error('Missing ClickSend credentials');
    }

    const cleanNumber = to.replace('+', '');
    const from = process.env.CLICKSEND_SENDER_ID || 'ALKAMI';

    const payload = {
      messages: [
        {
          source: 'rydra',
          to: cleanNumber,
          body: message,
          from: from,
        },
      ],
    };

    console.log(`📤 Sending SMS to ${to}: "${message}"`);

    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');

    const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.response_code === 'SUCCESS' && data.data?.messages?.[0]) {
      const msgData = data.data.messages[0];
      
      console.log(`✅ SMS sent! Message ID: ${msgData.message_id}, Status: ${msgData.status}`);

      return {
        success: true,
        messageSid: msgData.message_id,
        cost: 0.08,
      };
    } else {
      throw new Error(data.response_msg || 'Unknown error from ClickSend');
    }
  } catch (error) {
    console.error('❌ SMS send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendBulkSMS(
  messages: SendSMSParams[]
): Promise<SendSMSResult[]> {
  console.log(`📤 Sending ${messages.length} SMS messages via ClickSend...`);
  const results = await Promise.all(messages.map(msg => sendSMS(msg)));
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Bulk SMS complete: ${successful} sent, ${failed} failed`);
  console.log(`💰 Total cost: $${(successful * 0.08).toFixed(2)} AUD`);
  return results;
}