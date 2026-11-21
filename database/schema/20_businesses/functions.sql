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
