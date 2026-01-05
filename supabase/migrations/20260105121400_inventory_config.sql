-- SnapKO - Advanced Inventory Configuration
-- Adds item_type, tracking_mode, and allowable_variance to ingredients table

-- 1. Create ENUM types if they don't exist (using TEXT check constraints for now to be safe with Supabase pgsql)

ALTER TABLE public.ingredients 
ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'STOCK' CHECK (item_type IN ('STOCK', 'PHANTOM')),
ADD COLUMN IF NOT EXISTS tracking_mode TEXT DEFAULT 'STRICT' CHECK (tracking_mode IN ('STRICT', 'LOOSE')),
ADD COLUMN IF NOT EXISTS allowable_variance FLOAT DEFAULT 0.05; -- Default 5% variance

-- 2. Add comments for clarity
COMMENT ON COLUMN public.ingredients.item_type IS 'STOCK: Real inventory item. PHANTOM: Derived item (e.g. Sugar Syrup from Sugar).';
COMMENT ON COLUMN public.ingredients.tracking_mode IS 'STRICT: Compare vs Theoretical (Alert if diff > variance). LOOSE: Overwrite with Actual Count (No alert).';
COMMENT ON COLUMN public.ingredients.allowable_variance IS 'Percentage of variance allowed in STRICT mode (0.05 = 5%)';

-- 3. Update RLS policies if needed (existing policies for ingredients likely cover select/update)
-- Just ensuring we don't break anything. Existing policies usually cover all columns.
