-- SnapKO Week 5: Optimize Helper Functions for Production
-- Adds IMMUTABLE and STABLE volatility markers for better query planning

-- Hàm tách business_id từ path - không query DB, output ổn định -> IMMUTABLE
CREATE OR REPLACE FUNCTION public.get_folder_business_id(file_path text)
RETURNS text AS $$
BEGIN
  RETURN split_part(file_path, '/', 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Hàm lấy business_id của user - query DB nhưng ổn định trong transaction -> STABLE
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
