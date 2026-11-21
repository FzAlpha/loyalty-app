-- 30_staff (plan §4 staff, §7.5). Operational detail; permissions come from user_roles.

create table public.staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  business_id uuid references public.businesses (id), -- null = all businesses (owner)
  display_name text not null check (char_length(display_name) between 1 and 200),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_business_idx on public.staff (business_id) where business_id is not null;
create index staff_disabled_by_idx on public.staff (disabled_by) where disabled_by is not null;
