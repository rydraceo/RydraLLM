import { State } from './type';

// Complete 18-event STATE_MAP
// Every event the Rydra platform fires maps to one of 6 states
export const STATE_MAP: Record<string, State> = {
  // Browse state B — present but no intent
  session_start:     'B',
  page_view:         'B',
  menu_open:         'B',
  session_end:       'B',
  // DealView state D — evaluating
  item_detail_open:  'D',
  deal_view:         'D',
  special_view:      'D',
  offer_click:       'D',
  // Cart state C — high intent
  add_to_cart:       'C',
  cart_view:         'C',
  checkout_start:    'C',
  cart_abandon:      'C',  // Not X: re-engagement still possible
  payment_start:     'C',
  // Order state O — first conversion
  order_complete:    'O',
  booking_confirmed: 'O',  // Beauty: overridden to R if return visit
  // Return state R — loyal customer
  order_repeat:      'R',
  // Churn state X — absorbing
  churn_classified:  'X',
};

export function classifyEvent(
  event_type: string,
  is_return_visit: boolean = false
): State {
  // Beauty vertical: booking_confirmed on return visit = R not O
  if (event_type === 'booking_confirmed' && is_return_visit) return 'R';
  return STATE_MAP[event_type] ?? 'B'; // Safe default
}
