-- ============================================================
-- HARDWARE DESIGNS TABLE: Linking Customizer configurations to Brands
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hardware_designs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_slug TEXT NOT NULL,
    model TEXT NOT NULL,
    config_json JSONB NOT NULL,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hardware_designs ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (so the Customizer frontend can save designs)
CREATE POLICY "Allow public insert of hardware designs" ON public.hardware_designs
    FOR INSERT WITH CHECK (true);

-- Allow public read (so Brand Builder can show them)
CREATE POLICY "Allow public read of hardware designs" ON public.hardware_designs
    FOR SELECT USING (true);
