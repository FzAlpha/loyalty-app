-- 60_claims: one-time claim QR tokens (BACKEND_PLAN.md §4 claims, §6, §8).
do $$ begin
  create type public.claim_status as enum ('open', 'used', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

create table if not exists public.claim_tokens (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles (id),
  card_id       uuid not null references public.cards (id),
  offer_id      uuid not null references public.offers (id),
  business_id   uuid not null references public.businesses (id),
  secret_hash   bytea not null,
  status        public.claim_status not null default 'open',
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  used_at       timestamptz,
  previewed_by  uuid references auth.users (id),
  previewed_at  timestamptz,
  constraint claim_tokens_used_at check ((status = 'used') = (used_at is not null))
);

-- One open token per (customer, offer): issuing a new one revokes the old one first.
create unique index if not exists claim_tokens_one_open
  on public.claim_tokens (customer_id, offer_id) where status = 'open';
create index if not exists claim_tokens_open_expiry on public.claim_tokens (expires_at) where status = 'open';
create index if not exists claim_tokens_customer on public.claim_tokens (customer_id, created_at desc);

-- Realtime (§10): the customer screen shows "Redeemed" from this row's status change.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'claim_tokens') then
    alter publication supabase_realtime add table public.claim_tokens;
  end if;
end $$;
