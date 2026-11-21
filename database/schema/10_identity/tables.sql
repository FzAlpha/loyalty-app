-- 10_identity: profiles, roles/permissions, identity checks, phone release (plan §4 identity, §5, §7.4)

create type public.membership_status as enum ('none', 'pending', 'active', 'rejected', 'blocked');
create type public.account_status as enum ('active', 'disabled', 'deletion_pending', 'deleted');
create type public.identity_evidence as enum ('registration_details', 'proof_of_purchase', 'account_info');
create type public.identity_check_result as enum ('passed', 'failed');
create type public.phone_release_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  phone_e164 text unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- Summary of the latest passed in-store identity check. NOT phone-ownership verification (§7.4).
  identity_checked_at timestamptz,
  date_of_birth date,
  membership_status public.membership_status not null default 'none',
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);
create index role_permissions_permission_idx on public.role_permissions (permission_id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  business_id uuid, -- null = all businesses (owner). FK added by 20_businesses.
  is_active boolean not null default true,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_roles_scope_uq
  on public.user_roles (user_id, role_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_role_idx on public.user_roles (role_id);
create index user_roles_business_idx on public.user_roles (business_id) where business_id is not null;

create table public.identity_checks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  executive_id uuid not null references public.profiles (id),
  business_id uuid not null, -- FK added by 20_businesses
  evidence public.identity_evidence[] not null check (cardinality(evidence) > 0),
  result public.identity_check_result not null,
  note text check (char_length(note) <= 280),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index identity_checks_customer_idx on public.identity_checks (customer_id, checked_at desc);
create index identity_checks_executive_idx on public.identity_checks (executive_id);
create index identity_checks_business_idx on public.identity_checks (business_id);

create table public.phone_release_requests (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  holder_customer_id uuid not null references public.profiles (id),
  requested_by uuid not null references public.profiles (id),
  requested_business_id uuid not null, -- FK added by 20_businesses
  reason text not null check (char_length(reason) between 1 and 500),
  status public.phone_release_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (decided_by is null or decided_by <> requested_by)
);
create unique index phone_release_one_pending_uq on public.phone_release_requests (phone_e164) where status = 'pending';
create index phone_release_holder_idx on public.phone_release_requests (holder_customer_id);
create index phone_release_requested_by_idx on public.phone_release_requests (requested_by);
create index phone_release_decided_by_idx on public.phone_release_requests (decided_by) where decided_by is not null;
create index phone_release_business_idx on public.phone_release_requests (requested_business_id);
