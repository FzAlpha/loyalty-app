-- 50_offers: eligibility engine table tests (§6.1, M5–6 exit), offer CRUD, RLS, storage.
-- Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(71);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000000aa', '910000000201', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e0000000-0000-0000-0000-0000000000ee', '910000000202', '{"full_name":"Exec"}',  '{"account_type":"staff"}'),
  ('ca000000-0000-0000-0000-0000000000ca', '919800000101', '{"full_name":"A"}', '{}'),
  ('cb000000-0000-0000-0000-0000000000cb', '919800000102', '{"full_name":"B"}', '{}'),
  ('cc000000-0000-0000-0000-0000000000cc', '919800000103', '{"full_name":"C"}', '{}'),
  ('cd000000-0000-0000-0000-0000000000cd', '919800000104', '{"full_name":"D"}', '{}'),
  ('ce000000-0000-0000-0000-0000000000ce', '919800000105', '{"full_name":"E"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000000b1', 'offers-biz', 'Offers Biz', 'Asia/Kolkata'),
  ('b2000000-0000-0000-0000-0000000000b2', 'offers-biz-utc', 'Offers Biz UTC', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000000aa', 'owner', null, null);
select private.grant_role('e0000000-0000-0000-0000-0000000000ee', 'executive', 'b1000000-0000-0000-0000-0000000000b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000000aa', null, 'Owner'),
  ('e0000000-0000-0000-0000-0000000000ee', 'b1000000-0000-0000-0000-0000000000b1', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa'),
  ('5e000000-0000-0000-0000-0000000000ee', 'e0000000-0000-0000-0000-0000000000ee'),
  ('5ca00000-0000-0000-0000-0000000000ca', 'ca000000-0000-0000-0000-0000000000ca'),
  ('5ce00000-0000-0000-0000-0000000000ce', 'ce000000-0000-0000-0000-0000000000ce');

-- Customers: A all good (birthday 12 Jun, in group), B disabled, C pending, D active member without
-- a card, E good but no birthday and no group.
update public.profiles set membership_status = 'active', date_of_birth = '1990-06-12' where id = 'ca000000-0000-0000-0000-0000000000ca';
update public.profiles set account_status = 'disabled', membership_status = 'active' where id = 'cb000000-0000-0000-0000-0000000000cb';
update public.profiles set membership_status = 'pending' where id = 'cc000000-0000-0000-0000-0000000000cc';
update public.profiles set membership_status = 'active' where id in ('cd000000-0000-0000-0000-0000000000cd', 'ce000000-0000-0000-0000-0000000000ce');
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000000ba', 'offers test', 3, 'a0000000-0000-0000-0000-0000000000aa');
insert into public.cards (batch_id, card_number, token_hash, status, current_customer_id) values
  ('ba000000-0000-0000-0000-0000000000ba', 'T-OFF-1', '\x01', 'active',  'ca000000-0000-0000-0000-0000000000ca'),
  ('ba000000-0000-0000-0000-0000000000ba', 'T-OFF-2', '\x02', 'active',  'ce000000-0000-0000-0000-0000000000ce'),
  ('ba000000-0000-0000-0000-0000000000ba', 'T-OFF-3', '\x03', 'pending', 'cc000000-0000-0000-0000-0000000000cc');
insert into public.customer_groups (id, key, name) values ('9a000000-0000-0000-0000-0000000000a1', 'vip_test', 'VIP test');
insert into public.customer_group_members (group_id, customer_id) values
  ('9a000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000ca');

-- Offers (business b1 = Asia/Kolkata unless noted). Reference time T = 2026-06-10 06:30 UTC
-- = Wednesday 12:00 in Kolkata.
insert into public.offers (id, business_id, title, status, starts_at, ends_at, max_uses_per_customer,
                           total_usage_limit, total_redeemed, birthday_window_days) values
  ('0f000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-0000000000b1', 'basic',      'active',   '2026-01-01', '2027-01-01', null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-0000000000b1', 'draft',      'draft',    '2026-01-01', '2027-01-01', null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-0000000000b1', 'expired',    'active',   '2026-01-01', '2026-03-01', null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-0000000000b1', 'future',     'active',   '2026-12-01', null,         null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-0000000000b1', 'sched',      'active',   '2026-01-01', null,         null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-0000000000b1', 'sched miss', 'active',   '2026-01-01', null,         null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-0000000000b1', 'group',      'active',   '2026-01-01', null,         null, null, 0, null),
  ('0f000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-0000000000b1', 'birthday',   'active',   '2026-01-01', null,         null, null, 0, 3),
  ('0f000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-0000000000b1', 'cust limit', 'active',   '2026-01-01', null,         1,    null, 0, null),
  ('0f000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-0000000000b1', 'total',      'active',   '2026-01-01', null,         null, 5,    5, null),
  ('0f000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-0000000000b2', 'utc sched',  'active',   '2026-01-01', null,         null, null, 0, null),
  ('0f000000-0000-0000-0000-00000000000c', 'b1000000-0000-0000-0000-0000000000b1', 'paused',     'paused',   '2026-01-01', null,         null, null, 0, null);
insert into public.offer_schedules (offer_id, weekday, start_time, end_time) values
  ('0f000000-0000-0000-0000-000000000005', 3, '11:00', '13:00'),
  ('0f000000-0000-0000-0000-000000000006', 3, '13:00', '14:00'),
  ('0f000000-0000-0000-0000-000000000006', 4, '11:00', '13:00'),
  ('0f000000-0000-0000-0000-00000000000b', 3, '06:00', '07:00');
insert into public.offer_eligible_groups (offer_id, group_id) values
  ('0f000000-0000-0000-0000-000000000007', '9a000000-0000-0000-0000-0000000000a1');
insert into public.offer_usage (offer_id, customer_id, used_count, last_used_at) values
  ('0f000000-0000-0000-0000-000000000009', 'ca000000-0000-0000-0000-0000000000ca', 1, '2026-06-01');

-- ---------------------------------------------------------------- eligibility table (M5–6 exit)
select is(extract(dow from ('2026-06-10 06:30+00'::timestamptz at time zone 'Asia/Kolkata'))::int, 3,
          'reference time is a Wednesday in Kolkata');

create temp table cases (label text, customer uuid, offer uuid, at timestamptz, expected text);
insert into cases values
  ('disabled account',               'cb000000-0000-0000-0000-0000000000cb', '0f000000-0000-0000-0000-000000000001', '2026-06-10 06:30+00', 'ACCOUNT_INACTIVE'),
  ('account checked before offer',   'cb000000-0000-0000-0000-0000000000cb', '0f000000-0000-0000-0000-000000000002', '2026-06-10 06:30+00', 'ACCOUNT_INACTIVE'),
  ('unknown customer',               '00000000-0000-0000-0000-00000000dead', '0f000000-0000-0000-0000-000000000001', '2026-06-10 06:30+00', 'ACCOUNT_INACTIVE'),
  ('pending membership',             'cc000000-0000-0000-0000-0000000000cc', '0f000000-0000-0000-0000-000000000001', '2026-06-10 06:30+00', 'MEMBERSHIP_INACTIVE'),
  ('no active card',                 'cd000000-0000-0000-0000-0000000000cd', '0f000000-0000-0000-0000-000000000001', '2026-06-10 06:30+00', 'CARD_INACTIVE'),
  ('basic offer',                    'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000001', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('draft offer',                    'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000002', '2026-06-10 06:30+00', 'OFFER_INACTIVE'),
  ('paused offer',                   'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-00000000000c', '2026-06-10 06:30+00', 'OFFER_INACTIVE'),
  ('expired offer',                  'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000003', '2026-06-10 06:30+00', 'OFFER_INACTIVE'),
  ('offer not started',              'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000004', '2026-06-10 06:30+00', 'OFFER_INACTIVE'),
  ('unknown offer',                  'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-0000000000ff', '2026-06-10 06:30+00', 'OFFER_INACTIVE'),
  ('inside schedule (local time)',   'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000005', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('outside schedule (local time)',  'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000005', '2026-06-10 11:00+00', 'OUTSIDE_SCHEDULE'),
  ('wrong time and wrong weekday',   'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000006', '2026-06-10 06:30+00', 'OUTSIDE_SCHEDULE'),
  ('schedule end is exclusive',      'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000005', '2026-06-10 07:30+00', 'OUTSIDE_SCHEDULE'),
  ('business time zone used',        'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-00000000000b', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('group member',                   'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000007', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('not in group',                   'ce000000-0000-0000-0000-0000000000ce', '0f000000-0000-0000-0000-000000000007', '2026-06-10 06:30+00', 'NOT_IN_GROUP'),
  ('birthday in 2 days',             'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000008', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('birthday 3 days ago',            'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000008', '2026-06-15 06:30+00', 'ELIGIBLE'),
  ('birthday 8 days ago',            'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000008', '2026-06-20 06:30+00', 'OUTSIDE_BIRTHDAY_WINDOW'),
  ('no birth date',                  'ce000000-0000-0000-0000-0000000000ce', '0f000000-0000-0000-0000-000000000008', '2026-06-10 06:30+00', 'OUTSIDE_BIRTHDAY_WINDOW'),
  ('per-customer limit used',        'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-000000000009', '2026-06-10 06:30+00', 'CUSTOMER_LIMIT_REACHED'),
  ('per-customer limit unused',      'ce000000-0000-0000-0000-0000000000ce', '0f000000-0000-0000-0000-000000000009', '2026-06-10 06:30+00', 'ELIGIBLE'),
  ('total limit reached',            'ca000000-0000-0000-0000-0000000000ca', '0f000000-0000-0000-0000-00000000000a', '2026-06-10 06:30+00', 'OFFER_LIMIT_REACHED');

select is(coalesce(r.reason_code, 'ELIGIBLE'), c.expected, 'eligibility: ' || c.label)
from cases c cross join lateral private.evaluate_offer(c.customer, c.offer, c.at) r
order by c.label;
select ok((select bool_and(r.eligible = (r.reason_code is null))
           from cases c cross join lateral private.evaluate_offer(c.customer, c.offer, c.at) r),
          'eligible is true exactly when there is no reason code');
select is(private.days_to_birthday('2000-02-29', '2027-02-28'), 0, '29 Feb birthday falls on 28 Feb in non-leap years');
select is(private.days_to_birthday('1990-12-31', '2027-01-02'), 2, 'birthday window crosses the year boundary');

-- ---------------------------------------------------------------- CRUD
select ok(not has_function_privilege('anon', 'api.upsert_offer(jsonb)', 'execute'), 'anon cannot upsert offers');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity and c.relname in
             ('offers', 'offer_schedules', 'customer_groups', 'customer_group_members', 'offer_eligible_groups', 'offer_usage')),
          6, 'RLS on all offer tables');

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000ee","role":"authenticated","session_id":"5e000000-0000-0000-0000-0000000000ee"}';
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000000b1","title":"x"}')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot manage offers');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000000aa"}';
create temp table t_new as select api.upsert_offer(jsonb_build_object(
  'business_id', 'b1000000-0000-0000-0000-0000000000b1', 'title', '  New offer ',
  'banner_path', 'b1000000-0000-0000-0000-0000000000b1/banner.png',
  'schedules', '[{"weekday":1,"start_time":"10:00","end_time":"12:00"}]'::jsonb,
  'group_ids', '["9a000000-0000-0000-0000-0000000000a1"]'::jsonb)) as r;
grant select on t_new to authenticated;
select is((select r ->> 'status' from t_new), 'draft', 'new offer starts as draft');
select is((select title from public.offers where id = (select (r ->> 'offer_id')::uuid from t_new)), 'New offer', 'title trimmed');
select is((select count(*)::int from public.offer_schedules where offer_id = (select (r ->> 'offer_id')::uuid from t_new)), 1,
          'schedules saved');
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000000b1","title":"x","starts_at":"2026-05-01","ends_at":"2026-04-01"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'end before start rejected');
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000000b1","title":"x","banner_path":"b2000000-0000-0000-0000-0000000000b2/x.png"}')$$,
                 'PT400', 'VALIDATION_FAILED', 'banner must live under the offer''s business');
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000000b1","title":"x","schedules":[{"weekday":7,"start_time":"10:00","end_time":"11:00"}]}')$$,
                 'PT400', 'VALIDATION_FAILED', 'bad weekday rejected');
select throws_ok($$select api.upsert_offer('{"business_id":"b1000000-0000-0000-0000-0000000000b1","title":""}')$$,
                 'PT400', 'VALIDATION_FAILED', 'empty title rejected');
select throws_ok($$select api.upsert_offer(jsonb_build_object('id', (select r ->> 'offer_id' from t_new), 'title', 'y',
                   'business_id', 'b2000000-0000-0000-0000-0000000000b2'))$$,
                 'PT400', 'VALIDATION_FAILED', 'business cannot change');

select is(api.upsert_offer(jsonb_build_object('id', (select r ->> 'offer_id' from t_new), 'title', 'Renamed')) ->> 'status',
          'draft', 'update keeps status');
select is((select count(*)::int from public.offer_schedules where offer_id = (select (r ->> 'offer_id')::uuid from t_new)), 1,
          'omitting schedules keeps them');
select api.upsert_offer(jsonb_build_object('id', (select r ->> 'offer_id' from t_new), 'title', 'Renamed', 'schedules', '[]'::jsonb));
select is((select count(*)::int from public.offer_schedules where offer_id = (select (r ->> 'offer_id')::uuid from t_new)), 0,
          'empty schedules clears them');
select is(api.set_offer_status((select (r ->> 'offer_id')::uuid from t_new), 'active') ->> 'status', 'active', 'owner activates offer');

-- customer feed + RLS
set local request.jwt.claims = '{"sub":"ca000000-0000-0000-0000-0000000000ca","role":"authenticated","session_id":"5ca00000-0000-0000-0000-0000000000ca"}';
select ok(exists(select 1 from api.list_eligible_offers() where id = (select (r ->> 'offer_id')::uuid from t_new)),
          'group member sees the new offer in the feed');
select throws_ok($$select api.set_offer_status((select (r ->> 'offer_id')::uuid from t_new), 'paused')$$,
                 'PT403', 'FORBIDDEN', 'customer cannot change offer status');
set local role authenticated;
select ok(exists(select 1 from public.offers where id = (select (r ->> 'offer_id')::uuid from t_new)), 'customer reads active offer');
select ok(not exists(select 1 from public.offers where id = '0f000000-0000-0000-0000-000000000002'), 'customer cannot read drafts');
select is((select count(*)::int from public.offer_usage), 1, 'customer sees only own usage');
reset role;

set local request.jwt.claims = '{"sub":"ce000000-0000-0000-0000-0000000000ce","role":"authenticated","session_id":"5ce00000-0000-0000-0000-0000000000ce"}';
select ok(not exists(select 1 from api.list_eligible_offers() where id = (select (r ->> 'offer_id')::uuid from t_new)),
          'non-member does not see the group offer');

-- archive is final
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000000aa"}';
select api.set_offer_status((select (r ->> 'offer_id')::uuid from t_new), 'archived');
select throws_ok($$select api.set_offer_status((select (r ->> 'offer_id')::uuid from t_new), 'active')$$,
                 'PT409', 'CONFLICT', 'archived offer cannot be reactivated');
select throws_ok($$select api.upsert_offer(jsonb_build_object('id', (select r ->> 'offer_id' from t_new), 'title', 'z'))$$,
                 'PT409', 'CONFLICT', 'archived offer cannot be edited');
select is((select count(*)::int from audit.audit_logs where action in ('offer.created', 'offer.updated', 'offer.status_changed')
           and entity_id = (select (r ->> 'offer_id')::uuid from t_new)), 5, 'offer changes audited');

-- ---------------------------------------------------------------- storage (§10)
select is((select count(*)::int from storage.buckets where public and id in (
             private.get_setting('storage.bucket.business_assets') #>> '{}',
             private.get_setting('storage.bucket.offer_banners') #>> '{}',
             private.get_setting('storage.bucket.partner_images') #>> '{}')), 3,
          'asset buckets (incl. partner images) exist and are public (public read)');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'rewards_assets_%'), 4, 'storage write policies installed');
select ok(api.storage_can_write('offer-banners', 'b1000000-0000-0000-0000-0000000000b1/x.png'), 'owner can write banners');
select ok(not api.storage_can_write('offer-banners', 'not-a-uuid/x.png'), 'path must start with a business id');
select ok(not api.storage_can_write('other-bucket', 'b1000000-0000-0000-0000-0000000000b1/x.png'), 'unknown bucket refused');
select ok(api.storage_can_write('partner-images', 'f0000000-0000-0000-0000-0000000000f1/logo.png'), 'owner can write partner images');
select ok(not api.storage_can_write('partner-images', 'not-a-uuid/logo.png'), 'partner image path must start with a uuid');
select ok(not api.storage_can_write('partner-images', 'f0000000-0000-0000-0000-0000000000f1'), 'partner image needs a file under the id folder');
select is(api.get_storage_buckets(), jsonb_build_object(
            'business_assets', private.get_setting('storage.bucket.business_assets') #>> '{}',
            'offer_banners',   private.get_setting('storage.bucket.offer_banners') #>> '{}',
            'partner_images',  private.get_setting('storage.bucket.partner_images') #>> '{}'),
          'get_storage_buckets returns the bucket settings');
select ok(has_function_privilege('authenticated', 'api.get_storage_buckets()', 'execute')
          and not has_function_privilege('anon', 'api.get_storage_buckets()', 'execute'),
          'get_storage_buckets: authenticated only');
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000ee","role":"authenticated","session_id":"5e000000-0000-0000-0000-0000000000ee"}';
select ok(not api.storage_can_write('offer-banners', 'b1000000-0000-0000-0000-0000000000b1/x.png'), 'executive cannot write banners');
select ok(not api.storage_can_write('partner-images', 'f0000000-0000-0000-0000-0000000000f1/logo.png'), 'executive cannot write partner images');
select is(api.get_storage_buckets() ->> 'partner_images', private.get_setting('storage.bucket.partner_images') #>> '{}',
          'executive can read bucket names');
set local request.jwt.claims = '{"sub":"ca000000-0000-0000-0000-0000000000ca","role":"authenticated","session_id":"5ca00000-0000-0000-0000-0000000000ca"}';
select ok(not api.storage_can_write('partner-images', 'f0000000-0000-0000-0000-0000000000f1/logo.png'), 'customer cannot write partner images');
select ok(not api.storage_can_write('offer-banners', 'b1000000-0000-0000-0000-0000000000b1/x.png'), 'customer cannot write banners');
select is(api.get_storage_buckets() ->> 'offer_banners', private.get_setting('storage.bucket.offer_banners') #>> '{}',
          'customer can read bucket names');
set local request.jwt.claims = '{"role":"anon"}';
select ok(not api.storage_can_write('partner-images', 'f0000000-0000-0000-0000-0000000000f1/logo.png'), 'anon cannot write partner images');
select throws_ok($$select api.get_storage_buckets()$$, 'PT401', 'UNAUTHENTICATED', 'anon cannot read bucket names');

select * from finish();
rollback;
