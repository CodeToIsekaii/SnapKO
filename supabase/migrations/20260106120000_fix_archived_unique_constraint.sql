-- Fix unique constraint to allow same name for archived ingredients
-- Drop old constraint that doesn't consider archived status
ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_business_name_unique;

-- Create partial unique index that only applies to non-archived ingredients
-- This allows creating a new ingredient with the same name if the old one is archived
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_business_name_active_unique 
ON public.ingredients (business_id, name) 
WHERE archived = false;
