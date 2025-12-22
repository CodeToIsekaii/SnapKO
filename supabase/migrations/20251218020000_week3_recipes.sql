-- SnapKO - Week 3 Patch: Recipes & Recipe Ingredients
-- Adds recipes and recipe_ingredients for COGS calculation

-- Recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INT NOT NULL DEFAULT 0,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recipe Ingredients (link recipe to ingredients for COGS)
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE SET NULL,
  quantity FLOAT NOT NULL,
  unit TEXT,
  UNIQUE(recipe_id, ingredient_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recipes_business ON public.recipes(business_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);

-- RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Recipes: owners and active staff can read/write
DROP POLICY IF EXISTS "recipes_active_select" ON public.recipes;
CREATE POLICY "recipes_active_select" ON public.recipes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = recipes.business_id
      AND p.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "recipes_active_insert" ON public.recipes;
CREATE POLICY "recipes_active_insert" ON public.recipes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = recipes.business_id
      AND p.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "recipes_active_update" ON public.recipes;
CREATE POLICY "recipes_active_update" ON public.recipes
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = recipes.business_id
      AND p.status = 'ACTIVE'
  )
);

-- Recipe Ingredients: inherit from recipe access
DROP POLICY IF EXISTS "recipe_ingredients_active_select" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_active_select" ON public.recipe_ingredients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    JOIN public.profiles p ON p.business_id = r.business_id
    WHERE r.id = recipe_ingredients.recipe_id
      AND p.id = auth.uid()
      AND p.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "recipe_ingredients_active_write" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_active_write" ON public.recipe_ingredients
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    JOIN public.profiles p ON p.business_id = r.business_id
    WHERE r.id = recipe_ingredients.recipe_id
      AND p.id = auth.uid()
      AND p.status = 'ACTIVE'
  )
);
