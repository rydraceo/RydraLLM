// lib/sms/templates.ts

export interface SMSTemplate {
  message: string;
  discountAmount?: number;
}

export function getSMSTemplate(
  riskSegment: string,
  customerName?: string,
  daysSince?: number,
  barberName?: string
): SMSTemplate {
  const name = customerName || 'there';
  const weeks = daysSince ? Math.floor(daysSince / 7) : 6; // Convert to weeks
  const barber = barberName || 'your barber';

  switch (riskSegment.toLowerCase()) {
    case 'at_risk':
      return {
        message: `Hey ${name}! It's been ${weeks} weeks since your last trim. Book with ${barber} this week - $10 off! Reply BOOK or call Alkami.`,
        discountAmount: 10,
      };

    case 'on_fence':
      return {
        message: `Hi ${name}! Ready for your next haircut? ${barber} has openings this week. Reply BOOK to schedule!`,
        discountAmount: 0,
      };

    case 'churned':
      return {
        message: `We miss you at Alkami, ${name}! Come back this month - $20 off your service. ${barber} is waiting! Reply BOOK or call us.`,
        discountAmount: 20,
      };

    case 'first_timer':
      return {
        message: `Hey ${name}! Thanks for visiting Alkami. Ready to book your next cut? ${barber} can fit you in this week. Reply BOOK!`,
        discountAmount: 0,
      };

    case 'loyal':
      return {
        message: `${name}, you're a legend! Thanks for being a regular at Alkami. ${barber} always looks forward to seeing you. 💈`,
        discountAmount: 0,
      };

    default:
      return {
        message: `Hey ${name}! Ready for your next visit to Alkami? Reply BOOK or call us to schedule!`,
        discountAmount: 0,
      };
  }
}
