-- Phase 2 (Feature 5): scan quota + ad reward state on Business.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS monthly_scans_quota   INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS scans_used_this_month INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scans_anchor_day      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ad_rewards_used_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_rewards_reset_date DATE;

-- Seed each business with defaults from the plan that matches its current tier.
UPDATE businesses b
SET monthly_scans_quota = p.monthly_scans_quota
FROM subscription_plans p
WHERE p.target_tier = b.tier::text AND p.is_active = TRUE AND b.monthly_scans_quota = 20;

-- Clamp anchor day to day-of-month(created_at), max 28 to avoid month-length edge cases.
UPDATE businesses
SET scans_anchor_day = LEAST(EXTRACT(DAY FROM created_at)::INT, 28)
WHERE scans_anchor_day = 1;
