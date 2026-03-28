-- ============================================================
-- SUBSOCCER GO: PHYSICAL CARD ORDERS PIPELINE
-- ============================================================

-- 1. Orders Table
CREATE TABLE public.card_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    shipping_name TEXT NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_zip TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_country TEXT NOT NULL,
    pdf_url TEXT, -- Path to the generated PDF in Supabase Storage
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'shipped')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Security Policies for card_orders
ALTER TABLE public.card_orders ENABLE ROW LEVEL SECURITY;

-- Users can insert their own orders
CREATE POLICY "Users can insert their own orders"
    ON public.card_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own orders
CREATE POLICY "Users can view their own orders"
    ON public.card_orders FOR SELECT
    USING (auth.uid() = user_id);

-- 2. Storage Bucket for PDFs
-- Create the bucket for storing 300 DPI print PDFs
-- Run this in Supabase SQL Editor if buckets cannot be created programmatically without Superuser permissions.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('print_assets', 'print_assets', true) 
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can insert their own PDFs
CREATE POLICY "Users can upload their own print PDFs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'print_assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage RLS: Users can read their own PDFs
CREATE POLICY "Users can read their own print PDFs" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'print_assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
);
