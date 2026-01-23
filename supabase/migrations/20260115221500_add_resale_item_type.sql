-- Migration: Add resale_item to ingredient type options
-- resale_item = Hàng bán lại (Bánh, Cookies, Snacks) - items bought and resold without recipe

-- Drop old constraint
ALTER TABLE public.ingredients 
DROP CONSTRAINT IF EXISTS ingredients_type_check;

-- Add new constraint with resale_item included
ALTER TABLE public.ingredients 
ADD CONSTRAINT ingredients_type_check 
CHECK (type IN ('raw_material', 'supply', 'semi_product', 'resale_item'));
