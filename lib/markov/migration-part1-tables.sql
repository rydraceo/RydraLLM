-- =====================================================================
-- RYDRA BEAUTY-TECH MARKOV MODEL - SUPABASE MIGRATION
-- PART 1 OF 2: DATABASE TABLES
-- 
-- This creates all database tables and views
-- Run this FIRST in Supabase SQL Editor
-- =====================================================================
 
-- ─────────────────────────────────────────────────────────────────────
-- TABLE 1: EVENTS
-- Stores every customer action with classified Markov state
-- ─────────────────────────────────────────────────────────────────────
 
CREATE TABLE IF NOT EXISTS events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL,
  
  -- Event classification
  event_type TEXT NOT NULL,
  state TEXT CHECK (state IN ('B', 'V', 'A', 'C', 'R', 'X')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Beauty-specific fields
  barber_id UUID,
  service_id UUID,
  booking_id UUID,
  appointment_datetime TIMESTAMPTZ,
  deposit_amount_cents INTEGER,
  is_return_visit BOOLEAN DEFAULT FALSE,
  
  -- Standard tracking
  session_id TEXT,
  device_type TEXT,
  source TEXT,
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);
 
-- Indexes for performance
CREATE INDEX idx_events_user_occurred ON events(user_id, occurred_at DESC);
CREATE INDEX idx_events_venue_state ON events(venue_id, state);
CREATE INDEX idx_events_booking ON events(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_events_state_occurred ON events(state, occurred_at DESC);
 
COMMENT ON TABLE events IS 'Customer behavioral events classified into Markov states';
COMMENT ON COLUMN events.state IS 'B=Browse, V=Viewing, A=Appointment, C=Completed, R=Return, X=Churn';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- TABLE 2: STATE_TRANSITIONS
-- Consecutive (from_state → to_state) pairs extracted via LAG()
-- ─────────────────────────────────────────────────────────────────────
 
CREATE TABLE IF NOT EXISTS state_transitions (
  transition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  
  -- Transition pair
  from_state TEXT NOT NULL CHECK (from_state IN ('B', 'V', 'A', 'C', 'R', 'X')),
  to_state TEXT NOT NULL CHECK (to_state IN ('B', 'V', 'A', 'C', 'R', 'X')),
  
  -- Event linkage
  from_event_id UUID REFERENCES events(event_id),
  to_event_id UUID REFERENCES events(event_id),
  from_at TIMESTAMPTZ NOT NULL,
  to_at TIMESTAMPTZ NOT NULL,
  
  -- Timing analysis
  gap_hours NUMERIC(10,2),
  gap_days INTEGER GENERATED ALWAYS AS (FLOOR(gap_hours / 24.0)) STORED,
  
  -- Context
  deal_active BOOLEAN DEFAULT FALSE,
  barber_id UUID,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, from_event_id, to_event_id)
);
 
-- Indexes for matrix building
CREATE INDEX idx_transitions_venue_matrix ON state_transitions(venue_id, from_state, to_state);
CREATE INDEX idx_transitions_user_chronological ON state_transitions(user_id, to_at DESC);
CREATE INDEX idx_transitions_deal_split ON state_transitions(venue_id, deal_active);
CREATE INDEX idx_transitions_barber ON state_transitions(barber_id) WHERE barber_id IS NOT NULL;
 
COMMENT ON TABLE state_transitions IS 'Consecutive state pairs for building transition probability matrix';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- TABLE 3: CUSTOMER_SCORES
-- Markov predictions per customer: churn risk, loyalty, CLV
-- ─────────────────────────────────────────────────────────────────────
 
CREATE TABLE IF NOT EXISTS customer_scores (
  score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  
  -- Current state
  current_state TEXT NOT NULL CHECK (current_state IN ('B', 'V', 'A', 'C', 'R', 'X')),
  last_event_at TIMESTAMPTZ NOT NULL,
  
  -- Visit pattern
  total_visits INTEGER DEFAULT 0,
  days_since_last_visit INTEGER,
  avg_visit_gap_days NUMERIC(6,2),
  gap_ratio NUMERIC(6,2),  -- days_since / avg_gap (critical metric!)
  
  -- Markov predictions
  churn_score_5 NUMERIC(5,4),   -- 5-step horizon churn probability
  churn_score_10 NUMERIC(5,4),  -- 10-step horizon churn probability
  loyalty_score NUMERIC(5,4),   -- Probability of reaching Return before Churn
  clv_cents INTEGER,            -- Customer Lifetime Value in cents
  intervention_value_cents INTEGER,  -- ΔV: value of sending discount
  
  -- Risk classification
  risk_segment TEXT CHECK (risk_segment IN ('at_risk', 'on_the_fence', 'loyal', 'churned')),
  intervention_recommended BOOLEAN DEFAULT FALSE,
  intervention_priority TEXT CHECK (intervention_priority IN ('high', 'medium', 'low', 'none')),
  
  -- Preferences
  preferred_barber_id UUID,
  preferred_service_id UUID,
  
  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, venue_id)
);
 
-- Indexes for dashboard queries
CREATE INDEX idx_scores_venue_segment ON customer_scores(venue_id, risk_segment);
CREATE INDEX idx_scores_intervention ON customer_scores(venue_id, intervention_recommended) 
  WHERE intervention_recommended = TRUE;
CREATE INDEX idx_scores_churn ON customer_scores(venue_id, churn_score_5 DESC);
CREATE INDEX idx_scores_clv ON customer_scores(venue_id, clv_cents DESC);
CREATE INDEX idx_scores_gap_ratio ON customer_scores(venue_id, gap_ratio DESC);
 
COMMENT ON TABLE customer_scores IS 'Markov model predictions and risk classifications per customer';
COMMENT ON COLUMN customer_scores.gap_ratio IS 'How overdue customer is: days_since / avg_gap. >2.5 = churned';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- TABLE 4: VENUE_CONFIG
-- Beauty-tech specific parameters for CLV and churn calculations
-- ─────────────────────────────────────────────────────────────────────
 
CREATE TABLE IF NOT EXISTS venue_config (
  venue_id UUID PRIMARY KEY,
  venue_type TEXT DEFAULT 'beauty' CHECK (venue_type IN ('hospitality', 'beauty')),
  
  -- Revenue parameters
  avg_service_value_cents INTEGER NOT NULL,  -- e.g., 7000 for $70
  margin_percent NUMERIC(4,2) DEFAULT 60.00, -- e.g., 60.0%
  
  -- Computed profit per visit
  m_cents INTEGER GENERATED ALWAYS AS (
    ROUND(avg_service_value_cents * (margin_percent / 100.0))
  ) STORED,
  
  -- Time discount factor (future revenue worth less)
  delta NUMERIC(4,2) DEFAULT 0.88,  -- Beauty: 0.88, Hospitality: 0.92
  
  -- Visit frequency parameters
  avg_visit_gap_days INTEGER DEFAULT 28,      -- 4 weeks typical for haircuts
  churn_threshold_days INTEGER DEFAULT 70,    -- 2.5× 28 = 70 days
  
  -- Communication costs
  sms_cost_cents INTEGER DEFAULT 7,  -- $0.07 AUD per SMS
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
 
COMMENT ON TABLE venue_config IS 'Venue-specific parameters for Markov calculations';
COMMENT ON COLUMN venue_config.m_cents IS 'Profit margin per visit = avg_value × margin_percent';
COMMENT ON COLUMN venue_config.delta IS 'Time discount factor: lower = heavier discounting of future revenue';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- TABLE 5: TRANSITION_COUNTS (Materialized View)
-- Aggregated transition counts for fast matrix building
-- ─────────────────────────────────────────────────────────────────────
 
CREATE MATERIALIZED VIEW transition_counts AS
SELECT
  venue_id,
  from_state,
  to_state,
  deal_active,
  COUNT(*) as transition_count,
  AVG(gap_hours) as avg_gap_hours,
  MIN(gap_hours) as min_gap_hours,
  MAX(gap_hours) as max_gap_hours,
  STDDEV(gap_hours) as stddev_gap_hours
FROM state_transitions
GROUP BY venue_id, from_state, to_state, deal_active;
 
-- Unique index for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_transition_counts_key 
  ON transition_counts(venue_id, from_state, to_state, deal_active);
 
COMMENT ON MATERIALIZED VIEW transition_counts IS 'Aggregated counts for building P matrix';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- FUNCTION: REFRESH TRANSITION COUNTS
-- Call this after inserting new transitions
-- ─────────────────────────────────────────────────────────────────────
 