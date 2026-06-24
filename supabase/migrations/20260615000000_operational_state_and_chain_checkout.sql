DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operational_state_enum') THEN
    CREATE TYPE public.operational_state_enum AS ENUM (
      'ACTIVE',
      'READ_ONLY_EXPIRED',
      'WAREHOUSE_REBASELINE_REQUIRED'
    );
  END IF;
END $$;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS operational_state public.operational_state_enum NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS operational_state_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pending_chain_configuration jsonb;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS chain_configuration jsonb;

ALTER TABLE public.staff_invite_codes
  ADD COLUMN IF NOT EXISTS branch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_invite_codes_branch_id_fkey'
  ) THEN
    ALTER TABLE public.staff_invite_codes
      ADD CONSTRAINT staff_invite_codes_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS staff_invite_codes_branch_id_idx
  ON public.staff_invite_codes(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS branch_memberships_one_branch_per_manager
  ON public.branch_memberships(profile_id)
  WHERE role = 'BRANCH_MANAGER';

UPDATE public.businesses
SET
  operational_state = CASE
    WHEN tier IN ('PRO', 'CHAIN')
      AND (subscription_expires_at IS NULL OR subscription_expires_at < now())
      THEN 'READ_ONLY_EXPIRED'::public.operational_state_enum
    ELSE 'ACTIVE'::public.operational_state_enum
  END,
  operational_state_updated_at = now();
