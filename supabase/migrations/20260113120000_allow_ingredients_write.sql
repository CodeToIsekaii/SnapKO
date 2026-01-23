-- Migration: Allow STAFF to UPDATE ingredients (For Auto-Learn Aliases)
-- BUT keep INSERT restricted (Staff cannot create new items)

-- 1. Policy for UPDATE
-- Allows any active user in the business to update ingredients (e.g. adding aliases)
DROP POLICY IF EXISTS "ingredients_update_policy" ON public.ingredients;

CREATE POLICY "ingredients_update_policy"
ON public.ingredients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.business_id = ingredients.business_id
      AND profiles.status = 'ACTIVE'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.business_id = ingredients.business_id
      AND profiles.status = 'ACTIVE'
  )
);

-- Note: We DO NOT create an INSERT policy for authenticated users.
-- Only OWNER (via existing policies) can INSERT.
