-- SnapKO Week 4: Data Purge with pg_cron
-- Automatically delete old photos and purge deleted accounts after 30 days

-- Enable pg_cron extension (run once as superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to purge old storage photos (keep text data only)
CREATE OR REPLACE FUNCTION purge_old_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear source_photo_urls from inventory_logs older than 30 days
  UPDATE public.inventory_logs
  SET source_photo_urls = '[]'::jsonb
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND source_photo_urls != '[]'::jsonb;

  -- Log purge action
  INSERT INTO public.dpia_logs (action, details)
  VALUES ('PHOTO_PURGE', json_build_object(
    'purged_at', NOW(),
    'type', 'inventory_logs_photos'
  ));
END;
$$;

-- Function to permanently delete accounts after soft delete period
CREATE OR REPLACE FUNCTION purge_deleted_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row RECORD;
BEGIN
  -- Find profiles scheduled for deletion
  FOR row IN
    SELECT id, business_id, role
    FROM public.profiles
    WHERE status = 'DELETED'
      AND delete_scheduled_at IS NOT NULL
      AND delete_scheduled_at < NOW()
  LOOP
    -- If OWNER, delete business and all related data
    IF row.role = 'OWNER' AND row.business_id IS NOT NULL THEN
      -- Delete inventory logs
      DELETE FROM public.inventory_logs WHERE business_id = row.business_id;
      
      -- Delete recipe ingredients
      DELETE FROM public.recipe_ingredients
      WHERE recipe_id IN (
        SELECT id FROM public.recipes WHERE business_id = row.business_id
      );
      
      -- Delete recipes
      DELETE FROM public.recipes WHERE business_id = row.business_id;
      
      -- Delete ingredients
      DELETE FROM public.ingredients WHERE business_id = row.business_id;
      
      -- Delete other staff profiles
      DELETE FROM public.profiles 
      WHERE business_id = row.business_id AND id != row.id;
      
      -- Delete business
      DELETE FROM public.businesses WHERE id = row.business_id;
    END IF;

    -- Delete the profile
    DELETE FROM public.profiles WHERE id = row.id;

    -- Log deletion
    INSERT INTO public.dpia_logs (action, user_id, details)
    VALUES ('ACCOUNT_PURGED', row.id, json_build_object(
      'purged_at', NOW(),
      'role', row.role
    ));
  END LOOP;
END;
$$;

-- Add delete_scheduled_at column to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS delete_scheduled_at TIMESTAMPTZ;

-- Add is_active and deleted_at to businesses if not exists
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Schedule cron jobs (run these commands in Supabase Dashboard SQL Editor)
-- Note: pg_cron schedule syntax is standard cron format

-- Purge old photos every day at 3 AM UTC
-- SELECT cron.schedule('purge-photos', '0 3 * * *', 'SELECT purge_old_photos()');

-- Purge deleted accounts every day at 4 AM UTC
-- SELECT cron.schedule('purge-accounts', '0 4 * * *', 'SELECT purge_deleted_accounts()');
