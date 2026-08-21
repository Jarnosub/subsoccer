-- Migration: 20260820_create_subsoccer_feed.sql
-- Description: Table for curated Subsoccer community highlights & Instagram Reels

CREATE TABLE IF NOT EXISTS public.subsoccer_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    instagram_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    creator_handle TEXT DEFAULT '@subsoccer_official',
    category TEXT DEFAULT 'featured',
    is_featured BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    likes_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for blazing fast feed filtering
CREATE INDEX IF NOT EXISTS idx_subsoccer_feed_active_featured ON public.subsoccer_feed(is_active, is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subsoccer_feed_category ON public.subsoccer_feed(category);

-- Enable RLS
ALTER TABLE public.subsoccer_feed ENABLE ROW LEVEL SECURITY;

-- Allow public read of active items
DROP POLICY IF EXISTS "Public can view active subsoccer feed" ON public.subsoccer_feed;
CREATE POLICY "Public can view active subsoccer feed"
    ON public.subsoccer_feed
    FOR SELECT
    USING (is_active = true);

-- Allow insert from moderation tool
DROP POLICY IF EXISTS "Allow feed insert" ON public.subsoccer_feed;
CREATE POLICY "Allow feed insert"
    ON public.subsoccer_feed
    FOR INSERT
    WITH CHECK (true);

-- Allow update from moderation tool
DROP POLICY IF EXISTS "Allow feed update" ON public.subsoccer_feed;
CREATE POLICY "Allow feed update"
    ON public.subsoccer_feed
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Allow delete from moderation tool
DROP POLICY IF EXISTS "Allow feed delete" ON public.subsoccer_feed;
CREATE POLICY "Allow feed delete"
    ON public.subsoccer_feed
    FOR DELETE
    USING (true);

-- Seed initial curated Subsoccer highlights / reels
INSERT INTO public.subsoccer_feed (url, instagram_id, title, creator_handle, category, is_featured, is_active, sort_order)
VALUES
    ('https://www.instagram.com/reel/C8qL7v-sJ_H/', 'C8qL7v-sJ_H', 'Unbelievable rally at Subsoccer World Tour! 🔥⚽', '@subsoccer_official', 'featured', true, true, 1),
    ('https://www.instagram.com/reel/C7-X5zTsp9x/', 'C7-X5zTsp9x', 'Insane trick shot winner in extra time! 🎯', '@subsoccer_official', 'featured', true, true, 2),
    ('https://www.instagram.com/reel/C69k4uFsA_w/', 'C69k4uFsA_w', 'Fastest goal in Subsoccer history?! ⚡', '@subsoccer_official', 'featured', true, true, 3)
ON CONFLICT DO NOTHING;
