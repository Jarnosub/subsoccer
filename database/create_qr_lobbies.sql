-- Create table for QR tournament lobbies (ephemeral state)
CREATE TABLE IF NOT EXISTS public.qr_lobbies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'started', 'cancelled'))
);

-- Enable RLS for qr_lobbies
ALTER TABLE public.qr_lobbies ENABLE ROW LEVEL SECURITY;

-- Host can do anything with their own lobbies
CREATE POLICY "Hosts can manage their own lobbies" ON public.qr_lobbies
    FOR ALL
    USING (auth.uid() = host_id);

-- Anyone can read active lobbies (to join)
CREATE POLICY "Anyone can view lobbies" ON public.qr_lobbies
    FOR SELECT
    USING (true);

-- Create table for lobby participants
CREATE TABLE IF NOT EXISTS public.qr_lobby_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lobby_id UUID NOT NULL REFERENCES public.qr_lobbies(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL, -- Optional if registered
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for participants
ALTER TABLE public.qr_lobby_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can read participants (for the live screen)
CREATE POLICY "Anyone can view lobby participants" ON public.qr_lobby_participants
    FOR SELECT
    USING (true);

-- Anyone can insert a participant (unauthenticated guests via QR)
-- Note: Depends on if we are requiring logged-in players to join or allowing anonymous guests
CREATE POLICY "Anyone can join a lobby" ON public.qr_lobby_participants
    FOR INSERT
    WITH CHECK (true);

-- Host can delete participants
CREATE POLICY "Hosts can remove participants" ON public.qr_lobby_participants
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.qr_lobbies l 
            WHERE l.id = lobby_id 
            AND l.host_id = auth.uid()
        )
    );

-- Create Realtime publication for these tables
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE qr_lobbies, qr_lobby_participants;
