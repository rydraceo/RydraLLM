-- =====================================================================
-- RYDRA BEAUTY-TECH MARKOV MODEL - SUPABASE MIGRATION
-- PART 2 OF 2: DATABASE FUNCTIONS
-- 
-- This creates all helper functions
-- Run this SECOND in Supabase SQL Editor (after Part 1)
-- =====================================================================
 
CREATE OR REPLACE FUNCTION refresh_transition_counts()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY transition_counts;
END;
$$ LANGUAGE plpgsql;
 
COMMENT ON FUNCTION refresh_transition_counts IS 'Refresh materialized view of transition counts';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- FUNCTION: EXTRACT TRANSITIONS FROM EVENTS
-- Run this as a scheduled job (e.g., every 15 minutes via Vercel Cron)
-- ─────────────────────────────────────────────────────────────────────
 
CREATE OR REPLACE FUNCTION extract_state_transitions()
RETURNS INTEGER AS $$
DECLARE
  rows_inserted INTEGER;
BEGIN
  -- Extract consecutive (from_state, to_state) pairs using LAG()
  WITH ranked AS (
    SELECT
      user_id,
      venue_id,
      event_id,
      state,
      occurred_at,
      barber_id,
      
      -- Previous state in chronological order per user
      LAG(state) OVER (
        PARTITION BY user_id, venue_id 
        ORDER BY occurred_at
      ) AS prev_state,
      
      LAG(event_id) OVER (
        PARTITION BY user_id, venue_id 
        ORDER BY occurred_at
      ) AS prev_event_id,
      
      LAG(occurred_at) OVER (
        PARTITION BY user_id, venue_id 
        ORDER BY occurred_at
      ) AS prev_at
      
    FROM events
    WHERE state IS NOT NULL
      AND occurred_at > NOW() - INTERVAL '90 days'  -- Only recent events
  )
  
  INSERT INTO state_transitions (
    user_id,
    venue_id,
    from_state,
    to_state,
    from_event_id,
    to_event_id,
    from_at,
    to_at,
    gap_hours,
    deal_active,
    barber_id
  )
  SELECT
    user_id,
    venue_id,
    prev_state AS from_state,
    state AS to_state,
    prev_event_id AS from_event_id,
    event_id AS to_event_id,
    prev_at AS from_at,
    occurred_at AS to_at,
    EXTRACT(EPOCH FROM (occurred_at - prev_at)) / 3600.0 AS gap_hours,
    FALSE AS deal_active,  -- Update separately based on deal context
    barber_id
  FROM ranked
  WHERE prev_state IS NOT NULL
    -- Only insert new transitions not already in table
    AND event_id NOT IN (
      SELECT to_event_id 
      FROM state_transitions 
      WHERE to_event_id IS NOT NULL
    )
  ON CONFLICT (user_id, from_event_id, to_event_id) DO NOTHING;
  
  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RETURN rows_inserted;
END;
$$ LANGUAGE plpgsql;
 
COMMENT ON FUNCTION extract_state_transitions IS 'Extract new transitions from events table using LAG()';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- FUNCTION: CLASSIFY CUSTOMER AS CHURNED
-- Run nightly to identify customers who have lapsed
-- ─────────────────────────────────────────────────────────────────────
 
CREATE OR REPLACE FUNCTION classify_churned_customers(
  p_venue_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  rows_classified INTEGER := 0;
  churned_user RECORD;
BEGIN
  -- Find customers who are overdue by 2.5× their personal average
  FOR churned_user IN
    SELECT
      cs.user_id,
      cs.venue_id,
      cs.days_since_last_visit,
      cs.avg_visit_gap_days,
      cs.gap_ratio
    FROM customer_scores cs
    JOIN venue_config vc ON cs.venue_id = vc.venue_id
    WHERE cs.venue_id = p_venue_id
      AND cs.current_state != 'X'  -- Not already churned
      AND cs.gap_ratio > 2.5       -- Lapsed threshold
      -- Don't re-classify recently classified customers
      AND NOT EXISTS (
        SELECT 1 FROM events e
        WHERE e.user_id = cs.user_id
          AND e.event_type = 'churn_classified'
          AND e.occurred_at > NOW() - INTERVAL '90 days'
      )
  LOOP
    -- Insert churn_classified event
    INSERT INTO events (
      user_id,
      venue_id,
      event_type,
      state,
      occurred_at,
      metadata
    ) VALUES (
      churned_user.user_id,
      churned_user.venue_id,
      'churn_classified',
      'X',
      NOW(),
      jsonb_build_object(
        'gap_ratio', churned_user.gap_ratio,
        'days_since_last', churned_user.days_since_last_visit,
        'avg_gap_days', churned_user.avg_visit_gap_days
      )
    );
    
    rows_classified := rows_classified + 1;
  END LOOP;
  
  RETURN rows_classified;
END;
$$ LANGUAGE plpgsql;
 
COMMENT ON FUNCTION classify_churned_customers IS 'Nightly sweep to classify lapsed customers as churned';
 
 
-- ─────────────────────────────────────────────────────────────────────
-- SEED DATA: INSERT ALKAMI CONFIG
-- Update the venue_id with your actual Alkami venue UUID
-- ─────────────────────────────────────────────────────────────────────
 
-- Example: Replace 'your-alkami-venue-id' with actual UUID
/*
INSERT INTO venue_config (
  venue_id,
  venue_type,
  avg_service_value_cents,
  margin_percent,
  delta,
  avg_visit_gap_days,
  churn_threshold_days,
  sms_cost_cents
) VALUES (
  'your-alkami-venue-id'::UUID,  -- REPLACE THIS
  'beauty',
  7000,    -- $70 (Senior Barber Skin Fade at Alkami)
  60.00,   -- 60% margin
  0.88,    -- Time discount factor
  28,      -- 4 weeks between cuts
  70,      -- 2.5× 28 = 70 day churn threshold
  7        -- $0.07 SMS cost
) ON CONFLICT (venue_id) DO UPDATE SET
  avg_service_value_cents = EXCLUDED.avg_service_value_cents,
  margin_percent = EXCLUDED.margin_percent,
  delta = EXCLUDED.delta,
  avg_visit_gap_days = EXCLUDED.avg_visit_gap_days,
  churn_threshold_days = EXCLUDED.churn_threshold_days,
  updated_at = NOW();
*/
 
 
-- ─────────────────────────────────────────────────────────────────────
-- GRANT PERMISSIONS
-- Ensure service role can access all tables
-- ─────────────────────────────────────────────────────────────────────
 
GRANT ALL ON events TO service_role;
GRANT ALL ON state_transitions TO service_role;
GRANT ALL ON customer_scores TO service_role;
GRANT ALL ON venue_config TO service_role;
GRANT SELECT ON transition_counts TO service_role;
 
GRANT EXECUTE ON FUNCTION refresh_transition_counts() TO service_role;
GRANT EXECUTE ON FUNCTION extract_state_transitions() TO service_role;
GRANT EXECUTE ON FUNCTION classify_churned_customers(UUID) TO service_role;
 
 
-- ─────────────────────────────────────────────────────────────────────
-- MIGRATION COMPLETE
-- ─────────────────────────────────────────────────────────────────────
 
DO $$
BEGIN
  RAISE NOTICE '✅ Rydra Beauty-Tech Markov Model migration complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Insert your venue config (uncomment and run seed data above)';
  RAISE NOTICE '2. Set up Vercel Cron to call extract_state_transitions() every 15 min';
  RAISE NOTICE '3. Set up nightly cron to call classify_churned_customers()';
  RAISE NOTICE '4. Start tracking events via POST /api/events/capture';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - events (customer behavioral events)';
  RAISE NOTICE '  - state_transitions (consecutive state pairs)';
  RAISE NOTICE '  - customer_scores (Markov predictions)';
  RAISE NOTICE '  - venue_config (beauty-tech parameters)';
  RAISE NOTICE '  - transition_counts (materialized view)';
END $$;