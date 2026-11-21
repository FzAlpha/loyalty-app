-- 85_security (plan §4 security, §7.2, §7.3, §7.6). Internal tables in ops; no client access.
create extension if not exists pgcrypto with schema extensions;

-- In public because it is a parameter type of api.issue_recovery_code.
create type public.recovery_channel as enum ('in_store', 'owner_remote');
create type ops.recovery_code_status as enum ('open', 'used', 'expired', 'revoked');

create table ops.login_attempts (
  phone_e164 text primary key,
  failures integer not null default 0 check (failures >= 0),
  first_failure_at timestamptz,
  locked_until timestamptz,
  last_ip inet,
  updated_at timestamptz not null default now()
);

create table ops.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null,
  channel public.recovery_channel not null,
  issued_by uuid not null references public.profiles (id),
  issued_business_id uuid references public.businesses (id),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  status ops.recovery_code_status not null default 'open',
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_remote_needs_reason check (channel <> 'owner_remote' or reason is not null),
  constraint recovery_in_store_needs_business check (channel <> 'in_store' or issued_business_id is not null)
);
create unique index recovery_codes_one_open_uq on ops.recovery_codes (user_id) where status = 'open';
create index recovery_codes_issuer_idx on ops.recovery_codes (issued_by, channel, created_at);
create index recovery_codes_business_idx on ops.recovery_codes (issued_business_id) where issued_business_id is not null;

create table ops.rate_limit_buckets (
  bucket_key text primary key,
  tokens numeric not null,
  updated_at timestamptz not null default now()
);
