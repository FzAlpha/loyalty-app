-- 20_businesses functions (used by other modules).

-- Business time zone, else the locale.timezone setting (business override, then global).
create or replace function private.business_timezone(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.timezone from public.businesses b where b.id = p_business_id),
                  private.get_setting('locale.timezone', p_business_id) #>> '{}');
$$;

-- Edit business details (plan §5, business.manage for that business). p_patch holds only the keys
-- to change; null clears an optional field. slug is fixed (used in storage paths and URLs).
-- The row audit trigger records before/after.
create or replace function api.update_business(p_business_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.businesses;
  v_bad text;
begin
  perform private.require_permission('business.manage', p_business_id);
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    perform private.raise_error('VALIDATION_FAILED', 'patch');
  end if;
  select k into v_bad from jsonb_object_keys(p_patch) k
  where k not in ('name', 'logo_path', 'brand_color', 'address', 'phone', 'timezone', 'opening_hours', 'is_active',
                  'category', 'website_url')
  limit 1;
  if v_bad is not null then
    perform private.raise_error('VALIDATION_FAILED', 'unknown field: ' || v_bad);
  end if;
  if p_patch ? 'name' and jsonb_typeof(p_patch -> 'name') <> 'string' then
    perform private.raise_error('VALIDATION_FAILED', 'name');
  end if;
  if p_patch ? 'is_active' and jsonb_typeof(p_patch -> 'is_active') <> 'boolean' then
    perform private.raise_error('VALIDATION_FAILED', 'is_active');
  end if;
  -- Partner businesses are activated only by partner decisions (api.decide_partner / api.revoke_partner).
  if p_patch ? 'is_active' and private.business_kind(p_business_id) = 'partner' then
    perform private.raise_error('CONFLICT', 'partner activation uses partner decisions');
  end if;
  if p_patch ? 'opening_hours' and jsonb_typeof(p_patch -> 'opening_hours') not in ('object', 'array', 'null') then
    perform private.raise_error('VALIDATION_FAILED', 'opening_hours');
  end if;
  if p_patch ? 'timezone' and p_patch ->> 'timezone' is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_patch ->> 'timezone') then
    perform private.raise_error('VALIDATION_FAILED', 'timezone');
  end if;

  select * into v_row from public.businesses where id = p_business_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'business');
  end if;
  begin
    update public.businesses set
      name          = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      logo_path     = case when p_patch ? 'logo_path' then nullif(btrim(p_patch ->> 'logo_path'), '') else logo_path end,
      brand_color   = case when p_patch ? 'brand_color' then nullif(btrim(p_patch ->> 'brand_color'), '') else brand_color end,
      address       = case when p_patch ? 'address' then nullif(btrim(p_patch ->> 'address'), '') else address end,
      phone         = case when p_patch ? 'phone' then nullif(btrim(p_patch ->> 'phone'), '') else phone end,
      timezone      = case when p_patch ? 'timezone' then p_patch ->> 'timezone' else timezone end,
      opening_hours = case when p_patch ? 'opening_hours' then
                        case when jsonb_typeof(p_patch -> 'opening_hours') = 'null' then null else p_patch -> 'opening_hours' end
                      else opening_hours end,
      is_active     = case when p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean else is_active end,
      category      = case when p_patch ? 'category' then nullif(btrim(p_patch ->> 'category'), '') else category end,
      website_url   = case when p_patch ? 'website_url' then nullif(btrim(p_patch ->> 'website_url'), '') else website_url end
    where id = p_business_id
    returning * into v_row;
  exception when check_violation or not_null_violation then
    perform private.raise_error('VALIDATION_FAILED', 'business fields');
  end;
  return to_jsonb(v_row);
end;
$$;

-- Business directory for the apps (F1, plan §6). Active businesses only; public like the table.
-- kind (group / partner) added 2026-11-27; the return type changed, so drop first.
drop function if exists api.list_businesses();
create function api.list_businesses()
returns table (id uuid, name text, category text, logo_path text, brand_color text, website_url text, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.category, b.logo_path, b.brand_color, b.website_url, b.kind
  from public.businesses b
  where b.is_active
  order by b.name, b.id;
$$;

-- Display name for other modules (70_redemptions customer history).
create or replace function private.business_name(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.name from public.businesses b where b.id = p_business_id;
$$;

-- Active check for other modules (50_offers eligibility, 40_cards staff actions). Unknown id = inactive.
create or replace function private.business_is_active(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.is_active from public.businesses b where b.id = p_business_id), false);
$$;

-- Raises BUSINESS_INACTIVE for a deactivated business. Null is left to the caller's own check.
create or replace function private.require_business_active(p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_business_id is not null and not private.business_is_active(p_business_id) then
    perform private.raise_error('BUSINESS_INACTIVE');
  end if;
end;
$$;

-- group / partner for other modules (30_staff roles, 55_partners). Unknown id = null.
create or replace function private.business_kind(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.kind from public.businesses b where b.id = p_business_id;
$$;

-- Activate / deactivate for 55_partners decisions. The row audit trigger records the change.
create or replace function private.set_business_active(p_business_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.businesses set is_active = p_active where id = p_business_id;
  if not found then
    perform private.raise_error('NOT_FOUND', 'business');
  end if;
end;
$$;

-- Shared insert for api.create_business (owner) and 55_partners (partner sign-up). Callers check
-- permissions. p_business: {name (required), category, address, phone, website_url, timezone,
-- brand_color}. slug comes from the name (unique, -2, -3...).
create or replace function private.create_business_row(p_business jsonb, p_kind text, p_active boolean)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.businesses;
  v_bad text;
  v_name text;
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if p_business is null or jsonb_typeof(p_business) <> 'object' then
    perform private.raise_error('VALIDATION_FAILED', 'business');
  end if;
  select k into v_bad from jsonb_object_keys(p_business) k
  where k not in ('name', 'category', 'address', 'phone', 'website_url', 'timezone', 'brand_color')
     or jsonb_typeof(p_business -> k) not in ('string', 'null')
  limit 1;
  if v_bad is not null then
    perform private.raise_error('VALIDATION_FAILED', 'field: ' || v_bad);
  end if;
  v_name := btrim(p_business ->> 'name');
  if v_name is null or v_name = '' then
    perform private.raise_error('VALIDATION_FAILED', 'name');
  end if;
  if nullif(btrim(p_business ->> 'timezone'), '') is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_business ->> 'timezone')) then
    perform private.raise_error('VALIDATION_FAILED', 'timezone');
  end if;

  -- Accents are removed first (unaccent); other scripts (e.g. Devanagari) still drop out, then 'business'.
  v_base := left(btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_name)),
    '[^a-z0-9]+', '-', 'g'), '-'), 60);
  v_base := btrim(v_base, '-');
  if v_base = '' then
    v_base := 'business';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.businesses b where b.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  begin
    insert into public.businesses (slug, name, category, address, phone, website_url, timezone, brand_color,
                                   kind, is_active)
    values (v_slug, v_name,
            nullif(btrim(p_business ->> 'category'), ''),
            nullif(btrim(p_business ->> 'address'), ''),
            nullif(btrim(p_business ->> 'phone'), ''),
            nullif(btrim(p_business ->> 'website_url'), ''),
            nullif(btrim(p_business ->> 'timezone'), ''),
            nullif(btrim(p_business ->> 'brand_color'), ''),
            p_kind, coalesce(p_active, true))
    returning * into v_row;
  exception
    when check_violation or not_null_violation then
      perform private.raise_error('VALIDATION_FAILED', 'business fields');
    when unique_violation then
      perform private.raise_error('CONFLICT', 'slug');
  end;
  return v_row;
end;
$$;

-- Owner adds a business (business.manage at owner scope); fields as private.create_business_row.
create or replace function api.create_business(p_business jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('business.manage', null);
  return to_jsonb(private.create_business_row(p_business, 'group', true));
end;
$$;

-- Owner deletes a business that nothing references yet (no staff, offers, cards decisions, claims...).
-- Anything else keeps its history: BUSINESS_IN_USE, deactivate instead. Audit rows stay (no FK).
-- Returns where the business's files live ({asset_bucket, asset_prefix}). SQL cannot delete Storage
-- objects, so the caller removes them through the Storage API (owner may: api.storage_can_write).
drop function if exists api.delete_business(uuid);
create function api.delete_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('business.manage', null);
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  perform 1 from public.businesses where id = p_business_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'business');
  end if;
  begin
    delete from public.businesses where id = p_business_id;
  exception when foreign_key_violation then
    perform private.raise_error('BUSINESS_IN_USE');
  end;
  return jsonb_build_object(
    'asset_bucket', private.get_setting('storage.bucket.business_assets') #>> '{}',
    'asset_prefix', p_business_id::text);
end;
$$;

-- Owner's list for the admin app: every business, active or not (owner scope only).
create or replace function api.list_managed_businesses()
returns setof public.businesses
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('business.manage', null);
  return query select * from public.businesses b order by b.is_active desc, b.name, b.id;
end;
$$;
