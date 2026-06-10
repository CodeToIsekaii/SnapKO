-- Phase 0: Remove PERSONAL tier, add quota config columns to subscription_plans
-- Safe: backfills any PERSONAL businesses/plans to PRO before altering the enum.

BEGIN;

-- 1. Backfill data using the old PERSONAL value
UPDATE businesses SET tier = 'PRO' WHERE tier = 'PERSONAL';
UPDATE subscription_plans SET target_tier = 'PRO' WHERE target_tier = 'PERSONAL';

-- 2. Recreate TierEnum without PERSONAL
ALTER TYPE tier_enum RENAME TO tier_enum_old;
CREATE TYPE tier_enum AS ENUM ('FREE', 'PRO', 'CHAIN');

ALTER TABLE businesses
  ALTER COLUMN tier DROP DEFAULT,
  ALTER COLUMN tier TYPE tier_enum USING tier::text::tier_enum,
  ALTER COLUMN tier SET DEFAULT 'FREE';

DROP TYPE tier_enum_old;

-- 3. Add quota config columns to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_scans_quota   INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS ad_reward_scans       INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_ad_rewards_per_day INT NOT NULL DEFAULT 5;

-- 4. Seed defaults for the 3 canonical plans (idempotent)
INSERT INTO subscription_plans
  (code, name, price, duration_days, target_tier, monthly_scans_quota, ad_reward_scans, max_ad_rewards_per_day, is_active)
VALUES
  ('FREE_DEFAULT',   'Miễn phí',   0,       0,  'FREE',  20,  2,  5,  true),
  ('PRO_MONTHLY',    'Pro tháng',  199000,  30, 'PRO',   100, 6,  20, true),
  ('CHAIN_MONTHLY',  'Chain tháng',499000,  30, 'CHAIN', 500, 10, -1, true)
ON CONFLICT (code) DO UPDATE SET
  target_tier = EXCLUDED.target_tier,
  monthly_scans_quota = EXCLUDED.monthly_scans_quota,
  ad_reward_scans = EXCLUDED.ad_reward_scans,
  max_ad_rewards_per_day = EXCLUDED.max_ad_rewards_per_day;

COMMIT;
