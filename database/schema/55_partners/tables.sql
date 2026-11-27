-- 55_partners (plan §4 partners, 2026-11-27). A partner is a businesses row with kind = 'partner'
-- (20_businesses) that signed itself up from the staff app. This module holds the application and
-- the owner's decision. Partner offers are ordinary offers (50_offers).

create type public.partner_status as enum ('pending', 'approved', 'rejected', 'revoked');

create table public.partner_applications (
  business_id uuid primary key references public.businesses (id),
  applicant_id uuid not null unique references public.profiles (id),
  status public.partner_status not null default 'pending',
  message text check (char_length(message) <= 1000),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_applications_status_idx on public.partner_applications (status, created_at);
create index partner_applications_decided_by_idx on public.partner_applications (decided_by)
  where decided_by is not null;
