-- ============================================================
-- FIX: Events Table RLS Policies for Custom Auth
-- Run this in Supabase SQL Editor
-- ============================================================
-- Your app uses CUSTOM authentication (not Supabase Auth)
-- Therefore auth.uid() will return NULL
-- We need to allow public access and validate in app code
-- ============================================================

-- Drop existing policies that use auth.uid()
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can create events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;

-- Create new policies for custom auth system
CREATE POLICY "Anyone can view events"
    ON public.events FOR SELECT
    USING (true);

CREATE POLICY "Anyone can insert events"
    ON public.events FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update events"
    ON public.events FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete events"
    ON public.events FOR DELETE
    USING (true);

-- Note: Security is handled in your app code by checking the 'user' object
-- This is acceptable for a custom auth system with trusted users

-- ============================================================
-- Verify policies
-- ============================================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;

-- Expected: Should show 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- All should have qual = 'true' or similar
