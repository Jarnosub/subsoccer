-- ============================================================
-- SECURE RLS POLICIES FOR SUBSOCCER
-- Locks down open beta policies for Events & Tournaments
-- ============================================================

-- 1. DROP EXISTING WIDE-OPEN POLICIES
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.events', r.policyname);
    END LOOP;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tournament_history' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tournament_history', r.policyname);
    END LOOP;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_registrations' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.event_registrations', r.policyname);
    END LOOP;
END $$;


-- 2. CREATE SECURE POLICIES FOR EVENTS
CREATE POLICY "Anyone can view events" 
    ON public.events FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create events" 
    ON public.events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Organizers can update own events" 
    ON public.events FOR UPDATE USING (organizer_id = auth.uid());

CREATE POLICY "Organizers can delete own events" 
    ON public.events FOR DELETE USING (organizer_id = auth.uid());


-- 3. CREATE SECURE POLICIES FOR TOURNAMENT_HISTORY
CREATE POLICY "Anyone can view tournament history" 
    ON public.tournament_history FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create tournaments" 
    ON public.tournament_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Organizers can update own tournaments" 
    ON public.tournament_history FOR UPDATE USING (organizer_id = auth.uid());

CREATE POLICY "Organizers can delete own tournaments" 
    ON public.tournament_history FOR DELETE USING (organizer_id = auth.uid());


-- 4. CREATE SECURE POLICIES FOR EVENT_REGISTRATIONS
CREATE POLICY "Anyone can view event registrations" 
    ON public.event_registrations FOR SELECT USING (true);

-- Allow authenticated users to insert registrations. 
-- In the UI, users click "Join", and their own auth.uid is sent as player_id. 
CREATE POLICY "Players can register for events" 
    ON public.event_registrations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Players can update own registration" 
    ON public.event_registrations FOR UPDATE USING (player_id = auth.uid());

CREATE POLICY "Players can delete own registration" 
    ON public.event_registrations FOR DELETE USING (player_id = auth.uid());

