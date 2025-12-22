-- SnapKO - Push Notification Support
-- Adds expo_push_token to profiles for Expo Push Notifications

-- Add expo_push_token column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Index for efficient lookup when sending notifications
CREATE INDEX IF NOT EXISTS idx_profiles_push_token 
ON public.profiles(business_id, expo_push_token) 
WHERE expo_push_token IS NOT NULL AND status = 'ACTIVE';

-- Add function to send push notification (called from edge functions)
-- Note: Actual push sending is done via Expo Push API from edge functions
COMMENT ON COLUMN public.profiles.expo_push_token IS 
  'Expo Push token for sending notifications. Format: ExponentPushToken[xxx]';
