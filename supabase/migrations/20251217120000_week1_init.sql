-- SnapKO - Week 1: Infrastructure & Auth Core (Schema V6.1 aligned)
-- Creates: businesses, profiles, ingredients (+ enums, indexes) and enables RLS.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tier_enum') then
    create type tier_enum as enum ('FREE', 'PERSONAL', 'CHAIN');
  end if;
  if not exists (select 1 from pg_type where typname = 'profile_role_enum') then
    create type profile_role_enum as enum ('OWNER', 'STAFF');
  end if;
  if not exists (select 1 from pg_type where typname = 'profile_status_enum') then
    create type profile_status_enum as enum ('PENDING', 'ACTIVE', 'INACTIVE');
  end if;
end $$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Business',
  invite_code text unique,
  tier tier_enum not null default 'FREE',
  privacy_policy_version text,
  tos_version text,
  last_backup_at timestamptz,
  dpia_report_version text,
  legal_entity_status boolean not null default false,
  created_at timestamptz not null default now(),
  subscription_expires_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role profile_role_enum not null,
  status profile_status_enum not null default 'ACTIVE',
  full_name text,
  phone_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  base_unit text,
  warehouse_qty numeric not null default 0,
  bar_qty numeric not null default 0,
  conversion_rate numeric,
  unit_cost numeric not null default 0,
  alert_threshold numeric,
  created_at timestamptz not null default now(),
  constraint ingredients_business_name_unique unique (business_id, name)
);

create index if not exists profiles_business_id_idx on public.profiles(business_id);
create index if not exists ingredients_business_id_idx on public.ingredients(business_id);

-- RLS
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;

-- Policies: keep Week 1 minimal: Owners can read/manage everything inside their business.
drop policy if exists "businesses_owner_select" on public.businesses;
create policy "businesses_owner_select"
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'OWNER'
      and p.status = 'ACTIVE'
      and p.business_id = businesses.id
  )
);

drop policy if exists "businesses_owner_update" on public.businesses;
create policy "businesses_owner_update"
on public.businesses
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'OWNER'
      and p.status = 'ACTIVE'
      and p.business_id = businesses.id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'OWNER'
      and p.status = 'ACTIVE'
      and p.business_id = businesses.id
  )
);

drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles owner_p
    where owner_p.id = auth.uid()
      and owner_p.role = 'OWNER'
      and owner_p.status = 'ACTIVE'
      and owner_p.business_id = profiles.business_id
  )
);

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles owner_p
    where owner_p.id = auth.uid()
      and owner_p.role = 'OWNER'
      and owner_p.status = 'ACTIVE'
      and owner_p.business_id = profiles.business_id
  )
)
with check (
  exists (
    select 1
    from public.profiles owner_p
    where owner_p.id = auth.uid()
      and owner_p.role = 'OWNER'
      and owner_p.status = 'ACTIVE'
      and owner_p.business_id = profiles.business_id
  )
);

drop policy if exists "ingredients_owner_all" on public.ingredients;
create policy "ingredients_owner_all"
on public.ingredients
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles owner_p
    where owner_p.id = auth.uid()
      and owner_p.role = 'OWNER'
      and owner_p.status = 'ACTIVE'
      and owner_p.business_id = ingredients.business_id
  )
)
with check (
  exists (
    select 1
    from public.profiles owner_p
    where owner_p.id = auth.uid()
      and owner_p.role = 'OWNER'
      and owner_p.status = 'ACTIVE'
      and owner_p.business_id = ingredients.business_id
  )
);


