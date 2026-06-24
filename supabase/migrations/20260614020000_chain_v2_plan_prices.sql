INSERT INTO public.subscription_plans (
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
    'CHAIN_MONTHLY',
    'Chain tháng',
    'Giá hiển thị cho tối thiểu 2 outlet; checkout tính lại theo số outlet.',
    538000,
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
    'Giá hiển thị cho tối thiểu 2 outlet; checkout tính lại theo số outlet.',
    1452600,
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
    'Giá hiển thị cho tối thiểu 2 outlet; checkout tính lại theo số outlet.',
    5164800,
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
