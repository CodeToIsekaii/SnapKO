-- Add subscription columns to profiles table
-- For tracking PRO subscription status

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Add index for subscription queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription 
ON profiles (is_pro, subscription_expires_at);

-- Comment for documentation
COMMENT ON COLUMN profiles.is_pro IS 'Whether user has active PRO subscription';
COMMENT ON COLUMN profiles.subscription_expires_at IS 'When the PRO subscription expires';
