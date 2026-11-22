-- 95_reporting: owner/report RPCs (BACKEND_PLAN.md §5 api.report_*, M8). Read-only.
-- Reporting is the one module that reads other modules' tables directly (plan §1: "report
-- views/RPCs"); it never writes them.
-- Scope: p_business_id null = all businesses and needs report.view globally (owner);
-- otherwise report.view at that business. Day/month buckets use the business time zone, or
-- locale.timezone for all-business reports.

create or replace function private.report_tz(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.timezone from public.businesses b where b.id = p_business_id),
                  private.get_setting('locale.timezone') #>> '{}');
$$;

-- Permission + window checks shared by every report. Returns the time zone to bucket in.
create or replace function private.report_guard(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_auth();
  if not private.can('report.view', p_business_id) then
    perform private.raise_error('FORBIDDEN', 'report.view');
  end if;
  if p_business_id is not null and not exists (select 1 from public.businesses where id = p_business_id) then
    perform private.raise_error('VALIDATION_FAILED', 'business_id');
  end if;
  if p_from is null or p_to is null or p_to <= p_from
     or p_to - p_from > make_interval(days => (private.get_setting('report.max_range_days'))::integer) then
    perform private.raise_error('VALIDATION_FAILED', 'range');
  end if;
  return private.report_tz(p_business_id);
end;
$$;

-- Totals for [p_from, p_to). Customer counts are global, so they are only returned for
-- all-business reports.
create or replace function api.report_summary(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r jsonb;
begin
  perform private.report_guard(p_business_id, p_from, p_to);
  select jsonb_build_object(
           'redemptions', count(*),
           'unique_customers', count(distinct r.customer_id),
           'bill_total', coalesce(sum(r.bill_amount), 0))
  into v_r
  from public.redemptions r
  where r.redeemed_at >= p_from and r.redeemed_at < p_to
    and (p_business_id is null or r.business_id = p_business_id);

  v_r := v_r || jsonb_build_object('active_offers',
    (select count(*) from public.offers o
     where o.status = 'active' and (p_business_id is null or o.business_id = p_business_id)));

  if p_business_id is null then
    v_r := v_r || (
      select jsonb_build_object(
               'new_customers', count(*) filter (where p.created_at >= p_from and p.created_at < p_to),
               'active_members', count(*) filter (where p.membership_status = 'active' and p.account_status = 'active'),
               'pending_members', count(*) filter (where p.membership_status = 'pending' and p.account_status = 'active'))
      from public.profiles p
      where not private.is_staff(p.id) and p.account_status <> 'deleted');
  end if;
  return v_r || jsonb_build_object('business_id', p_business_id, 'from', p_from, 'to', p_to);
end;
$$;

-- Redemptions grouped by day | month | business | offer | executive.
create or replace function api.report_redemptions(
  p_business_id uuid, p_from timestamptz, p_to timestamptz, p_group_by text)
returns table (bucket text, label text, redemptions bigint, unique_customers bigint, bill_total numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := private.report_guard(p_business_id, p_from, p_to);
begin
  if p_group_by is null or p_group_by not in ('day', 'month', 'business', 'offer', 'executive') then
    perform private.raise_error('VALIDATION_FAILED', 'group_by');
  end if;
  return query
  with r as (
    select x.*, case p_group_by
                  when 'day'       then to_char(x.redeemed_at at time zone v_tz, 'YYYY-MM-DD')
                  when 'month'     then to_char(x.redeemed_at at time zone v_tz, 'YYYY-MM')
                  when 'business'  then x.business_id::text
                  when 'offer'     then x.offer_id::text
                  else x.executive_id::text end as k
    from public.redemptions x
    where x.redeemed_at >= p_from and x.redeemed_at < p_to
      and (p_business_id is null or x.business_id = p_business_id)
  )
  select r.k,
         case p_group_by
           when 'business'  then (select b.name from public.businesses b where b.id::text = r.k)
           when 'offer'     then (select o.title from public.offers o where o.id::text = r.k)
           when 'executive' then (select s.display_name from public.staff s where s.user_id::text = r.k)
           else r.k end,
         count(*), count(distinct r.customer_id), coalesce(sum(r.bill_amount), 0)
  from r
  group by r.k
  order by case when p_group_by in ('day', 'month') then r.k end, count(*) desc, r.k;
end;
$$;

-- New customer accounts per month (customers are global: all-business report.view only).
create or replace function api.report_signups(p_from timestamptz, p_to timestamptz)
returns table (month text, new_customers bigint, now_active_members bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := private.report_guard(null, p_from, p_to);
begin
  return query
  select to_char(p.created_at at time zone v_tz, 'YYYY-MM'), count(*),
         count(*) filter (where p.membership_status = 'active')
  from public.profiles p
  where p.created_at >= p_from and p.created_at < p_to
    and not private.is_staff(p.id) and p.account_status <> 'deleted'
  group by 1 order by 1;
end;
$$;

-- Active members with a birthday in p_month (1–12): masked customer + day of month, no year.
create or replace function api.report_birthdays(p_month integer)
returns table (birth_day integer, customer jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_auth();
  if not private.can('report.view', null) then
    perform private.raise_error('FORBIDDEN', 'report.view');
  end if;
  if p_month is null or p_month not between 1 and 12 then
    perform private.raise_error('VALIDATION_FAILED', 'month');
  end if;
  return query
  select extract(day from p.date_of_birth)::integer, private.customer_masked(p.id)
  from public.profiles p
  where extract(month from p.date_of_birth) = p_month
    and p.membership_status = 'active' and p.account_status = 'active'
    and not private.is_staff(p.id)
  order by 1, p.full_name;
end;
$$;

-- Row-level redemptions for CSV export (reports-export Edge Function). Returns at most
-- report.export_max_rows + 1 rows so the caller can tell the export was cut off.
create or replace function api.report_redemption_rows(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (redeemed_at timestamptz, business text, offer text, executive text, customer_name text,
               phone_masked text, card_number text, bill_number text, bill_amount numeric, redemption_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.report_guard(p_business_id, p_from, p_to);
  return query
  select r.redeemed_at, b.name, o.title, s.display_name, c.customer ->> 'full_name',
         c.customer ->> 'phone_masked', cd.card_number, r.bill_number, r.bill_amount, r.id
  from public.redemptions r
  join public.businesses b on b.id = r.business_id
  join public.offers o on o.id = r.offer_id
  left join public.staff s on s.user_id = r.executive_id
  left join public.cards cd on cd.id = r.card_id
  cross join lateral (select private.customer_masked(r.customer_id) as customer) c
  where r.redeemed_at >= p_from and r.redeemed_at < p_to
    and (p_business_id is null or r.business_id = p_business_id)
  order by r.redeemed_at, r.id
  limit (private.get_setting('report.export_max_rows'))::integer + 1;
end;
$$;

-- Export cap for the reports-export Edge Function (report.export_max_rows).
create or replace function api.report_export_max_rows()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_auth();
  if not private.can_any('report.view') then
    perform private.raise_error('FORBIDDEN', 'report.view');
  end if;
  return (private.get_setting('report.export_max_rows'))::integer;
end;
$$;
