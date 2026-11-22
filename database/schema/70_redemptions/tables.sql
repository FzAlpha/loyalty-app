-- 70_redemptions (BACKEND_PLAN.md §4 redemptions, §8).
-- claim_token_id has no foreign key: purge_claim_tokens deletes old tokens and the id is kept.
create table if not exists public.redemptions (
  id               uuid primary key default gen_random_uuid(),
  claim_token_id   uuid not null unique,
  idempotency_key  text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,200}$'),
  customer_id      uuid not null references public.profiles (id),
  card_id          uuid not null references public.cards (id),
  offer_id         uuid not null references public.offers (id),
  business_id      uuid not null references public.businesses (id),
  executive_id     uuid not null references public.profiles (id),
  bill_number      text check (char_length(bill_number) between 1 and 100),
  bill_amount      numeric(12,2) check (bill_amount >= 0),
  redeemed_at      timestamptz not null default now()
);
create index if not exists redemptions_business_time on public.redemptions (business_id, redeemed_at desc);
create index if not exists redemptions_customer_time on public.redemptions (customer_id, redeemed_at desc);
create index if not exists redemptions_offer on public.redemptions (offer_id);

-- Realtime (§10): staff "Today" screen and customer history.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'redemptions') then
    alter publication supabase_realtime add table public.redemptions;
  end if;
end $$;
