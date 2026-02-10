-- ============================================================
-- SUBSOCCER EVENT IMAGES STORAGE SETUP
-- Storage Bucket & Policies Configuration
-- ALL STEPS DONE VIA SUPABASE DASHBOARD UI
-- ============================================================

-- ⚠️ NOTE: Storage buckets and policies CANNOT be created via SQL!
-- You MUST use the Supabase Dashboard UI for all storage setup.

-- ============================================================
-- STEP-BY-STEP SETUP INSTRUCTIONS
-- ============================================================
-- STEP 1: CREATE STORAGE BUCKET
-- ============================================================
-- 1. Open Supabase Dashboard → Storage
-- 2. Click "New bucket" button
-- 3. Enter bucket details:
--    • Bucket name: event-images
--    • Public bucket: ✅ YES (checked)
--    • File size limit: 5242880 (5MB in bytes)
--    • Allowed MIME types: image/jpeg, image/png, image/webp
-- 4. Click "Create bucket"


-- STEP 2: CREATE STORAGE POLICIES (via UI)
-- ============================================================
-- 1. Go to Storage → event-images bucket
-- 2. Click "Policies" tab
-- 3. Click "New Policy"

-- POLICY 1: Public Read Access
--   • Policy name: Public Event Images - Read
--   • Allowed operation: SELECT
--   • Target roles: anon
--   • USING expression: true
--   • Click "Review" → "Save policy"

-- POLICY 2: Authenticated Upload
--   • Policy name: Authenticated Event Images - Upload  
--   • Allowed operation: INSERT
--   • Target roles: authenticated
--   • WITH CHECK expression: true
--   • Click "Review" → "Save policy"

-- POLICY 3: Authenticated Update (optional)
--   • Policy name: Authenticated Event Images - Update
--   • Allowed operation: UPDATE
--   • Target roles: authenticated
--   • USING expression: true
--   • Click "Review" → "Save policy"

-- POLICY 4: Authenticated Delete
--   • Policy name: Authenticated Event Images - Delete
--   • Allowed operation: DELETE
--   • Target roles: authenticated
--   • USING expression: true
--   • Click "Review" → "Save policy"


-- STEP 3: VERIFICATION (run in SQL Editor)
-- ============================================================
-- STEP 3: VERIFICATION (run in SQL Editor)
-- ============================================================

-- Check if bucket was created successfully:
SELECT 
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'event-images';

-- Expected result:
-- id              | name          | public | file_size_limit | allowed_mime_types
-- event-images    | event-images  | true   | 5242880        | {image/jpeg,image/png,image/webp}


-- ⚠️ NOTE: Storage policies CANNOT be queried via SQL
-- To verify policies were created:
-- 1. Go to Dashboard → Storage → event-images bucket
-- 2. Click "Policies" tab
-- 3. You should see 4 policies:
--    • Public Event Images - Read (SELECT for anon)
--    • Authenticated Event Images - Upload (INSERT for authenticated)
--    • Authenticated Event Images - Update (UPDATE for authenticated)
--    • Authenticated Event Images - Delete (DELETE for authenticated)


-- ============================================================
-- FRONTEND USAGE EXAMPLE
-- ============================================================

-- JavaScript code to upload event image:
/*
async function uploadEventImage(file, eventId) {
    const fileName = `${eventId}-${Date.now()}.jpg`;
    
    const { data, error } = await _supabase.storage
        .from('event-images')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });
    
    if (error) {
        console.error('Upload failed:', error);
        throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = _supabase.storage
        .from('event-images')
        .getPublicUrl(fileName);
    
    return publicUrl;
}

// Update event with image URL:
await _supabase
    .from('events')
    .update({ image_url: publicUrl })
    .eq('id', eventId);
*/


-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- If uploads fail with "new row violates row-level security":
-- → Check that policies are created correctly
-- → Verify user is authenticated
-- → Check bucket is public

-- If images don't display:
-- → Verify publicUrl format
-- → Check bucket is set to public
-- → Test URL directly in browser

-- To delete a test image:
/*
await _supabase.storage
    .from('event-images')
    .remove(['test-file.jpg']);
*/


-- ============================================================
-- END OF STORAGE SETUP INSTRUCTIONS
-- ============================================================

