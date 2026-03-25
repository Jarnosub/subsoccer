-- ==============================================================================
-- 10 DEMO HARDWARE SERIAL NUMBERS FOR DEMO VENUES & TESTING
-- ==============================================================================
-- Run this script in your Supabase SQL Editor.
-- These 10 un-claimed tables will instantly become available. 
-- You can simply type 'DEMO-SUB-001' to your Vault's "Add to Vault" window to claim them!

INSERT INTO public.hardware_registry 
    (serial_number, product_category, product_model, batch_id, is_claimed)
VALUES 
    ('DEMO-SUB-001', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-002', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-003', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-004', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-005', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-006', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-007', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-008', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-009', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false),
    ('DEMO-SUB-010', 'table', 'Subsoccer Demo Edition', 'DEMO-BATCH', false)
ON CONFLICT (serial_number) DO NOTHING;
