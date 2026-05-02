// lib/db/schema.ts
// FIXED: Proper types for Drizzle ORM with Supabase
 
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  decimal,
  real,
} from 'drizzle-orm/pg-core';
 
// Main customer_scores table (this is where your 2,130 records are!)
export const customer_scores = pgTable('customer_scores', {
  score_id: uuid('score_id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  venue_id: uuid('venue_id').notNull(),
  current_state: text('current_state'), // 'R', 'A', 'X', etc.
  last_event_at: timestamp('last_event_at', { withTimezone: true }),
  total_visits: integer('total_visits'),
  days_since_last_visit: integer('days_since_last_visit'),
  
  // Use real() instead of decimal() for these fields
  // real() returns numbers, decimal() returns strings
  avg_visit_gap_days: real('avg_visit_gap_days'),
  gap_ratio: real('gap_ratio'),
  churn_score_5: real('churn_score_5'),
  churn_score_10: real('churn_score_10'),
  loyalty_score: real('loyalty_score'),
  
  clv_cents: integer('clv_cents'),
  intervention_value_cents: integer('intervention_value_cents'),
  risk_segment: text('risk_segment'),
  intervention_recommended: boolean('intervention_recommended').default(false),
  preferred_barber_id: uuid('preferred_barber_id'),
  computed_at: timestamp('computed_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }),
});
 
// Customers table (base customer data - might be empty in your case)
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id').notNull(), // This should match venue_id
  user_id: uuid('user_id').notNull(),
  venue_id: uuid('venue_id').notNull(), // Added this field
  auth_user_id: uuid('auth_user_id'), // Added this field
  
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  
  current_state: text('current_state'),
  gap_ratio: real('gap_ratio'),
  avg_visit_gap_hours: real('avg_visit_gap_hours'),
  total_orders: integer('total_orders').default(0),
  last_order_date: timestamp('last_order_date', { withTimezone: true }),
  
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
 
// Promo codes table (for interventions)
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  customer_id: uuid('customer_id').notNull(),
  venue_id: uuid('venue_id').notNull(),
  discount_cents: integer('discount_cents').notNull(),
  max_uses: integer('max_uses').default(1),
  times_used: integer('times_used').default(0),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
 
// Bookings table (for MCP server - currently disabled)
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull(),
  customer_id: uuid('customer_id').notNull(),
  slot_id: uuid('slot_id').notNull(),
  status: text('status').notNull(), // 'pending', 'confirmed', 'cancelled'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
 
// Available slots table (for MCP server - currently disabled)
export const availableSlots = pgTable('available_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull(),
  start_time: timestamp('start_time', { withTimezone: true }).notNull(),
  end_time: timestamp('end_time', { withTimezone: true }).notNull(),
  is_booked: boolean('is_booked').default(false),
});