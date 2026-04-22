// lib/markov/classify.beauty.ts
/**
 * Event Classification for Beauty-Tech / Barbershops
 * Maps platform events to Markov states
 */
 
import { BeautyState } from './type.beauty';
 
/**
 * Complete event → state mapping for barbershop booking platform
 * Every event the platform fires must map to exactly one state
 */
export const BEAUTY_EVENT_MAP: Record<string, BeautyState> = {
  // ─── BROWSE STATE (B) ───────────────────────────────────────────
  // Customer is present but showing no specific intent
  'session_start': 'B',
  'page_view': 'B',
  'services_page_view': 'B',
  'home_page_view': 'B',
  'pricing_view': 'B',
  'gallery_view': 'B',
  'about_view': 'B',
  'contact_view': 'B',
  'qr_code_scan': 'B',
  'instagram_link_click': 'B',
  
  // ─── VIEWING STATE (V) ──────────────────────────────────────────
  // Customer evaluating specific barbers or services
  'barber_profile_view': 'V',
  'service_detail_view': 'V',
  'availability_check': 'V',
  'calendar_open': 'V',
  'time_slot_click': 'V',
  'time_slot_hover': 'V',
  'pricing_calculator': 'V',
  'service_comparison': 'V',
  'add_on_view': 'V',
  
  // ─── APPOINTMENT BOOKED STATE (A) ───────────────────────────────
  // Customer has committed to a booking
  'booking_created': 'A',
  'deposit_paid': 'A',
  'booking_confirmed': 'A',
  'confirmation_email_sent': 'A',
  'confirmation_sms_sent': 'A',
  'reminder_24hr': 'A',
  'reminder_2hr': 'A',
  'appointment_rescheduled': 'A',
  
  // ─── COMPLETED STATE (C) ────────────────────────────────────────
  // First appointment completed successfully
  'appointment_completed': 'C',
  'service_completed': 'C',
  'checkout_completed': 'C',
  'payment_received': 'C',
  'review_requested': 'C',
  
  // ─── RETURN STATE (R) ───────────────────────────────────────────
  // Repeat customer (2nd+ visit)
  'rebook_at_chair': 'R',
  'repeat_booking_created': 'R',
  'loyalty_reward_claimed': 'R',
  'membership_active': 'R',
  
  // ─── CHURN STATE (X) ────────────────────────────────────────────
  // Customer has lapsed beyond recovery threshold
  'churn_classified': 'X',
  'no_show_repeated': 'X',  // 2+ consecutive no-shows
  'account_inactive': 'X',
  'unsubscribe_sms': 'X',
};
 
/**
 * Classify an event into a Markov state
 * 
 * Special handling for beauty-tech:
 * - booking_created on return visit → R (not A)
 * - appointment_completed on 2nd+ visit → R (not C)
 * 
 * @param event_type - The event type fired by the platform
 * @param is_return_visit - Whether this is a repeat customer
 * @param total_completed_visits - How many appointments they've completed
 * @returns The Markov state
 */
export function classifyBeautyEvent(
  event_type: string,
  is_return_visit: boolean = false,
  total_completed_visits: number = 0
): BeautyState {
  
  // Override Rule 1: Appointment completion on 2nd+ visit = Return
  if (event_type === 'appointment_completed' && total_completed_visits >= 1) {
    return 'R';
  }
  
  // Override Rule 2: Booking by returning customer = Return
  if (
    (event_type === 'booking_created' || 
     event_type === 'booking_confirmed' ||
     event_type === 'deposit_paid') && 
    is_return_visit
  ) {
    return 'R';
  }
  
  // Override Rule 3: Rebook at chair always = Return (regardless of visit count)
  if (event_type === 'rebook_at_chair') {
    return 'R';
  }
  
  // Default mapping
  const mapped_state = BEAUTY_EVENT_MAP[event_type];
  
  // Fallback: unmapped events default to Browse
  return mapped_state ?? 'B';
}
 
/**
 * Determine if a customer qualifies as "return visit"
 * 
 * Return visit definition:
 * - At least 1 completed appointment in history
 * - OR has an active membership
 * - OR has claimed a loyalty reward
 * 
 * @param total_completed_appointments - Count of completed appts
 * @param has_membership - Whether customer has active membership
 * @param has_claimed_loyalty - Whether customer has claimed loyalty reward
 * @returns True if this is a return customer
 */
export function isReturnCustomer(
  total_completed_appointments: number,
  has_membership: boolean = false,
  has_claimed_loyalty: boolean = false
): boolean {
  return (
    total_completed_appointments >= 1 ||
    has_membership ||
    has_claimed_loyalty
  );
}
 
/**
 * Validate state transition is logically possible
 * Some transitions are impossible in beauty-tech flow
 * 
 * @param from_state - Starting state
 * @param to_state - Ending state
 * @returns True if transition is valid
 */
export function isValidBeautyTransition(
  from_state: BeautyState,
  to_state: BeautyState
): boolean {
  
  // X is absorbing: cannot leave Churn state in current cycle
  if (from_state === 'X') {
    return to_state === 'X';
  }
  
  // Browse cannot directly become Return
  if (from_state === 'B' && to_state === 'R') {
    return false;
  }
  
  // Viewing cannot directly become Return
  if (from_state === 'V' && to_state === 'R') {
    return false;
  }
  
  // Appointment cannot stay in Appointment
  // (Must complete or no-show)
  if (from_state === 'A' && to_state === 'A') {
    return false;
  }
  
  // All other transitions possible
  return true;
}
 
/**
 * Get human-readable state description
 */
export function getStateDescription(state: BeautyState): string {
  const descriptions: Record<BeautyState, string> = {
    'B': 'Browsing services - no specific intent yet',
    'V': 'Viewing barbers/times - considering booking',
    'A': 'Appointment booked - committed with deposit',
    'C': 'First service completed - conversion window active',
    'R': 'Returning customer - high lifetime value',
    'X': 'Churned - lapsed beyond recovery threshold'
  };
  
  return descriptions[state];
}
 
/**
 * Get typical events that trigger each state
 */
export function getStateTriggerEvents(state: BeautyState): string[] {
  const triggers: Record<BeautyState, string[]> = {
    'B': ['session_start', 'page_view', 'qr_code_scan'],
    'V': ['barber_profile_view', 'availability_check', 'service_detail_view'],
    'A': ['booking_created', 'deposit_paid', 'booking_confirmed'],
    'C': ['appointment_completed', 'checkout_completed'],
    'R': ['rebook_at_chair', 'repeat_booking_created'],
    'X': ['churn_classified', 'no_show_repeated']
  };
  
  return triggers[state];
}
 
/**
 * Export mapping for use in database seeding
 */
export function getAllEventMappings(): Array<{
  event_type: string;
  default_state: BeautyState;
  description: string;
}> {
  return Object.entries(BEAUTY_EVENT_MAP).map(([event_type, state]) => ({
    event_type,
    default_state: state,
    description: getStateDescription(state)
  }));
}