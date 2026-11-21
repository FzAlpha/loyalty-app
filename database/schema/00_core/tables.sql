-- core module: schemas, extensions, settings and error catalogue (BACKEND_PLAN.md §1.1, §3.2, §3.3)
create schema if not exists api;
create schema if not exists private;
create schema if not exists audit;
create schema if not exists ops;

create extension if not exists pg_jsonschema with schema extensions;

create table if not exists public.error_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]+$'),
  http_status integer not null check (http_status between 400 and 599),
  description text not null check (description <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  scope_business_id uuid, -- FK to businesses is added by the businesses module
  value jsonb not null,
  value_schema jsonb not null,
  description text not null check (description <> ''),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_value_matches_schema
    check (extensions.jsonb_matches_schema(value_schema::json, value))
);

create unique index if not exists app_settings_key_scope_uq
  on public.app_settings (key, coalesce(scope_business_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists app_settings_scope_business_idx
  on public.app_settings (scope_business_id) where scope_business_id is not null;
