-- Add image_url and privacy_mode to games table for Venue Cards
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS privacy_mode TEXT DEFAULT 'private';

-- Create Storage bucket for Venue Images (if it doesn't already exist)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('venue_images', 'venue_images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the 'venue_images' bucket
DROP POLICY IF EXISTS "Venue images are publicly accessible." ON storage.objects;
CREATE POLICY "Venue images are publicly accessible."
ON storage.objects FOR SELECT
USING ( bucket_id = 'venue_images' );

DROP POLICY IF EXISTS "Authenticated users can upload venue images" ON storage.objects;
CREATE POLICY "Authenticated users can upload venue images"
ON storage.objects FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    bucket_id = 'venue_images'
);

DROP POLICY IF EXISTS "Users can update their own venue images" ON storage.objects;
CREATE POLICY "Users can update their own venue images"
ON storage.objects FOR UPDATE
USING (
    auth.role() = 'authenticated' AND 
    bucket_id = 'venue_images' AND 
    auth.uid() = owner
);

DROP POLICY IF EXISTS "Users can delete their own venue images" ON storage.objects;
CREATE POLICY "Users can delete their own venue images"
ON storage.objects FOR DELETE
USING (
    auth.role() = 'authenticated' AND 
    bucket_id = 'venue_images' AND 
    auth.uid() = owner
);

-- Games table policies for hardware management (Configure & Photo)
DROP POLICY IF EXISTS "Owners can update their own games" ON public.games;
CREATE POLICY "Owners can update their own games"
ON public.games FOR UPDATE
USING ( auth.uid() = owner_id );

DROP POLICY IF EXISTS "Owners can insert their own games" ON public.games;
CREATE POLICY "Owners can insert their own games"
ON public.games FOR INSERT
WITH CHECK ( auth.uid() = owner_id );
