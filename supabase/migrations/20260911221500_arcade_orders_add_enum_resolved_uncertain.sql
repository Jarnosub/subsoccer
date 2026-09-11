-- ==============================================================================
-- SUBSOCCER ARCADE — STEP 1: ADD 'resolved_uncertain' TO ENUM
-- Migration: 20260911221500_arcade_orders_add_enum_resolved_uncertain.sql
-- ==============================================================================

ALTER TYPE public.arcade_order_status
ADD VALUE IF NOT EXISTS 'resolved_uncertain';
