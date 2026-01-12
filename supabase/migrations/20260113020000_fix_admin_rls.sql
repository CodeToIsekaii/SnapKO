-- =========================================================
-- Migration: Fix Admin RLS Policies
-- Issue: Admins cannot Manage Subscription Plans (RLS Violation)
-- =========================================================

-- 1. Policies for subscription_plans

-- Allow Admins to View ALL plans (including inactive ones)
DROP POLICY IF EXISTS "admins_view_all_plans" ON public.subscription_plans;
CREATE POLICY "admins_view_all_plans"
ON public.subscription_plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- Allow Admins to INSERT plans
DROP POLICY IF EXISTS "admins_insert_plans" ON public.subscription_plans;
CREATE POLICY "admins_insert_plans"
ON public.subscription_plans
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- Allow Admins to UPDATE plans
DROP POLICY IF EXISTS "admins_update_plans" ON public.subscription_plans;
CREATE POLICY "admins_update_plans"
ON public.subscription_plans
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- Allow Admins to DELETE plans
DROP POLICY IF EXISTS "admins_delete_plans" ON public.subscription_plans;
CREATE POLICY "admins_delete_plans"
ON public.subscription_plans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);

-- 2. Ensure Admin can also read/manage businesses if needed (Optional but safe)
DROP POLICY IF EXISTS "admins_read_all_businesses" ON public.businesses;
CREATE POLICY "admins_read_all_businesses"
ON public.businesses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'ADMIN'
  )
);
