// lib/sms/clicksend-service.ts
const ClickSend = require('clicksend');

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

function getClickSendClient() {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;

  if (!username || !apiKey) {
    throw new Error('Missing ClickSend credentials. Check .env.local file.');
  }

  const api = new ClickSend.SMSApi(username, apiKey);
  return api;
}

export async function sendSMS({
  to,
  message,
  userId,
  venueId,
}: SendSMSParams): Promise<SendSMSResult> {
  try {
    const smsApi = getClickSendClient();

    // Format phone number - ClickSend needs it without the + sign
    const cleanNumber = to.replace('+', '');

    const smsMessage = new ClickSend.SmsMessage();
    smsMessage.source = 'rydra';
    smsMessage.to = cleanNumber;
    smsMessage.body = message;
    smsMessage.from = process.env.CLICKSEND_SENDER_ID || 'ALKAMI';

    const smsCollection = new ClickSend.SmsMessageCollection();
    smsCollection.messages = [smsMessage];

    console.log(`📤 Sending SMS to ${to}: "${message}"`);

    const response = await smsApi.smsSendPost(smsCollection);

    if (response.body.response_code === 'SUCCESS') {
      const msgData = response.body.data.messages[0];
      
      console.log(`✅ SMS sent! Message ID: ${msgData.message_id}, Status: ${msgData.status}`);

      return {
        success: true,
        messageSid: msgData.message_id,
        cost: 0.08, // $0.08 AUD per SMS
      };
    } else {
      throw new Error(response.body.response_msg || 'Unknown error from ClickSend');
    }
  } catch (error) {
    console.error('❌ SMS send error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      error: errorMessage,
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