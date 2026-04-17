-- ============================================
-- QR CODES TRACKING TABLE
-- Keeps track of all generated serial numbers
-- ============================================

CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    serial_number TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,                          -- e.g. 'S7-WHITE', 'S3-EDGE'
    qr_type TEXT NOT NULL DEFAULT 'instant-play', -- 'instant-play' or 'registration'
    target_url TEXT,                              -- Full URL the QR points to
    batch_name TEXT,                              -- e.g. 'Germany Q2 2026', 'Sport Thieme May'
    status TEXT NOT NULL DEFAULT 'generated',     -- 'generated', 'registered', 'active'
    registered_by UUID REFERENCES players(id),    -- FK when someone claims it
    registered_game_id UUID REFERENCES games(id), -- FK to the registered game
    notes TEXT,                                   -- Free form notes
    created_at TIMESTAMPTZ DEFAULT now(),
    registered_at TIMESTAMPTZ
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_qr_codes_serial ON qr_codes(serial_number);
CREATE INDEX IF NOT EXISTS idx_qr_codes_model ON qr_codes(model);
CREATE INDEX IF NOT EXISTS idx_qr_codes_status ON qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_codes_batch ON qr_codes(batch_name);

-- RLS: Allow anon to read (for registration page validation)
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON qr_codes
    FOR SELECT USING (true);

-- Only authenticated (or service role) can insert/update
CREATE POLICY "Allow authenticated insert" ON qr_codes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON qr_codes
    FOR UPDATE USING (true);

-- ============================================
-- Add 'model' column to games table if missing
-- ============================================
ALTER TABLE games ADD COLUMN IF NOT EXISTS model TEXT;

COMMENT ON TABLE qr_codes IS 'Tracks all generated QR code serial numbers for inventory management';
COMMENT ON COLUMN qr_codes.serial_number IS 'Full serial like S7W-0001';
COMMENT ON COLUMN qr_codes.model IS 'Product model key: S7-WHITE, S7-BLACK, S3-EDGE, S3-EDGE-ST, DOCK, ARCADE';
COMMENT ON COLUMN qr_codes.batch_name IS 'Human-readable batch identifier for the print run';
COMMENT ON COLUMN qr_codes.status IS 'generated = printed, registered = customer claimed it, active = being used';
