BEGIN;

-- ---------------------------------------------------------
-- 1. XỬ LÝ RLS (ROW LEVEL SECURITY)
-- ---------------------------------------------------------

-- Bước 1.1: Xóa các policies gây lỗi đệ quy cũ
DROP POLICY IF EXISTS "profiles_owner_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- Bước 1.2: Bật RLS (để chắc chắn)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Bước 1.3: Tạo Policy MỚI - Đơn giản và An toàn (Không đệ quy)
-- Cho phép user tự xem profile của chính mình (dựa trên ID khớp với Auth UID)
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Cho phép user tự sửa profile của chính mình
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- ---------------------------------------------------------
-- 2. SỬA CẤU TRÚC BẢNG (SCHEMA FIX)
-- ---------------------------------------------------------

-- Cho phép business_id là NULL (để user đăng ký xong chưa cần có quán ngay)
ALTER TABLE public.profiles ALTER COLUMN business_id DROP NOT NULL;

-- Đảm bảo các cột mới đã tồn tại (phòng trường hợp migration trước chưa chạy)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'OWNER';

-- ---------------------------------------------------------
-- 3. CÀI ĐẶT TRIGGER TỰ ĐỘNG TẠO PROFILE (AUTO-CREATE)
-- ---------------------------------------------------------

-- Hàm xử lý khi có user mới đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, is_pro, created_at, updated_at)
  VALUES (
    new.id, 
    'OWNER',   -- Mặc định là Owner (Staff sẽ dùng luồng Invite riêng)
    'ACTIVE', 
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Tránh lỗi nếu lỡ chạy lại
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gắn Trigger vào bảng auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------
-- 4. FIX DỮ LIỆU CŨ (BACKFILL)
-- ---------------------------------------------------------
-- Nếu đã lỡ có user trong Auth mà chưa có Profile, tạo bù ngay lập tức
INSERT INTO public.profiles (id, role, status, is_pro)
SELECT id, 'OWNER', 'ACTIVE', false
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT DO NOTHING;

COMMIT;

-- Reload lại cache để API nhận diện thay đổi ngay lập tức
SELECT pg_notify('pgrst', 'reload schema');
