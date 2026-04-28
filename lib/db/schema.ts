// lib/db/schema.ts
// FINAL SCHEMA - Matches your actual Supabase database
 
import { pgTable, uuid, text, timestamp, integer, real } from 'drizzle-orm/pg-core';
 
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id').notNull(),
  auth_user_id: uuid('auth_user_id'),
  user_id: uuid('user_id'),  // Links to customer_scores
  
  // Basic info
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow(),
  
  // Demand intelligence columns (added via migration)
  current_state: text('current_state'), // B, D, C, O, R, X
  gap_ratio: real('gap_ratio'),
  avg_visit_gap_hours: real('avg_visit_gap_hours'),
  total_orders: integer('total_orders').default(0),
  last_order_date: timestamp('last_order_date'),
});
 
export const customer_scores = pgTable('customer_scores', {
  score_id: uuid('score_id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),       // Links to customers.user_id
  venue_id: uuid('venue_id').notNull(),     // Filter by venue
  
  current_state: text('current_state'),
  last_event_at: timestamp('last_event_at'),
  total_visits: integer('total_visits'),
  
  // Scoring metrics
  churn_score_5: real('churn_score_5'),
  churn_score_10: real('churn_score_10'),
  loyalty_score: real('loyalty_score'),
  clv_cents: integer('clv_cents'),
  intervention_value_cents: integer('intervention_value_cents'),
  
  updated_at: timestamp('updated_at').defaultNow(),
});