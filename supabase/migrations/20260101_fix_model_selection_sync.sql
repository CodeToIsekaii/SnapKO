-- =========================================================
-- Migration: Fix Model Selection Sync
-- Purpose: 
--   1. Allow owners to update their business config
--   2. Allow staff to view business config (for mobile sync)
--   3. Allow users to update their own profile
-- =========================================================

-- =============================================
-- STEP 1: Profile Update RLS Policy
-- Allow authenticated users to update their own profile
-- =============================================

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- =============================================
-- STEP 2: Business Select RLS for Staff
-- Allow staff to view their business details (for mobile config sync)
-- =============================================

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

-- =============================================
-- STEP 3: Business Update RLS for Owners
-- Allow OWNER to update their business settings
-- =============================================

DROP POLICY IF EXISTS "Owners can update their business" ON public.businesses;
CREATE POLICY "Owners can update their business"
ON public.businesses FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT business_id FROM public.profiles
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'OWNER'
  )
)
WITH CHECK (
  id IN (
    SELECT business_id FROM public.profiles
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'OWNER'
  )
);

-- =============================================
-- STEP 4: Verify policies exist
-- =============================================

SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('profiles', 'businesses')
ORDER BY tablename, cmd;
