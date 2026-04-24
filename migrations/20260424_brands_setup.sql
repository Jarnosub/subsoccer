-- ============================================================
-- BRANDS TABLE: White-label Subsoccer GO configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT,
    password TEXT DEFAULT '',
    logo_url TEXT,
    hero_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Public read for active brands (needed for brands/index.html)
CREATE POLICY "brands_public_read" ON public.brands
    FOR SELECT USING (is_active = true);

-- Admin write
CREATE POLICY "brands_admin_insert" ON public.brands
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
    );

CREATE POLICY "brands_admin_update" ON public.brands
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
    );

CREATE POLICY "brands_admin_delete" ON public.brands
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
    );

-- ============================================================
-- STORAGE: brand-assets bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "brand_assets_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'brand-assets');

-- Admin upload
CREATE POLICY "brand_assets_admin_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'brand-assets'
        AND EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
    );

-- Admin delete
CREATE POLICY "brand_assets_admin_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'brand-assets'
        AND EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
    );
