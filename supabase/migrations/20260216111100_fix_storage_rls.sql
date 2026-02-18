-- 1. Poistetaan vanhat säännöt varmuuden vuoksi
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public upload access" ON storage.objects;
DROP POLICY IF EXISTS "Public update access" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access" ON storage.objects;

-- 2. Sallitaan kaikkien lukea kuvia
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT TO public USING ( bucket_id = 'event-images' );

-- 3. Allow uploading for authenticated users
CREATE POLICY "Public upload access" ON storage.objects
FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'event-images' );

-- 4. Allow owners to update their own files
CREATE POLICY "Public update access" ON storage.objects
FOR UPDATE TO authenticated USING ( bucket_id = 'event-images' AND auth.uid() = owner );

-- 5. Allow owners to delete their own files
CREATE POLICY "Public delete access" ON storage.objects
FOR DELETE TO authenticated USING ( bucket_id = 'event-images' AND auth.uid() = owner );