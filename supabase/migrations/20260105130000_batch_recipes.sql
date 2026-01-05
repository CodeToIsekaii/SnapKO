-- SnapKO - Batch Recipes for Semi-Finished Products
-- Allows PHANTOM items to define input ingredients and output yield

-- 1. Add batch output fields to ingredients table
ALTER TABLE public.ingredients 
ADD COLUMN IF NOT EXISTS is_batch_item BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS batch_yield_qty FLOAT,
ADD COLUMN IF NOT EXISTS batch_yield_unit TEXT;

-- 2. Create batch_recipes table (1-N relationship)
CREATE TABLE IF NOT EXISTS public.batch_recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
  child_ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity FLOAT NOT NULL,  -- Stored in BASE UNIT of child ingredient
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_batch_recipes_parent ON public.batch_recipes(parent_ingredient_id);

-- 4. Comments
COMMENT ON TABLE public.batch_recipes IS 'Stores input ingredients for semi-finished products (1 parent -> N children)';
COMMENT ON COLUMN public.ingredients.is_batch_item IS 'True if this ingredient is made from other ingredients (e.g., Tea Concentrate)';
COMMENT ON COLUMN public.ingredients.batch_yield_qty IS 'Amount of output produced (e.g., 2000 for 2000ml)';
COMMENT ON COLUMN public.ingredients.batch_yield_unit IS 'Unit of output (must match base_unit)';
