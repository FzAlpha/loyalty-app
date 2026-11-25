-- 50_offers functions: eligibility engine (§6.1), offer CRUD (§6), storage write check (§10).

-- ---------------------------------------------------------------- eligibility engine
-- Days between a local date and the nearest anniversary of a birth date (29 Feb -> 28 Feb in
-- non-leap years).
create or replace function private.days_to_birthday(p_dob date, p_on date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select min(abs(make_date(y, extract(month from p_dob)::int,
                 least(extract(day from p_dob)::int,
                       extract(day from (make_date(y, extract(month from p_dob)::int, 1)
                                         + interval '1 month - 1 day'))::int)) - p_on))
  from generate_series(extract(year from p_on)::int - 1, extract(year from p_on)::int + 1) as y;
$$;

-- One function for the offer feed, claim creation and redemption, so the rules cannot diverge.
-- Checks run in the §6.1 order and the first failure is reported.
create or replace function private.evaluate_offer(
  p_customer_id uuid,
  p_offer_id uuid,
  p_at timestamptz default now(),
  out eligible boolean,
  out reason_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_o public.offers;
  v_local timestamp;
  v_used integer;
begin
  eligible := false;
  select * into v_c from private.customer_offer_facts(p_customer_id);
  if not found or v_c.account_status <> 'active' then
    reason_code := 'ACCOUNT_INACTIVE'; return;
  end if;
  if v_c.membership_status <> 'active' then
    reason_code := 'MEMBERSHIP_INACTIVE'; return;
  end if;
  if not private.customer_has_active_card(p_customer_id) then
    reason_code := 'CARD_INACTIVE'; return;
  end if;

  select * into v_o from public.offers where id = p_offer_id;
  if not found or v_o.status <> 'active' or p_at < v_o.starts_at
     or (v_o.ends_at is not null and p_at >= v_o.ends_at) then
    reason_code := 'OFFER_INACTIVE'; return;
  end if;

  v_local := p_at at time zone private.business_timezone(v_o.business_id);
  if exists (select 1 from public.offer_schedules s where s.offer_id = v_o.id)
     and not exists (select 1 from public.offer_schedules s
                     where s.offer_id = v_o.id and s.weekday = extract(dow from v_local)
                       and v_local::time >= s.start_time and v_local::time < s.end_time) then
    reason_code := 'OUTSIDE_SCHEDULE'; return;
  end if;

  if exists (select 1 from public.offer_eligible_groups g where g.offer_id = v_o.id)
     and not exists (select 1 from public.offer_eligible_groups g
                     join public.customer_group_members m on m.group_id = g.group_id
                     where g.offer_id = v_o.id and m.customer_id = p_customer_id) then
    reason_code := 'NOT_IN_GROUP'; return;
  end if;

  if v_o.birthday_window_days is not null
     and (v_c.date_of_birth is null
          or private.days_to_birthday(v_c.date_of_birth, v_local::date) > v_o.birthday_window_days) then
    reason_code := 'OUTSIDE_BIRTHDAY_WINDOW'; return;
  end if;

  if v_o.max_uses_per_customer is not null then
    select u.used_count into v_used from public.offer_usage u
    where u.offer_id = v_o.id and u.customer_id = p_customer_id;
    if coalesce(v_used, 0) >= v_o.max_uses_per_customer then
      reason_code := 'CUSTOMER_LIMIT_REACHED'; return;
    end if;
  end if;

  if v_o.total_usage_limit is not null and v_o.total_redeemed >= v_o.total_usage_limit then
    reason_code := 'OFFER_LIMIT_REACHED'; return;
  end if;

  eligible := true;
end;
$$;

-- Offer feed for the signed-in customer: only offers the engine accepts right now.
create or replace function api.list_eligible_offers()
returns table (
  id uuid, business_id uuid, title text, description text, banner_path text, terms text,
  starts_at timestamptz, ends_at timestamptz, min_purchase_amount numeric, max_discount_amount numeric,
  category_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'offer.list');
  end if;
  return query
    select o.id, o.business_id, o.title, o.description, o.banner_path, o.terms, o.starts_at, o.ends_at,
           o.min_purchase_amount, o.max_discount_amount, c.key
    from public.offers o
    left join public.offer_categories c on c.id = o.category_id
    where o.status = 'active' and o.starts_at <= now() and (o.ends_at is null or o.ends_at > now())
      and (private.evaluate_offer(v_uid, o.id, now())).eligible
    order by o.starts_at desc, o.id;
end;
$$;

-- Active categories for the home-screen tiles (F1).
create or replace function api.list_offer_categories()
returns table (id uuid, key text, name text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.key, c.name, c.sort_order from public.offer_categories c
  where c.is_active
  order by c.sort_order, c.name;
$$;

-- ---------------------------------------------------------------- CRUD (offer.manage)
-- p_offer: {id?, business_id (new only), title, description, banner_path, terms, starts_at, ends_at,
-- max_uses_per_customer, total_usage_limit, min_purchase_amount, max_discount_amount,
-- birthday_window_days, category_id, schedules?: [{weekday, start_time, end_time}], group_ids?: [uuid]}.
-- Updates replace every field (send the full offer). New offers start as draft.
-- Omitting schedules / group_ids keeps the current rows.
create or replace function api.upsert_offer(p_offer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_biz uuid;
  v_before public.offers;
  v_after public.offers;
begin
  if p_offer is null or jsonb_typeof(p_offer) <> 'object' then
    perform private.raise_error('VALIDATION_FAILED', 'offer');
  end if;
  begin
    v_id := (p_offer ->> 'id')::uuid;
    v_biz := (p_offer ->> 'business_id')::uuid;
  exception when invalid_text_representation then
    perform private.raise_error('VALIDATION_FAILED', 'id');
  end;

  if v_id is not null then
    select * into v_before from public.offers where id = v_id for update;
    if not found then
      perform private.raise_error('NOT_FOUND', 'offer');
    end if;
    if p_offer ? 'business_id' and v_biz is distinct from v_before.business_id then
      perform private.raise_error('VALIDATION_FAILED', 'business_id cannot change');
    end if;
    v_biz := v_before.business_id;
  elsif v_biz is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  v_uid := private.require_permission('offer.manage', v_biz);
  if v_before.status = 'archived' then
    perform private.raise_error('CONFLICT', 'offer archived');
  end if;

  begin
    if v_id is null then
      insert into public.offers (business_id, title, description, banner_path, terms, starts_at, ends_at,
        max_uses_per_customer, total_usage_limit, min_purchase_amount, max_discount_amount,
        birthday_window_days, category_id, created_by)
      values (v_biz, btrim(p_offer ->> 'title'), p_offer ->> 'description', p_offer ->> 'banner_path',
        p_offer ->> 'terms', coalesce((p_offer ->> 'starts_at')::timestamptz, now()),
        (p_offer ->> 'ends_at')::timestamptz, (p_offer ->> 'max_uses_per_customer')::integer,
        (p_offer ->> 'total_usage_limit')::integer, (p_offer ->> 'min_purchase_amount')::numeric,
        (p_offer ->> 'max_discount_amount')::numeric, (p_offer ->> 'birthday_window_days')::integer,
        (p_offer ->> 'category_id')::uuid, v_uid)
      returning * into v_after;
    else
      update public.offers set
        title = btrim(p_offer ->> 'title'),
        description = p_offer ->> 'description',
        banner_path = p_offer ->> 'banner_path',
        terms = p_offer ->> 'terms',
        starts_at = coalesce((p_offer ->> 'starts_at')::timestamptz, v_before.starts_at),
        ends_at = (p_offer ->> 'ends_at')::timestamptz,
        max_uses_per_customer = (p_offer ->> 'max_uses_per_customer')::integer,
        total_usage_limit = (p_offer ->> 'total_usage_limit')::integer,
        min_purchase_amount = (p_offer ->> 'min_purchase_amount')::numeric,
        max_discount_amount = (p_offer ->> 'max_discount_amount')::numeric,
        birthday_window_days = (p_offer ->> 'birthday_window_days')::integer,
        category_id = (p_offer ->> 'category_id')::uuid
      where id = v_id
      returning * into v_after;
    end if;

    if p_offer ? 'schedules' then
      if jsonb_typeof(p_offer -> 'schedules') <> 'array' then
        perform private.raise_error('VALIDATION_FAILED', 'schedules');
      end if;
      delete from public.offer_schedules where offer_id = v_after.id;
      insert into public.offer_schedules (offer_id, weekday, start_time, end_time)
      select v_after.id, (s ->> 'weekday')::smallint, (s ->> 'start_time')::time, (s ->> 'end_time')::time
      from jsonb_array_elements(p_offer -> 'schedules') s;
    end if;
    if p_offer ? 'group_ids' then
      if jsonb_typeof(p_offer -> 'group_ids') <> 'array' then
        perform private.raise_error('VALIDATION_FAILED', 'group_ids');
      end if;
      delete from public.offer_eligible_groups where offer_id = v_after.id;
      insert into public.offer_eligible_groups (offer_id, group_id)
      select distinct v_after.id, g::uuid from jsonb_array_elements_text(p_offer -> 'group_ids') g;
    end if;
  exception
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation
      or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
      or invalid_parameter_value then
      perform private.raise_error('VALIDATION_FAILED', sqlerrm);
  end;

  perform audit.write(case when v_id is null then 'offer.created' else 'offer.updated' end, 'offer',
    v_after.id, case when v_id is not null then to_jsonb(v_before) end, to_jsonb(v_after), v_biz);
  return jsonb_build_object('offer_id', v_after.id, 'status', v_after.status);
end;
$$;

-- Status changes. archived is final.
create or replace function api.set_offer_status(p_offer_id uuid, p_status public.offer_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.offers;
begin
  if p_status is null then
    perform private.raise_error('VALIDATION_FAILED', 'status');
  end if;
  select * into v_o from public.offers where id = p_offer_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'offer');
  end if;
  perform private.require_permission('offer.manage', v_o.business_id);
  if v_o.status = 'archived' and p_status <> 'archived' then
    perform private.raise_error('CONFLICT', 'offer archived');
  end if;
  update public.offers set status = p_status where id = v_o.id;
  perform audit.write('offer.status_changed', 'offer', v_o.id, jsonb_build_object('status', v_o.status),
    jsonb_build_object('status', p_status), v_o.business_id);
  return jsonb_build_object('offer_id', v_o.id, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------- storage (§10)
-- Writes to the asset buckets need business.manage (business-assets) or offer.manage
-- (offer-banners) for the business named by the first path segment. Bucket names are settings.
-- Called from storage.objects policies, so it is in api and granted to authenticated.
create or replace function api.storage_can_write(p_bucket_id text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seg text := split_part(coalesce(p_name, ''), '/', 1);
  v_perm text;
begin
  if v_seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or position('/' in coalesce(p_name, '')) = 0 then
    return false;
  end if;
  v_perm := case p_bucket_id
    when private.get_setting('storage.bucket.business_assets') #>> '{}' then 'business.manage'
    when private.get_setting('storage.bucket.offer_banners') #>> '{}' then 'offer.manage'
  end;
  return v_perm is not null and private.session_is_live() and private.can(v_perm, v_seg::uuid);
end;
$$;

-- ---------------------------------------------------------------- used by 60_claims / 70_redemptions
-- Minimal offer facts for claim screens and redemption checks.
create or replace function private.offer_brief(p_offer_id uuid)
returns table (business_id uuid, title text, min_purchase_amount numeric, max_discount_amount numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.business_id, o.title, o.min_purchase_amount, o.max_discount_amount
  from public.offers o where o.id = p_offer_id;
$$;

-- §8 steps 8–11, run inside the redeem transaction after the claim token is locked
-- (lock order: token -> offer -> usage). Raises the engine's reason code when not eligible.
create or replace function private.consume_offer_use(p_customer_id uuid, p_offer_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.offers;
  v_e record;
begin
  select * into v_o from public.offers where id = p_offer_id;
  if not found then
    perform private.raise_error('OFFER_INACTIVE');
  end if;
  if v_o.total_usage_limit is not null then
    perform 1 from public.offers where id = p_offer_id for update;
  end if;

  select * into v_e from private.evaluate_offer(p_customer_id, p_offer_id, p_at);
  if not v_e.eligible then
    perform private.raise_error(v_e.reason_code);
  end if;

  insert into public.offer_usage as u (offer_id, customer_id, used_count, last_used_at)
  values (p_offer_id, p_customer_id, 1, p_at)
  on conflict (offer_id, customer_id) do update
    set used_count = u.used_count + 1, last_used_at = excluded.last_used_at
    where v_o.max_uses_per_customer is null or u.used_count < v_o.max_uses_per_customer;
  if not found then
    perform private.raise_error('CUSTOMER_LIMIT_REACHED');
  end if;

  update public.offers set total_redeemed = total_redeemed + 1
  where id = p_offer_id and (total_usage_limit is null or total_redeemed < total_usage_limit);
  if not found then
    perform private.raise_error('OFFER_LIMIT_REACHED');
  end if;
end;
$$;
