-- SnapKO Week 5: Storage Buckets + RLS Policies
-- Creates buckets 'receipts' and 'menu_scans' and applies RLS policies
-- RLS: Users can only access files in their business_id folder

-- 1. Create Storage Buckets (idempotent - won't fail if exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('receipts', 'receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('menu_scans', 'menu_scans', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2. Helper functions for RLS policies

-- Get business_id from file path (first folder in path)
CREATE OR REPLACE FUNCTION public.get_folder_business_id(file_path text)
RETURNS text AS $$
BEGIN
  RETURN split_part(file_path, '/', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user's business_id
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT business_id::text
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS Policies for 'receipts' bucket

DROP POLICY IF EXISTS "receipts_business_insert" ON storage.objects;
CREATE POLICY "receipts_business_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "receipts_business_select" ON storage.objects;
CREATE POLICY "receipts_business_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "receipts_business_update" ON storage.objects;
CREATE POLICY "receipts_business_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "receipts_business_delete" ON storage.objects;
CREATE POLICY "receipts_business_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

-- 4. RLS Policies for 'menu_scans' bucket

DROP POLICY IF EXISTS "menu_scans_business_insert" ON storage.objects;
CREATE POLICY "menu_scans_business_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'menu_scans'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "menu_scans_business_select" ON storage.objects;
CREATE POLICY "menu_scans_business_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'menu_scans'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "menu_scans_business_update" ON storage.objects;
CREATE POLICY "menu_scans_business_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'menu_scans'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);

DROP POLICY IF EXISTS "menu_scans_business_delete" ON storage.objects;
CREATE POLICY "menu_scans_business_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'menu_scans'
  AND public.get_folder_business_id(name) = public.get_user_business_id()
);
