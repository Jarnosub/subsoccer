-- ============================================================
-- ADD TIMESTAMP TO EVENT_REGISTRATIONS
-- ============================================================

-- Add created_at column if it doesn't exist
ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at column for future use
ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_event_registrations_created_at 
ON public.event_registrations(created_at);

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name IN ('created_at', 'updated_at')
AND table_schema = 'public'
ORDER BY column_name;
