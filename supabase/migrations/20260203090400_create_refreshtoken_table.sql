-- Drop old refreshtoken table and recreate with new structure
DROP TABLE IF EXISTS public.refreshtoken;

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  is_revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Enable RLS
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS refresh_tokens_profile_id_idx ON public.refresh_tokens(profile_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON public.refresh_tokens(expires_at);

-- RLS Policies: Users can only see/manage their own refresh tokens
CREATE POLICY "Users can see their own refresh tokens"
  ON public.refresh_tokens
  FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert their own refresh tokens"
  ON public.refresh_tokens
  FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update their own refresh tokens"
  ON public.refresh_tokens
  FOR UPDATE
  USING (profile_id = auth.uid());

CREATE POLICY "Users can delete their own refresh tokens"
  ON public.refresh_tokens
  FOR DELETE
  USING (profile_id = auth.uid());
