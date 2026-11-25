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
create or replace function api.list_businesses()
returns table (id uuid, name text, category text, logo_path text, brand_color text, website_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.category, b.logo_path, b.brand_color, b.website_url
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
