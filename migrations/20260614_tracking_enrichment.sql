-- Subsoccer Tracking Enrichment Migration
-- Adds session tracking, UTM parameters for marketing attribution
-- Run in Supabase SQL Editor

-- Session ID: groups events from the same browser session
ALTER TABLE public_tracking ADD COLUMN IF NOT EXISTS session_id TEXT;

-- UTM parameters: marketing attribution
ALTER TABLE public_tracking ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public_tracking ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public_tracking ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Index on session_id for fast grouping (venue dashboard queries)
CREATE INDEX IF NOT EXISTS idx_tracking_session_id ON public_tracking (session_id);

-- Index on utm_source for marketing analysis
CREATE INDEX IF NOT EXISTS idx_tracking_utm_source ON public_tracking (utm_source) WHERE utm_source IS NOT NULL;
