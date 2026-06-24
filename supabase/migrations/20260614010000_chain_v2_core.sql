ALTER TYPE public.profile_role_enum ADD VALUE IF NOT EXISTS 'BRANCH_MANAGER';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_type_enum') THEN
    CREATE TYPE public.branch_type_enum AS ENUM ('CENTRAL_WAREHOUSE', 'OUTLET');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_membership_role_enum') THEN
    CREATE TYPE public.branch_membership_role_enum AS ENUM ('BRANCH_MANAGER', 'STAFF');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chain_state_enum') THEN
    CREATE TYPE public.chain_state_enum AS ENUM (
      'ACTIVE',
      'READ_ONLY_EXPIRED',
      'BRANCH_SELECTION_REQUIRED',
      'HUB_REBASELINE_REQUIRED',
      'MIGRATION_REQUIRED'
    );
  END IF;
END $$;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS chain_state public.chain_state_enum NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS chain_state_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS chain_outlet_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_chain_outlet_limit integer,
  ADD COLUMN IF NOT EXISTS pending_chain_outlet_effective_at timestamptz,
  ADD COLUMN IF NOT EXISTS hub_rebaseline_at timestamptz;

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  type public.branch_type_enum NOT NULL,
  migration_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code),
  UNIQUE (business_id, migration_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_one_central_per_business
  ON public.branches(business_id)
  WHERE type = 'CENTRAL_WAREHOUSE' AND is_active = true;

CREATE INDEX IF NOT EXISTS branches_business_type_active_idx
  ON public.branches(business_id, type, is_active);

CREATE TABLE IF NOT EXISTS public.branch_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.branch_membership_role_enum NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, profile_id)
);

CREATE INDEX IF NOT EXISTS branch_memberships_profile_id_idx
  ON public.branch_memberships(profile_id);

ALTER TABLE public.storage_areas
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.storage_areas
  DROP CONSTRAINT IF EXISTS storage_areas_business_id_is_default_key;

CREATE INDEX IF NOT EXISTS storage_areas_branch_id_idx
  ON public.storage_areas(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS storage_areas_one_active_default_per_branch
  ON public.storage_areas(branch_id)
  WHERE is_default = true AND is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_logs_area_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_logs
      ADD CONSTRAINT inventory_logs_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES public.storage_areas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recipe_branch_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  UNIQUE (recipe_id, branch_id)
);

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS available_to_all_branches boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS recipe_branch_availability_branch_id_idx
  ON public.recipe_branch_availability(branch_id);

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS outlet_count integer,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'SUBSCRIPTION';

INSERT INTO public.branches (business_id, name, code, type, migration_key)
SELECT b.id, 'Kho tổng', 'CENTRAL', 'CENTRAL_WAREHOUSE', 'default-central'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches br
  WHERE br.business_id = b.id AND br.type = 'CENTRAL_WAREHOUSE'
);

INSERT INTO public.branches (business_id, name, code, type, migration_key)
SELECT b.id, 'Chi nhánh mặc định', 'OUTLET-1', 'OUTLET', 'default-outlet'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches br
  WHERE br.business_id = b.id AND br.type = 'OUTLET'
);

UPDATE public.storage_areas sa
SET branch_id = br.id
FROM public.branches br
WHERE sa.branch_id IS NULL
  AND br.business_id = sa.business_id
  AND br.migration_key = 'default-outlet';

INSERT INTO public.storage_areas (business_id, branch_id, name, type, is_default, is_active)
SELECT b.id, br.id, 'Kho tổng', 'STORAGE', true, true
FROM public.businesses b
JOIN public.branches br
  ON br.business_id = b.id AND br.migration_key = 'default-central'
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_areas sa
  WHERE sa.branch_id = br.id AND sa.type = 'STORAGE'
);

UPDATE public.businesses
SET
  chain_state = CASE
    WHEN tier = 'CHAIN' THEN 'MIGRATION_REQUIRED'::public.chain_state_enum
    ELSE 'ACTIVE'::public.chain_state_enum
  END,
  chain_state_updated_at = now(),
  chain_outlet_limit = CASE WHEN tier = 'CHAIN' THEN GREATEST(chain_outlet_limit, 2) ELSE 1 END;
