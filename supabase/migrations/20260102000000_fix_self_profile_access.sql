-- =========================================================
-- Migration: Allow users to read their own profile
-- Issue: Staff cannot sync inventory_model from server
-- because current RLS only allows OWNER to select profiles
-- =========================================================

-- STEP 1: Allow any authenticated user to read THEIR OWN profile
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
CREATE POLICY "Users can read their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- STEP 2: Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- STEP 3: Staff can view their business name (for Mobile display)
DROP POLICY IF EXISTS "Staff can view their business" ON public.businesses;
CREATE POLICY "Staff can view their business"
ON public.businesses FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT business_id FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Verify policies
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('profiles', 'businesses')
ORDER BY tablename, cmd;
