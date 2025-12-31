-- Fix: Use RPC function with transaction for atomic Business + Profile update
-- Replaces unsafe CHECK(true) policy with proper SECURITY DEFINER function

-- Remove the unsafe policy we added earlier
DROP POLICY IF EXISTS "businesses_authenticated_insert" ON public.businesses;

-- Create atomic function for business creation
-- This runs in a transaction: if either INSERT or UPDATE fails, everything is rolled back
CREATE OR REPLACE FUNCTION create_business_for_owner(business_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin privileges to bypass RLS temporarily
SET search_path = public
AS $$
DECLARE
  new_business_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the calling user's ID
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- 1. Create Business
  INSERT INTO public.businesses (name)
  VALUES (business_name)
  RETURNING id INTO new_business_id;

  -- 2. Update Profile with business_id and ensure role is OWNER
  UPDATE public.profiles
  SET business_id = new_business_id,
      role = 'OWNER'
  WHERE id = current_user_id;

  -- Check if update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', current_user_id;
  END IF;

  -- Return success with new business ID
  RETURN json_build_object('success', true, 'business_id', new_business_id);

EXCEPTION WHEN OTHERS THEN
  -- If any error occurs, the entire transaction is rolled back
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_business_for_owner(TEXT) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION create_business_for_owner IS 'Atomically creates a business and links it to the calling user profile. Used by ProfileSetupPage for first-time owners.';
