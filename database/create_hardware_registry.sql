-- Create the Hardware Registry for all physical Subsoccer products (Tables, Docks, etc.)
CREATE TABLE IF NOT EXISTS public.hardware_registry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    serial_number TEXT UNIQUE NOT NULL,
    product_category TEXT NOT NULL CHECK (product_category IN ('table', 'dock', 'accessory')),
    product_model TEXT NOT NULL, -- e.g., 'Subsoccer S3', 'Subsoccer S7', 'Subsoccer Dock'
    batch_id TEXT, -- e.g., 'PO97', 'PO105'
    manufactured_date TEXT,
    
    -- Ownership
    owner_id UUID REFERENCES public.players(id) NULL,
    is_claimed BOOLEAN DEFAULT false NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Metadata collected upon claiming
    location_type TEXT CHECK (location_type IN ('Home', 'Public Venue', 'Office')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.hardware_registry ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see hardware they own
CREATE POLICY "Users can view their own hardware"
    ON public.hardware_registry
    FOR SELECT
    USING (owner_id = auth.uid());

-- Policy: Admins can view/manage all hardware
CREATE POLICY "Admins can manage all hardware"
    ON public.hardware_registry
    USING (
        EXISTS (
            SELECT 1 FROM public.players 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Create a secure RPC function to claim a table so users cannot brute-force read the entire table!
-- This function runs as SECURITY DEFINER to bypass RLS and securely check & update the serial number.
CREATE OR REPLACE FUNCTION claim_hardware(target_serial_number TEXT, claim_location_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_hardware record;
BEGIN
    -- Only authenticated users can claim
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Find the hardware (case insensitive)
    SELECT * INTO found_hardware FROM public.hardware_registry 
    WHERE upper(serial_number) = upper(target_serial_number);

    -- Check if it exists
    IF NOT FOUND THEN
        RETURN '{"success": false, "error": "Invalid serial number"}'::jsonb;
    END IF;

    -- Check if already claimed
    IF found_hardware.is_claimed = true THEN
        IF found_hardware.owner_id = auth.uid() THEN
            RETURN '{"success": false, "error": "You already own this device."}'::jsonb;
        ELSE
            RETURN '{"success": false, "error": "This device is already claimed by someone else."}'::jsonb;
        END IF;
    END IF;

    -- Claim it!
    UPDATE public.hardware_registry
    SET 
        owner_id = auth.uid(),
        is_claimed = true,
        claimed_at = now(),
        location_type = claim_location_type
    WHERE serial_number = found_hardware.serial_number;

    RETURN jsonb_build_object(
        'success', true, 
        'device', jsonb_build_object(
            'model', found_hardware.product_model,
            'category', found_hardware.product_category
        )
    );
END;
$$;
