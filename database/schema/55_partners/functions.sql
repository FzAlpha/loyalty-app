-- 55_partners functions (F1, plan §6).

-- Partner offers for members: active, in date, active partner. Non-members get an empty list
-- (same as api.list_eligible_offers).
create or replace function api.list_partner_offers()
returns table (id uuid, partner_id uuid, partner_name text, partner_logo_path text, partner_website_url text,
               title text, description text, banner_path text, terms text, discount_text text,
               claim_url text, claim_code text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_c record;
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'partner_offer.list');
  end if;
  select * into v_c from private.customer_offer_facts(v_uid);
  if not found or v_c.account_status <> 'active' or v_c.membership_status <> 'active' then
    return;
  end if;
  return query
    select o.id, p.id, p.name, p.logo_path, p.website_url, o.title, o.description, o.banner_path, o.terms,
           o.discount_text, o.claim_url, o.claim_code, o.starts_at, o.ends_at
    from public.partner_offers o
    join public.partners p on p.id = o.partner_id
    where p.is_active and o.status = 'active' and o.starts_at <= now() and (o.ends_at is null or o.ends_at > now())
    order by o.starts_at desc, o.id;
end;
$$;

-- p_partner: {id?, name, logo_path, website_url, is_active}. Updates replace every field.
create or replace function api.upsert_partner(p_partner jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_before public.partners;
  v_after public.partners;
begin
  perform private.require_permission('partner.manage', null);
  if p_partner is null or jsonb_typeof(p_partner) <> 'object' then
    perform private.raise_error('VALIDATION_FAILED', 'partner');
  end if;
  if p_partner ? 'is_active' and jsonb_typeof(p_partner -> 'is_active') <> 'boolean' then
    perform private.raise_error('VALIDATION_FAILED', 'is_active');
  end if;
  begin
    v_id := (p_partner ->> 'id')::uuid;
  exception when invalid_text_representation then
    perform private.raise_error('VALIDATION_FAILED', 'id');
  end;
  if v_id is not null then
    select * into v_before from public.partners where id = v_id for update;
    if not found then
      perform private.raise_error('NOT_FOUND', 'partner');
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.partners (name, logo_path, website_url, is_active)
      values (btrim(p_partner ->> 'name'), nullif(btrim(p_partner ->> 'logo_path'), ''),
              nullif(btrim(p_partner ->> 'website_url'), ''), coalesce((p_partner ->> 'is_active')::boolean, true))
      returning * into v_after;
    else
      update public.partners set
        name = btrim(p_partner ->> 'name'),
        logo_path = nullif(btrim(p_partner ->> 'logo_path'), ''),
        website_url = nullif(btrim(p_partner ->> 'website_url'), ''),
        is_active = coalesce((p_partner ->> 'is_active')::boolean, v_before.is_active)
      where id = v_id
      returning * into v_after;
    end if;
  exception when check_violation or not_null_violation then
    perform private.raise_error('VALIDATION_FAILED', sqlerrm);
  end;

  perform audit.write(case when v_id is null then 'partner.created' else 'partner.updated' end, 'partner',
    v_after.id, case when v_id is not null then to_jsonb(v_before) end, to_jsonb(v_after), null);
  return jsonb_build_object('partner_id', v_after.id, 'is_active', v_after.is_active);
end;
$$;

-- p_offer: {id?, partner_id (new only), title, description, banner_path, terms, discount_text,
-- claim_url, claim_code, starts_at, ends_at}. Updates replace every field. New offers start as draft.
create or replace function api.upsert_partner_offer(p_offer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_partner uuid;
  v_before public.partner_offers;
  v_after public.partner_offers;
begin
  v_uid := private.require_permission('partner.manage', null);
  if p_offer is null or jsonb_typeof(p_offer) <> 'object' then
    perform private.raise_error('VALIDATION_FAILED', 'offer');
  end if;
  begin
    v_id := (p_offer ->> 'id')::uuid;
    v_partner := (p_offer ->> 'partner_id')::uuid;
  exception when invalid_text_representation then
    perform private.raise_error('VALIDATION_FAILED', 'id');
  end;
  if v_id is not null then
    select * into v_before from public.partner_offers where id = v_id for update;
    if not found then
      perform private.raise_error('NOT_FOUND', 'partner_offer');
    end if;
    if p_offer ? 'partner_id' and v_partner is distinct from v_before.partner_id then
      perform private.raise_error('VALIDATION_FAILED', 'partner_id cannot change');
    end if;
    if v_before.status = 'archived' then
      perform private.raise_error('CONFLICT', 'partner offer archived');
    end if;
  elsif v_partner is null then
    perform private.raise_error('VALIDATION_FAILED', 'partner_id required');
  end if;

  begin
    if v_id is null then
      insert into public.partner_offers (partner_id, title, description, banner_path, terms, discount_text,
        claim_url, claim_code, starts_at, ends_at, created_by)
      values (v_partner, btrim(p_offer ->> 'title'), p_offer ->> 'description',
        nullif(btrim(p_offer ->> 'banner_path'), ''), p_offer ->> 'terms', nullif(btrim(p_offer ->> 'discount_text'), ''),
        nullif(btrim(p_offer ->> 'claim_url'), ''), nullif(btrim(p_offer ->> 'claim_code'), ''),
        coalesce((p_offer ->> 'starts_at')::timestamptz, now()), (p_offer ->> 'ends_at')::timestamptz, v_uid)
      returning * into v_after;
    else
      update public.partner_offers set
        title = btrim(p_offer ->> 'title'),
        description = p_offer ->> 'description',
        banner_path = nullif(btrim(p_offer ->> 'banner_path'), ''),
        terms = p_offer ->> 'terms',
        discount_text = nullif(btrim(p_offer ->> 'discount_text'), ''),
        claim_url = nullif(btrim(p_offer ->> 'claim_url'), ''),
        claim_code = nullif(btrim(p_offer ->> 'claim_code'), ''),
        starts_at = coalesce((p_offer ->> 'starts_at')::timestamptz, v_before.starts_at),
        ends_at = (p_offer ->> 'ends_at')::timestamptz
      where id = v_id
      returning * into v_after;
    end if;
  exception
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation
      or invalid_datetime_format or datetime_field_overflow then
      perform private.raise_error('VALIDATION_FAILED', sqlerrm);
  end;

  perform audit.write(case when v_id is null then 'partner_offer.created' else 'partner_offer.updated' end,
    'partner_offer', v_after.id, case when v_id is not null then to_jsonb(v_before) end, to_jsonb(v_after), null);
  return jsonb_build_object('partner_offer_id', v_after.id, 'status', v_after.status);
end;
$$;

-- Status changes. archived is final.
create or replace function api.set_partner_offer_status(p_offer_id uuid, p_status public.partner_offer_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.partner_offers;
begin
  perform private.require_permission('partner.manage', null);
  if p_status is null then
    perform private.raise_error('VALIDATION_FAILED', 'status');
  end if;
  select * into v_o from public.partner_offers where id = p_offer_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'partner_offer');
  end if;
  if v_o.status = 'archived' and p_status <> 'archived' then
    perform private.raise_error('CONFLICT', 'partner offer archived');
  end if;
  update public.partner_offers set status = p_status where id = v_o.id;
  perform audit.write('partner_offer.status_changed', 'partner_offer', v_o.id, jsonb_build_object('status', v_o.status),
    jsonb_build_object('status', p_status), null);
  return jsonb_build_object('partner_offer_id', v_o.id, 'status', p_status);
end;
$$;
