-- ============================================================
-- ADD EMAIL SUPPORT TO PLAYERS TABLE
-- Progressive profile completion - email required only when needed
-- ============================================================

-- Add email columns to players table
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_players_email 
ON public.players(email);

-- Add unique constraint for email (if provided)
-- Note: Multiple NULLs are allowed, but duplicate emails are not
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_email_unique 
ON public.players(email) 
WHERE email IS NOT NULL;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'players' 
AND column_name IN ('email', 'email_verified')
AND table_schema = 'public'
ORDER BY column_name;

-- Expected result: 2 rows (email, email_verified)
