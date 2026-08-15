-- Allow anonymous users to insert community games (unverified, no serial number)
-- This enables the post-tournament "Add to Map" feature
CREATE POLICY "Anyone can add community games"
    ON public.games FOR INSERT
    TO public
    WITH CHECK (
        verified = false 
        AND serial_number IS NULL 
        AND is_public = true
    );
