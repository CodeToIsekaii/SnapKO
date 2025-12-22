-- SnapKO - Week 3: Sync, Offline & Payment
-- Creates: dpia_logs, payment_transactions, payment_short_code, synced_at

-- Add payment_short_code to businesses (6 chars for bank transfer content)
alter table public.businesses add column if not exists payment_short_code text unique;

-- Function to generate random short code
create or replace function generate_payment_short_code()
returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Auto-generate short code for new businesses
create or replace function set_payment_short_code()
returns trigger as $$
declare
  new_code text;
  code_exists boolean;
begin
  if NEW.payment_short_code is null then
    loop
      new_code := generate_payment_short_code();
      select exists(select 1 from public.businesses where payment_short_code = new_code) into code_exists;
      exit when not code_exists;
    end loop;
    NEW.payment_short_code := new_code;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_set_payment_short_code on public.businesses;
create trigger trg_set_payment_short_code
  before insert on public.businesses
  for each row execute function set_payment_short_code();

-- Generate codes for existing businesses
update public.businesses
set payment_short_code = generate_payment_short_code()
where payment_short_code is null;

-- Add synced_at to inventory_logs
alter table public.inventory_logs add column if not exists synced_at timestamptz;

-- DPIA Logs table (Data Privacy Impact Assessment)
create table if not exists public.dpia_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  log_id uuid references public.inventory_logs(id) on delete set null,
  data_processed jsonb not null default '{}',
  triggered_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists dpia_logs_business_created_at_idx
  on public.dpia_logs (business_id, created_at desc);

alter table public.dpia_logs enable row level security;

drop policy if exists "dpia_logs_owner_select" on public.dpia_logs;
create policy "dpia_logs_owner_select"
on public.dpia_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'OWNER'
      and p.status = 'ACTIVE'
      and p.business_id = dpia_logs.business_id
  )
);

drop policy if exists "dpia_logs_insert" on public.dpia_logs;
create policy "dpia_logs_insert"
on public.dpia_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ACTIVE'
      and p.business_id = dpia_logs.business_id
  )
);

-- Payment Transactions table
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status_enum') then
    create type payment_status_enum as enum ('PENDING', 'SUCCESS', 'FAILED');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_gateway_enum') then
    create type payment_gateway_enum as enum ('SEPAY', 'CASSO', 'MANUAL');
  end if;
end $$;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount numeric not null,
  status payment_status_enum not null default 'PENDING',
  transaction_code text,
  gateway payment_gateway_enum not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_transactions_business_idx
  on public.payment_transactions (business_id, created_at desc);

alter table public.payment_transactions enable row level security;

drop policy if exists "payment_transactions_owner_select" on public.payment_transactions;
create policy "payment_transactions_owner_select"
on public.payment_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'OWNER'
      and p.status = 'ACTIVE'
      and p.business_id = payment_transactions.business_id
  )
);

-- Allow service role to insert (from webhook)
drop policy if exists "payment_transactions_service_insert" on public.payment_transactions;
create policy "payment_transactions_service_insert"
on public.payment_transactions
for insert
to service_role
with check (true);

