-- CRITICAL SECURITY FIX: RLS Policies for staff_invite_codes
-- Per user feedback: Prevent public access, only owners can manage

-- Ensure RLS is enabled
ALTER TABLE staff_invite_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Owners can manage invite codes" ON staff_invite_codes;
DROP POLICY IF EXISTS "Anyone can verify active codes" ON staff_invite_codes;

-- Policy 1: Owners can view/create/delete codes for their business
CREATE POLICY "Owners manage their codes"
  ON staff_invite_codes
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM profiles 
      WHERE id = auth.uid() AND role = 'OWNER'
    )
  );

-- Policy 2: NO PUBLIC SELECT
-- Mobile staff will verify codes via Edge Function using Service Role Key
-- This prevents hackers from brute-forcing codes via direct DB access

COMMENT ON POLICY "Owners manage their codes" ON staff_invite_codes IS 
  'Only business owners can create and manage invite codes. Mobile users verify codes via Edge Function (not direct DB access) to prevent brute force attacks.';
