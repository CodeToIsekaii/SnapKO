-- SnapKO - Week 2: Core Inventory + AI fields
-- Adds inventory_logs and minimal policies for ACTIVE owner/staff.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'inventory_location_enum') then
    create type inventory_location_enum as enum ('WAREHOUSE', 'BAR');
  end if;
  if not exists (select 1 from pg_type where typname = 'inventory_type_enum') then
    create type inventory_type_enum as enum ('IMPORT', 'TRANSFER', 'AUDIT', 'WASTE', 'LENT');
  end if;
end $$;

create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  location inventory_location_enum not null,
  type inventory_type_enum not null,
  created_by uuid references public.profiles(id) on delete set null,
  ai_parsed_quantity numeric,
  ai_confidence_score numeric,
  final_confirmed_quantity numeric,
  quantity_change_base numeric,
  unit_cost_at_time numeric,
  source_photos text[] not null default '{}',
  photo_metadata jsonb,
  ai_parsed_json jsonb,
  staff_note text,
  is_verified boolean not null default false,
  diff_percentage numeric,
  created_at timestamptz not null default now()
);

create index if not exists inventory_logs_business_created_at_idx
  on public.inventory_logs (business_id, created_at desc);

alter table public.inventory_logs enable row level security;

-- Owners & ACTIVE staff can read logs within their business
drop policy if exists "inventory_logs_active_select" on public.inventory_logs;
create policy "inventory_logs_active_select"
on public.inventory_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.business_id = inventory_logs.business_id
      and p.status = 'ACTIVE'
      and p.role in ('OWNER', 'STAFF')
  )
);

-- Owners & ACTIVE staff can insert logs within their business
drop policy if exists "inventory_logs_active_insert" on public.inventory_logs;
create policy "inventory_logs_active_insert"
on public.inventory_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.business_id = inventory_logs.business_id
      and p.status = 'ACTIVE'
      and p.role in ('OWNER', 'STAFF')
  )
);


