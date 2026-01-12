-- Migration: Add Quarterly PRO plan
-- Date: 2026-01-13
-- Description: Adds a 3-month (90 days) subscription plan

INSERT INTO public.subscription_plans (
    code, 
    name, 
    description, 
    price, 
    duration_days, 
    target_tier, 
    is_active
) VALUES (
    'QUARTERLY_PRO', 
    'Gói 3 tháng', 
    'Tiết kiệm 10%', 
    270000, 
    90, 
    'PRO', 
    true
) ON CONFLICT (code) DO NOTHING;
