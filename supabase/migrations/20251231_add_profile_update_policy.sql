-- =========================================================
-- RLS Policy: Allow users to update their own profile
-- Fixes: Model selection not persisting after reload
-- =========================================================

-- Allow authenticated users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Verify the policy exists
SELECT policyname, tablename, cmd FROM pg_policies WHERE tablename = 'profiles';
