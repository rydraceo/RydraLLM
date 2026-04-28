// lib/db/schema.ts
// Complete schema for Rydra demand intelligence
 
import { pgTable, uuid, text, timestamp, integer, real, boolean } from 'drizzle-orm/pg-core';
 
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id').notNull(),
  auth_user_id: uuid('auth_user_id'),
  user_id: uuid('user_id'),
  
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow(),
  
  current_state: text('current_state'),
  gap_ratio: real('gap_ratio'),
  avg_visit_gap_hours: real('avg_visit_gap_hours'),
  total_orders: integer('total_orders').default(0),
  last_order_date: timestamp('last_order_date'),
});
 
export const customer_scores = pgTable('customer_scores', {
  score_id: uuid('score_id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  venue_id: uuid('venue_id').notNull(),
  
  current_state: text('current_state'),
  last_event_at: timestamp('last_event_at'),
  total_visits: integer('total_visits'),
  
  // Demand intelligence metrics
  gap_ratio: real('gap_ratio'),
  days_since_last_visit: integer('days_since_last_visit'),
  avg_visit_gap_days: integer('avg_visit_gap_days'),
  
  churn_score_5: real('churn_score_5'),
  churn_score_10: real('churn_score_10'),
  loyalty_score: real('loyalty_score'),
  clv_cents: integer('clv_cents'),
  intervention_value_cents: integer('intervention_value_cents'),
  
  updated_at: timestamp('updated_at').defaultNow(),
});
 
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  customer_id: uuid('customer_id').notNull(),
  user_id: uuid('user_id').notNull(),
  venue_id: uuid('venue_id').notNull(),
  discount_amount: integer('discount_amount'),
  discount_cents: integer('discount_cents'),
  expires_at: timestamp('expires_at'),
  used: boolean('used').default(false),
  created_at: timestamp('created_at').defaultNow(),
}); 