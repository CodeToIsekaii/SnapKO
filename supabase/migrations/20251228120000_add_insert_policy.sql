-- Fix: Add INSERT policy for profiles table
-- Users need to be able to create their own profile during registration

-- Drop if exists first to avoid errors
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Create the INSERT policy
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
