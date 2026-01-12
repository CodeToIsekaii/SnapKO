-- Fix subscription data: Sync from profiles to businesses for user baohackerpro2004@gmail.com
-- Business ID: 3c7ff01f-167c-403c-9dc3-a906202779db

-- Check current state first
SELECT 
    p.id as profile_id,
    p.is_pro,
    p.subscription_expires_at as profile_expires,
    b.id as business_id,
    b.tier,
    b.subscription_expires_at as business_expires
FROM profiles p
LEFT JOIN businesses b ON p.business_id = b.id
WHERE p.id IN (SELECT id FROM auth.users WHERE email = 'baohackerpro2004@gmail.com');

-- Update businesses table to sync from profiles
UPDATE businesses b
SET 
    tier = 'PRO',
    subscription_expires_at = p.subscription_expires_at
FROM profiles p
WHERE p.business_id = b.id
  AND p.subscription_expires_at IS NOT NULL
  AND b.id = '3c7ff01f-167c-403c-9dc3-a906202779db';
