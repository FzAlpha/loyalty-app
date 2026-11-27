-- 50_offers (plan §4 offers): offers, schedules, customer groups, usage counters.
-- offer_usage is written by redemption (M7, §8); total_redeemed likewise.

create type public.offer_status as enum ('draft', 'active', 'paused', 'archived');

-- Home-screen benefit tiles (F1). Rows come from database/seed/reference/offer_categories.sql.
create table public.offer_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 4000),
  banner_path text,
  terms text check (char_length(terms) <= 4000),
  status public.offer_status not null default 'draft',
  owner_paused boolean not null default false,  -- paused by the owner: only the owner can republish (plan §4 partners)
  category_id uuid references public.offer_categories (id),   -- null = uncategorised
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                       -- null = open-ended
  max_uses_per_customer integer check (max_uses_per_customer > 0),
  total_usage_limit integer check (total_usage_limit > 0),
  total_redeemed integer not null default 0 check (total_redeemed >= 0),
  min_purchase_amount numeric(12, 2) check (min_purchase_amount >= 0),
  max_discount_amount numeric(12, 2) check (max_discount_amount >= 0),
  birthday_window_days integer check (birthday_window_days >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_dates check (ends_at is null or ends_at > starts_at),
  constraint offers_total_limit check (total_usage_limit is null or total_redeemed <= total_usage_limit),
  -- Storage paths are prefixed with the owning business (§10).
  constraint offers_banner_prefix check (banner_path is null or banner_path like business_id::text || '/%')
);
create index offers_business_status_idx on public.offers (business_id, status);
create index offers_category_idx on public.offers (category_id);

-- weekday: 0 = Sunday … 6 = Saturday (Postgres extract(dow)), in the business time zone.
create table public.offer_schedules (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  constraint offer_schedules_window check (end_time > start_time)
);
create index offer_schedules_offer_idx on public.offer_schedules (offer_id);

-- Rows come from database/seed/data/customer_groups.json (client-provided, §3.3).
create table public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_group_members (
  group_id uuid not null references public.customer_groups (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, customer_id)
);
create index customer_group_members_customer_idx on public.customer_group_members (customer_id);

create table public.offer_eligible_groups (
  offer_id uuid not null references public.offers (id) on delete cascade,
  group_id uuid not null references public.customer_groups (id),
  primary key (offer_id, group_id)
);

create table public.offer_usage (
  offer_id uuid not null references public.offers (id),
  customer_id uuid not null references public.profiles (id),
  used_count integer not null default 0 check (used_count >= 0),
  last_used_at timestamptz,
  primary key (offer_id, customer_id)
);
create index offer_usage_customer_idx on public.offer_usage (customer_id);
