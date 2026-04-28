// lib/db/schema.ts
// CORRECTED SCHEMA - Matches your actual Supabase database
 
import { pgTable, uuid, text, timestamp, integer, real, boolean } from 'drizzle-orm/pg-core';
 
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  business_id: uuid('business_id').notNull(),  // ← FIXED: was venue_id
  auth_user_id: uuid('auth_user_id'),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow(),
  
  // Additional columns for demand intelligence
  current_state: text('current_state'), // B, D, C, O, R, X
  gap_ratio: real('gap_ratio'),
  avg_visit_gap_hours: real('avg_visit_gap_hours'),
  total_orders: integer('total_orders').default(0),
  last_order_date: timestamp('last_order_date'),
});
 
export const customer_scores = pgTable('customer_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  customer_id: uuid('customer_id').notNull(),
  business_id: uuid('business_id').notNull(),  // ← FIXED: was venue_id
  
  churn_score_5: real('churn_score_5'),
  churn_score_10: real('churn_score_10'),
  loyalty_score: real('loyalty_score'),
  clv_cents: integer('clv_cents'),
  intervention_value_cents: integer('intervention_value_cents'),
  
  updated_at: timestamp('updated_at').defaultNow(),
});
 
export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type'), // 'hospitality' or 'beauty'
  created_at: timestamp('created_at').defaultNow(),
});