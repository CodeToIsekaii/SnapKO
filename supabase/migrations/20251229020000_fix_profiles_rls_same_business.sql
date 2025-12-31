-- FIX: Infinite recursion in profiles RLS policy
-- The previous policy had a subquery on profiles that triggered its own RLS check

-- First, drop the broken policy
DROP POLICY IF EXISTS "profiles_same_business_select" ON public.profiles;

-- Create a SECURITY DEFINER function to get user's business_id without triggering RLS
CREATE OR REPLACE FUNCTION get_user_business_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_business_id() TO authenticated;

-- Now create the policy using the function (avoids recursion)
CREATE POLICY "profiles_same_business_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- User can see profiles in same business using helper function
  business_id = get_user_business_id()
  -- Also allow seeing own profile even if no business_id yet
  OR id = auth.uid()
);

COMMENT ON FUNCTION get_user_business_id IS 'Helper function for RLS - gets current user business_id without triggering RLS recursion';
