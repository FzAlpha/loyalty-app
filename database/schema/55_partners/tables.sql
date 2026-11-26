-- 55_partners (F1, plan §4): travel and other partner offers shown to members. Info only:
-- no claim QR and no redemption tracking. logo_path / banner_path are paths in the partner-images
-- bucket ("<partner_id>/..."; write check api.storage_can_write in 50_offers).

create type public.partner_offer_status as enum ('draft', 'active', 'paused', 'archived');

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  logo_path text check (char_length(logo_path) <= 500),
  website_url text check (website_url ~ '^https://[^[:space:]]+$' and char_length(website_url) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 4000),
  banner_path text check (char_length(banner_path) <= 500),
  terms text check (char_length(terms) <= 4000),
  discount_text text check (char_length(discount_text) <= 100),   -- e.g. "Up to 20% off"
  claim_url text check (claim_url ~ '^https://[^[:space:]]+$' and char_length(claim_url) <= 1000),
  claim_code text check (char_length(claim_code) between 1 and 100),
  status public.partner_offer_status not null default 'draft',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                       -- null = open-ended
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_offers_dates check (ends_at is null or ends_at > starts_at)
);
create index partner_offers_partner_idx on public.partner_offers (partner_id);
create index partner_offers_status_idx on public.partner_offers (status);
