-- =========================================================
-- Migration: Move Inventory Model to Businesses Table
-- Purpose:
--   1. Store inventory_model at BUSINESS level (global)
--   2. Sync existing owner choices to business table
--   3. Allow staff to read business config
-- =========================================================

-- 1. Add column to businesses
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS inventory_model TEXT DEFAULT 'STANDARD';

COMMENT ON COLUMN public.businesses.inventory_model IS 'Global business inventory model: SIMPLE or STANDARD';

-- 2. Backfill: Update business model based on OWNER's profile
-- Using a DO block to ensure safe update
DO $$
BEGIN
  UPDATE public.businesses b
  SET inventory_model = p.inventory_model
  FROM public.profiles p
  WHERE p.business_id = b.id
    AND p.role = 'OWNER'
    AND p.inventory_model IS NOT NULL;
    
  RAISE NOTICE 'Backfilled inventory_model from owners to businesses';
END $$;

-- 3. RLS: Allow authenticated users (Owner & Staff) to VIEW their business config
-- This might overlap with existing policies, so we ensure it covers the need
DROP POLICY IF EXISTS "Authenticated users can view own business" ON public.businesses;

CREATE POLICY "Authenticated users can view own business"
ON public.businesses FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT business_id FROM public.profiles 
    WHERE id = auth.uid()
    AND status = 'ACTIVE'
  )
);

-- 4. RLS: Update policy for Owners (Ensure they can update inventory_model)
-- This supplements existing update policies
DROP POLICY IF EXISTS "Owners can update own business details" ON public.businesses;

CREATE POLICY "Owners can update own business details"
ON public.businesses FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT business_id FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'OWNER'
      AND status = 'ACTIVE'
  )
)
WITH CHECK (
  id IN (
    SELECT business_id FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'OWNER'
      AND status = 'ACTIVE'
  )
);
