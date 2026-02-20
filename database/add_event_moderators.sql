-- ============================================================
-- ADD MULTI-MODERATOR SUPPORT TO EVENTS
-- Allows organizers to delegate management rights
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_moderators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, player_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_event_moderators_event_id ON public.event_moderators(event_id);
CREATE INDEX IF NOT EXISTS idx_event_moderators_player_id ON public.event_moderators(player_id);

-- Enable RLS
ALTER TABLE public.event_moderators ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view event moderators"
    ON public.event_moderators FOR SELECT
    TO public
    USING (true);

-- Organizers can manage moderators
CREATE POLICY "Organizers can manage event moderators"
    ON public.event_moderators FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.events 
            WHERE events.id = event_moderators.event_id 
            AND events.organizer_id = auth.uid()
        )
    );

-- Also allow everyone to insert since we validate in app (similar to other tables in this project)
CREATE POLICY "Anyone can insert event moderators"
    ON public.event_moderators FOR INSERT
    TO public
    WITH CHECK (true);

-- Update events_with_participant_count view if needed (optional)
-- The current view is enough for now.
