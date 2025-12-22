-- SnapKO - Week 1 Update: Invite Security & Soft Delete
-- Adds: invite_code_expires_at, archived flag, rate_limits table

-- 1. Add invite code expiration to businesses
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS invite_code_expires_at TIMESTAMPTZ;

-- 2. Add archived flag to ingredients (soft delete for COGS history)
ALTER TABLE public.ingredients 
ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Create index for filtering non-archived ingredients
CREATE INDEX IF NOT EXISTS ingredients_archived_idx 
ON public.ingredients(business_id, archived) WHERE archived = false;

-- 3. Create rate limits table for invite-join (sliding window)
CREATE TABLE IF NOT EXISTS public.invite_rate_limits (
  ip_address TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 1,
  window_start_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Service Role Only (Edge Functions only, no client access)
ALTER TABLE public.invite_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role Only" ON public.invite_rate_limits;
CREATE POLICY "Service Role Only" 
ON public.invite_rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Add STAFF RLS policies for profiles (can read own profile)
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 5. Add STAFF RLS policies for inventory_logs (can read/insert in their business)
DROP POLICY IF EXISTS "inventory_logs_staff_select" ON public.inventory_logs;
CREATE POLICY "inventory_logs_staff_select"
ON public.inventory_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = inventory_logs.business_id
      AND p.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "inventory_logs_staff_insert" ON public.inventory_logs;
CREATE POLICY "inventory_logs_staff_insert"
ON public.inventory_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = inventory_logs.business_id
      AND p.status = 'ACTIVE'
  )
);

-- 6. Add STAFF RLS for ingredients (can read non-archived in their business)
DROP POLICY IF EXISTS "ingredients_staff_select" ON public.ingredients;
CREATE POLICY "ingredients_staff_select"
ON public.ingredients
FOR SELECT
TO authenticated
USING (
  archived = false
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.business_id = ingredients.business_id
      AND p.status = 'ACTIVE'
  )
);

