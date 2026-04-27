// lib/db/schema.ts
import { pgTable, uuid, varchar, timestamp, integer, boolean, decimal, text } from 'drizzle-orm/pg-core';
 
// ─── VENUES ─────────────────────────────────────────────────────────────────
export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  vertical: varchar('vertical', { length: 50 }).notNull(), // 'hospitality' | 'beauty'
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
 
// ─── CUSTOMERS ─────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull().references(() => venues.id),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
 
// ─── CUSTOMER INTELLIGENCE (Markov predictions stored here) ─────────────────
export const customerIntelligence = pgTable('customer_intelligence', {
  id: uuid('id').primaryKey().defaultRandom(),
  customer_id: uuid('customer_id').notNull().references(() => customers.id),
  
  // Core Markov scores
  current_state: varchar('current_state', { length: 10 }).notNull(),
  churn_score_7d: decimal('churn_score_7d', { precision: 5, scale: 4 }),
  churn_score_14d: decimal('churn_score_14d', { precision: 5, scale: 4 }),
  churn_score_30d: decimal('churn_score_30d', { precision: 5, scale: 4 }),
  churn_score_90d: decimal('churn_score_90d', { precision: 5, scale: 4 }),
  
  // Enhanced predictions
  expected_days_to_churn: integer('expected_days_to_churn'),
  expected_days_to_next_visit: integer('expected_days_to_next_visit'),
  expected_annual_visits: decimal('expected_annual_visits', { precision: 5, scale: 2 }),
  
  // Behavioral metrics
  days_since_last_visit: integer('days_since_last_visit'),
  avg_gap_days: decimal('avg_gap_days', { precision: 6, scale: 2 }),
  gap_ratio: decimal('gap_ratio', { precision: 5, scale: 2 }),
  visit_frequency_trend: varchar('visit_frequency_trend', { length: 20 }),
  
  // CLV and loyalty
  clv_cents: integer('clv_cents'),
  loyalty_score: decimal('loyalty_score', { precision: 5, scale: 4 }),
  
  // Recommended action
  recommended_action: text('recommended_action'),
  discount_amount: integer('discount_amount'), // cents
  expected_roi: decimal('expected_roi', { precision: 5, scale: 2 }),
  
  // Metadata
  computed_at: timestamp('computed_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
 
// ─── AVAILABLE SLOTS (for MCP server) ──────────────────────────────────────
export const availableSlots = pgTable('available_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull().references(() => venues.id),
  barber_name: varchar('barber_name', { length: 255 }),
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time').notNull(),
  is_booked: boolean('is_booked').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
 
// ─── BOOKINGS ──────────────────────────────────────────────────────────────
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull().references(() => venues.id),
  customer_id: uuid('customer_id').notNull().references(() => customers.id),
  slot_id: uuid('slot_id').references(() => availableSlots.id),
  service_type: varchar('service_type', { length: 255 }),
  barber_name: varchar('barber_name', { length: 255 }),
  scheduled_at: timestamp('scheduled_at').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('confirmed'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
 
// ─── PROMO CODES ───────────────────────────────────────────────────────────
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  customer_id: uuid('customer_id').references(() => customers.id),
  discount_cents: integer('discount_cents').notNull(),
  max_uses: integer('max_uses').notNull().default(1),
  times_used: integer('times_used').notNull().default(0),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
 
// ─── CAMPAIGN TRACKING ─────────────────────────────────────────────────────
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  venue_id: uuid('venue_id').notNull().references(() => venues.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'auto_retention', 'manual', etc.
  sent_at: timestamp('sent_at').notNull().defaultNow(),
  total_sent: integer('total_sent').notNull().default(0),
  total_conversions: integer('total_conversions').notNull().default(0),
  total_revenue_cents: integer('total_revenue_cents').notNull().default(0),
  total_cost_cents: integer('total_cost_cents').notNull().default(0),
});
 