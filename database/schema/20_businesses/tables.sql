-- 20_businesses (plan §4 businesses). Rows come from database/seed/data/businesses.json (client-provided).

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 200),
  logo_path text,
  brand_color text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  address text,
  phone text,
  timezone text, -- null = locale.timezone setting
  opening_hours jsonb,
  category text check (char_length(btrim(category)) between 1 and 100), -- shown in the app, e.g. Furniture
  website_url text check (website_url ~ '^https://[^[:space:]]+$' and char_length(website_url) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Business-scoped columns declared by 10_identity.
alter table public.user_roles
  add constraint user_roles_business_fk foreign key (business_id) references public.businesses (id);
alter table public.identity_checks
  add constraint identity_checks_business_fk foreign key (business_id) references public.businesses (id);
alter table public.phone_release_requests
  add constraint phone_release_business_fk foreign key (requested_business_id) references public.businesses (id);
alter table public.app_settings
  add constraint app_settings_scope_business_fk foreign key (scope_business_id) references public.businesses (id);
