-- Fix: Update trigger and ensure schema is correct for user registration

-- 1. Add updated_at column if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure business_id is nullable
ALTER TABLE public.profiles ALTER COLUMN business_id DROP NOT NULL;

-- 3. Fix the trigger function to match actual schema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, is_pro, created_at)
  VALUES (
    new.id, 
    'OWNER',   -- Default to Owner
    'ACTIVE', 
    false,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Reload schema
SELECT pg_notify('pgrst', 'reload schema');
