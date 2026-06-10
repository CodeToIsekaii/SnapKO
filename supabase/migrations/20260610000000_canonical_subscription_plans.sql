-- Canonical SnapKO pricing plans.
-- Keeps the public pricing page focused on Free, Pro, and Chain while
-- deactivating legacy plans that created duplicate/low-margin pricing cards.

BEGIN;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_scans_quota INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS ad_reward_scans INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_ad_rewards_per_day INT NOT NULL DEFAULT 5;

INSERT INTO public.subscription_plans
  (
    code,
    name,
    description,
    price,
    duration_days,
    target_tier,
    monthly_scans_quota,
    ad_reward_scans,
    max_ad_rewards_per_day,
    is_active
  )
VALUES
  (
    'FREE_DEFAULT',
    'Free',
    'Dùng thử quy trình SnapKO với quota cơ bản.',
    0,
    0,
    'FREE',
    20,
    2,
    5,
    true
  ),
  (
    'PRO_MONTHLY',
    'Pro tháng',
    'Cho quán vận hành chuyên nghiệp mỗi ngày.',
    199000,
    30,
    'PRO',
    100,
    6,
    20,
    true
  ),
  (
    'PRO_QUARTERLY',
    'Pro 3 tháng',
    'Tiết kiệm hơn so với trả từng tháng.',
    539000,
    90,
    'PRO',
    100,
    6,
    20,
    true
  ),
  (
    'PRO_YEARLY',
    'Pro 1 năm',
    'Tối ưu chi phí cho quán dùng lâu dài.',
    1990000,
    365,
    'PRO',
    100,
    6,
    20,
    true
  ),
  (
    'CHAIN_MONTHLY',
    'Chain tháng',
    'Cho chuỗi hoặc quán có nhiều khu vực kho.',
    499000,
    30,
    'CHAIN',
    500,
    10,
    -1,
    true
  ),
  (
    'CHAIN_QUARTERLY',
    'Chain 3 tháng',
    'Tiết kiệm hơn cho vận hành chuỗi ổn định.',
    1349000,
    90,
    'CHAIN',
    500,
    10,
    -1,
    true
  ),
  (
    'CHAIN_YEARLY',
    'Chain 1 năm',
    'Chi phí tốt nhất cho chuỗi F&B.',
    4790000,
    365,
    'CHAIN',
    500,
    10,
    -1,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  duration_days = EXCLUDED.duration_days,
  target_tier = EXCLUDED.target_tier,
  monthly_scans_quota = EXCLUDED.monthly_scans_quota,
  ad_reward_scans = EXCLUDED.ad_reward_scans,
  max_ad_rewards_per_day = EXCLUDED.max_ad_rewards_per_day,
  is_active = true;

UPDATE public.subscription_plans
SET is_active = false
WHERE
  code IN ('MONTHLY_PRO', 'QUARTERLY_PRO', 'YEARLY_PRO')
  OR code ILIKE 'PREMIUM_%';

COMMIT;
