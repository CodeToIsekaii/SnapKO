-- Migration: Add ingredient type column for categorization
-- Types: raw_material (nguyên liệu), supply (vật dụng), semi_product (bán thành phẩm)

-- Add type column with default 'raw_material'
ALTER TABLE public.ingredients 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'raw_material';

-- Add constraint to validate type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredients_type_check'
  ) THEN
    ALTER TABLE public.ingredients 
    ADD CONSTRAINT ingredients_type_check 
    CHECK (type IN ('raw_material', 'supply', 'semi_product'));
  END IF;
END $$;

-- Create index for faster type filtering
CREATE INDEX IF NOT EXISTS idx_ingredients_type ON public.ingredients(type);
