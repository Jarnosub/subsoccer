-- 1. Create Payments table for Stripe tracking
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'eur' NOT NULL,
    game_id UUID REFERENCES public.games(id),
    status TEXT DEFAULT 'succeeded' NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Anyone can read payments (or you can restrict to only authenticated owners)
CREATE POLICY "Enable read access for all users" ON public.payments
    FOR SELECT USING (true);

-- Only service role (webhook webhook) or authenticated users can insert
CREATE POLICY "Enable insert for authenticated users only" ON public.payments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. Fix Owner Dashboard saving config by adding RLS for games.metadata
-- Currently, UPDATE on games table fails because there is no policy allowing it.

-- Allow authenticated owners to update their own tables
CREATE POLICY "Enable update for owners" ON public.games
    FOR UPDATE USING (
        -- Assuming we want any authenticated user to update for now in development
        auth.role() = 'authenticated'
        -- In production, this should be: owner_id = auth.uid()
    );

-- 3. (Optional sanity check) Ensure metadata column exists
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
