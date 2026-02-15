-- ============================================================
-- STORAGE RLS FIX: Allow Public Access to event-images
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Poistetaan vanhat mahdollisesti estävät policyt storage-skeemasta.
-- Koska sovelluksesi käyttää custom-authia, Supabase Storage näkee 
-- pyynnöt usein 'public' (anon) roolissa.

BEGIN;

-- Poistetaan tunnetut vanhat policyt storage.objects-taulusta
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public upload access" ON storage.objects;
DROP POLICY IF EXISTS "Public update access" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Event Images - Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Event Images - Read" ON storage.objects;
DROP POLICY IF EXISTS "Public Select" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- 2. Luodaan uudet, sallivat policyt 'public'-roolille (anon)
CREATE POLICY "Public Select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'event-images');
CREATE POLICY "Public Insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'event-images');
CREATE POLICY "Public Update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'event-images');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE TO public USING (bucket_id = 'event-images');

-- 3. Varmistetaan että bucket on merkitty julkiseksi
UPDATE storage.buckets SET public = true WHERE id = 'event-images';

COMMIT;