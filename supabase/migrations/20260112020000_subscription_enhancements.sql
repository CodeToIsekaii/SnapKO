-- SnapKO: Subscription System Enhancements
-- Adds PRO tier, subscription_plans table, and subscription_history table

-- 1. Add PRO to tier_enum (Safe for Postgres 12+)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRO' AND enumtypid = 'tier_enum'::regtype) THEN
    ALTER TYPE tier_enum ADD VALUE 'PRO';
  END IF;
END $$;

-- 2. Create subscription_plans table (Menu of available plans)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,              -- 'MONTHLY_PRO', 'YEARLY_PRO', etc.
  name TEXT NOT NULL,                     -- Display name
  description TEXT,                       -- Optional description
  price DECIMAL(12, 2) NOT NULL,          -- Price in VND
  duration_days INTEGER NOT NULL,         -- 30, 90, 365, etc.
  target_tier TEXT NOT NULL DEFAULT 'PRO', -- Which tier this unlocks
  is_active BOOLEAN DEFAULT TRUE,         -- Hide/show without deletion
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default plans
INSERT INTO subscription_plans (code, name, description, price, duration_days, target_tier) VALUES
  ('MONTHLY_PRO', 'Gói PRO 1 Tháng', 'Truy cập đầy đủ tính năng Kho Kép, Báo cáo nâng cao', 100000, 30, 'PRO'),
  ('YEARLY_PRO', 'Gói PRO 1 Năm (Tiết kiệm 17%)', 'Thanh toán một lần, tiết kiệm 2 tháng', 990000, 365, 'PRO')
ON CONFLICT (code) DO NOTHING;

-- 4. Create subscription_history table (Transaction log)
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id),
  plan_code TEXT,                         -- Backup in case plan is deleted
  amount_paid DECIMAL(12, 2),
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  payment_gateway TEXT,                   -- PAYOS, SEPAY, CASSO, MANUAL
  transaction_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_history_business 
  ON subscription_history(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_dates 
  ON subscription_history(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active 
  ON subscription_plans(is_active) WHERE is_active = true;

-- 6. Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- Plans: Public read (anyone can see available plans)
DROP POLICY IF EXISTS "subscription_plans_public_read" ON subscription_plans;
CREATE POLICY "subscription_plans_public_read" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- History: Owner can read their business's history
DROP POLICY IF EXISTS "subscription_history_owner_read" ON subscription_history;
CREATE POLICY "subscription_history_owner_read" ON subscription_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.business_id = subscription_history.business_id
        AND p.status = 'ACTIVE'
    )
  );

-- History: Service role can insert (via webhook)
DROP POLICY IF EXISTS "subscription_history_service_insert" ON subscription_history;
CREATE POLICY "subscription_history_service_insert" ON subscription_history
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE subscription_plans IS 'Available subscription plans (managed by admin)';
COMMENT ON TABLE subscription_history IS 'Record of all subscription purchases';
COMMENT ON COLUMN subscription_plans.duration_days IS 'Number of days this plan extends subscription';
COMMENT ON COLUMN subscription_plans.target_tier IS 'Tier level this plan grants (PRO, ENTERPRISE, etc)';
