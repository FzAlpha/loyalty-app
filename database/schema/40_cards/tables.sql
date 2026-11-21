-- 40_cards (plan §4 cards, §6.2 QR). Only token hashes are stored; plain tokens leave the database
-- once, in the batch-creation response (card-batches Edge Function).

create type public.card_status as enum ('unassigned', 'pending', 'active', 'blocked', 'retired');
create type public.card_assignment_status as enum ('pending', 'approved', 'rejected', 'revoked');

create sequence public.card_number_seq as bigint start 1;

create table public.card_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 200),
  quantity integer not null check (quantity > 0),
  created_by uuid not null references public.profiles (id),
  exported_at timestamptz,
  export_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index card_batches_created_by_idx on public.card_batches (created_by);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.card_batches (id),
  card_number text not null unique,
  token_hash bytea not null unique,
  status public.card_status not null default 'unassigned',
  current_customer_id uuid references public.profiles (id),
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'unassigned' or current_customer_id is null),
  check (status not in ('pending', 'active') or current_customer_id is not null)
);
create index cards_batch_idx on public.cards (batch_id);
create unique index cards_one_per_customer on public.cards (current_customer_id)
  where current_customer_id is not null;

create table public.card_assignments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id),
  customer_id uuid not null references public.profiles (id),
  status public.card_assignment_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_business_id uuid references public.businesses (id),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index card_assignments_card_idx on public.card_assignments (card_id);
create index card_assignments_customer_idx on public.card_assignments (customer_id);
create index card_assignments_decided_by_idx on public.card_assignments (decided_by) where decided_by is not null;
create index card_assignments_business_idx on public.card_assignments (decision_business_id) where decision_business_id is not null;
-- One live (pending|approved) assignment per customer and per card (double-link guard, M3 exit).
create unique index card_assignments_live_customer on public.card_assignments (customer_id)
  where status in ('pending', 'approved');
create unique index card_assignments_live_card on public.card_assignments (card_id)
  where status in ('pending', 'approved');
