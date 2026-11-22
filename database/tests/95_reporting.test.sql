-- 95_reporting + api.list_audit_logs (M8): totals, groupings, time zones, scope, export rows, audit paging.
-- Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(42);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000008aa', '910000000801', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000008e1', '910000000802', '{"full_name":"Rep Exec"}', '{"account_type":"staff"}'),
  ('f1000000-0000-0000-0000-0000000008f1', '910000000803', '{"full_name":"Reporter"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000008c1', '919800000801', '{"full_name":"Asha"}', '{}'),
  ('c2000000-0000-0000-0000-0000000008c2', '919800000802', '{"full_name":"Bina"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000008b1', 'rep-biz-1', 'Rep Biz UTC', 'UTC'),
  ('b2000000-0000-0000-0000-0000000008b2', 'rep-biz-2', 'Rep Biz IST', 'Asia/Kolkata');
-- A business-scoped reporting role (test only; Phase 1 has no such role) to check scoping.
insert into public.roles (id, key, name) values ('70000000-0000-0000-0000-000000000801', 'rep_test', 'Report test');
insert into public.role_permissions (role_id, permission_id)
select '70000000-0000-0000-0000-000000000801', id from public.permissions where key in ('report.view', 'audit.view');
select private.grant_role('a0000000-0000-0000-0000-0000000008aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000008e1', 'executive', 'b1000000-0000-0000-0000-0000000008b1', null);
select private.grant_role('f1000000-0000-0000-0000-0000000008f1', 'rep_test', 'b1000000-0000-0000-0000-0000000008b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000008aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000008e1', 'b1000000-0000-0000-0000-0000000008b1', 'Rep Exec'),
  ('f1000000-0000-0000-0000-0000000008f1', 'b1000000-0000-0000-0000-0000000008b1', 'Reporter');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000008aa', 'a0000000-0000-0000-0000-0000000008aa'),
  ('5e100000-0000-0000-0000-0000000008e1', 'e1000000-0000-0000-0000-0000000008e1'),
  ('5f100000-0000-0000-0000-0000000008f1', 'f1000000-0000-0000-0000-0000000008f1'),
  ('5c100000-0000-0000-0000-0000000008c1', 'c1000000-0000-0000-0000-0000000008c1');
update public.profiles set membership_status = 'active', date_of_birth = '1990-06-12' where id = 'c1000000-0000-0000-0000-0000000008c1';
update public.profiles set membership_status = 'active', date_of_birth = '1985-06-03' where id = 'c2000000-0000-0000-0000-0000000008c2';
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000008ba', 'report test', 2, 'a0000000-0000-0000-0000-0000000008aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000008c1', 'ba000000-0000-0000-0000-0000000008ba', 'T-REP-1', '\x0801', 'active', 'c1000000-0000-0000-0000-0000000008c1'),
  ('cad20000-0000-0000-0000-0000000008c2', 'ba000000-0000-0000-0000-0000000008ba', 'T-REP-2', '\x0802', 'active', 'c2000000-0000-0000-0000-0000000008c2');
insert into public.offers (id, business_id, title, status, starts_at) values
  ('0f000000-0000-0000-0000-000000000801', 'b1000000-0000-0000-0000-0000000008b1', 'Rep offer 1', 'active', '2026-01-01Z'),
  ('0f000000-0000-0000-0000-000000000802', 'b2000000-0000-0000-0000-0000000008b2', 'Rep offer 2', 'active', '2026-01-01Z');
-- R4 is 20:00 UTC on 1 Mar = 01:30 on 2 Mar in Asia/Kolkata.
insert into public.redemptions (claim_token_id, idempotency_key, customer_id, card_id, offer_id, business_id,
                                executive_id, bill_amount, redeemed_at) values
  (gen_random_uuid(), 'rep-key-0001', 'c1000000-0000-0000-0000-0000000008c1', 'cad10000-0000-0000-0000-0000000008c1',
   '0f000000-0000-0000-0000-000000000801', 'b1000000-0000-0000-0000-0000000008b1', 'e1000000-0000-0000-0000-0000000008e1', 100, '2026-03-01 10:00Z'),
  (gen_random_uuid(), 'rep-key-0002', 'c2000000-0000-0000-0000-0000000008c2', 'cad20000-0000-0000-0000-0000000008c2',
   '0f000000-0000-0000-0000-000000000801', 'b1000000-0000-0000-0000-0000000008b1', 'e1000000-0000-0000-0000-0000000008e1', 50, '2026-03-01 23:30Z'),
  (gen_random_uuid(), 'rep-key-0003', 'c1000000-0000-0000-0000-0000000008c1', 'cad10000-0000-0000-0000-0000000008c1',
   '0f000000-0000-0000-0000-000000000801', 'b1000000-0000-0000-0000-0000000008b1', 'e1000000-0000-0000-0000-0000000008e1', null, '2026-03-02 09:00Z'),
  (gen_random_uuid(), 'rep-key-0004', 'c1000000-0000-0000-0000-0000000008c1', 'cad10000-0000-0000-0000-0000000008c1',
   '0f000000-0000-0000-0000-000000000802', 'b2000000-0000-0000-0000-0000000008b2', 'a0000000-0000-0000-0000-0000000008aa', 200, '2026-03-01 20:00Z');
insert into audit.audit_logs (business_id, action, entity_type, entity_id, created_at) values
  ('b1000000-0000-0000-0000-0000000008b1', 'rep.a', 'rep_test', gen_random_uuid(), '2026-03-01 01:00Z'),
  ('b1000000-0000-0000-0000-0000000008b1', 'rep.b', 'rep_test', gen_random_uuid(), '2026-03-01 02:00Z'),
  ('b1000000-0000-0000-0000-0000000008b1', 'rep.a', 'rep_test', gen_random_uuid(), '2026-03-01 03:00Z'),
  ('b2000000-0000-0000-0000-0000000008b2', 'rep.a', 'rep_test', gen_random_uuid(), '2026-03-01 04:00Z');

-- ---------------------------------------------------------------- owner: totals and groupings
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000008aa","role":"authenticated","session_id":"5a000000-0000-0000-0000-0000000008aa"}';
select is((select r ->> 'redemptions' || '/' || (r ->> 'unique_customers') || '/' || (r ->> 'bill_total')
           from (select api.report_summary(null, '2026-03-01Z', '2026-04-01Z') r) x), '4/2/350.00',
          'all-business summary totals');
select is((select r ->> 'redemptions' || '/' || (r ->> 'bill_total')
           from (select api.report_summary('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z') r) x), '3/150.00',
          'business summary totals');
select ok(not (api.report_summary('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z') ? 'active_members'),
          'business summary has no global customer counts');
select ok((api.report_summary(null, '2026-03-01Z', '2026-04-01Z') ->> 'active_members')::int >= 2,
          'all-business summary counts active members');
select is((api.report_summary('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z') ->> 'active_offers')::int, 1,
          'active offers counted per business');
select results_eq(
  $$select bucket, redemptions, bill_total from api.report_redemptions('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z', 'day')$$,
  $$values ('2026-03-01', 2::bigint, 150::numeric), ('2026-03-02', 1::bigint, 0::numeric)$$,
  'redemptions by day (UTC business)');
select is((select bucket from api.report_redemptions('b2000000-0000-0000-0000-0000000008b2', '2026-03-01Z', '2026-04-01Z', 'day')),
          '2026-03-02', 'day bucket uses the business time zone');
select is((select bucket || ':' || redemptions from api.report_redemptions(null, '2026-03-01Z', '2026-04-01Z', 'month')),
          '2026-03:4', 'redemptions by month');
select results_eq(
  $$select label, redemptions from api.report_redemptions(null, '2026-03-01Z', '2026-04-01Z', 'business')$$,
  $$values ('Rep Biz UTC', 3::bigint), ('Rep Biz IST', 1::bigint)$$,
  'redemptions by business, busiest first');
select is((select label || ':' || unique_customers from api.report_redemptions(null, '2026-03-01Z', '2026-04-01Z', 'offer') limit 1),
          'Rep offer 1:2', 'redemptions by offer');
select is((select label || ':' || redemptions from api.report_redemptions('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z', 'executive')),
          'Rep Exec:3', 'redemptions by executive');
select is((select count(*)::int from api.report_redemptions(null, '2026-03-01 23:30Z', '2026-03-02 09:00Z', 'day')), 1,
          'window start inclusive, end exclusive');
select throws_ok($$select * from api.report_redemptions(null, '2026-03-01Z', '2026-04-01Z', 'week')$$,
                 'PT400', 'VALIDATION_FAILED', 'unknown grouping rejected');
select throws_ok($$select api.report_summary(null, '2025-01-01Z', '2026-04-01Z')$$,
                 'PT400', 'VALIDATION_FAILED', 'range over report.max_range_days rejected');
select throws_ok($$select api.report_summary(null, '2026-04-01Z', '2026-03-01Z')$$,
                 'PT400', 'VALIDATION_FAILED', 'reversed range rejected');
select throws_ok($$select api.report_summary('99999999-0000-0000-0000-000000000000', '2026-03-01Z', '2026-04-01Z')$$,
                 'PT400', 'VALIDATION_FAILED', 'unknown business rejected');

-- signups and birthdays (global)
select ok((select sum(new_customers) from api.report_signups(now() - interval '1 day', now() + interval '1 day')) >= 2,
          'signups counted by month');
select ok((select count(*) from api.report_signups(now() - interval '1 day', now() + interval '1 day')
           where month = to_char(now() at time zone (private.get_setting('locale.timezone') #>> '{}'), 'YYYY-MM')) = 1, 'signup month in locale.timezone');
select results_eq(
  $$select birth_day, customer ->> 'full_name' from api.report_birthdays(6) where customer ->> 'full_name' in ('Asha', 'Bina')$$,
  $$values (3, 'Bina'), (12, 'Asha')$$, 'birthdays in June ordered by day');
select is((select customer ->> 'phone_masked' from api.report_birthdays(6) where customer ->> 'full_name' = 'Asha'),
          '******0801', 'birthday report masks the phone');
select ok(not exists (select 1 from api.report_birthdays(6) where customer ? 'date_of_birth'), 'birthday report has no birth year');
select throws_ok($$select * from api.report_birthdays(13)$$, 'PT400', 'VALIDATION_FAILED', 'month must be 1-12');

-- export rows
select is((select count(*)::int from api.report_redemption_rows('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z')),
          3, 'export rows for one business');
select is((select offer || '|' || executive || '|' || phone_masked || '|' || card_number
           from api.report_redemption_rows('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z') limit 1),
          'Rep offer 1|Rep Exec|******0801|T-REP-1', 'export row is masked and labelled');
update public.app_settings set value = '2' where key = 'report.export_max_rows' and scope_business_id is null;
select is((select count(*)::int from api.report_redemption_rows(null, '2026-03-01Z', '2026-04-01Z')), 3,
          'export returns max + 1 rows so truncation is visible');
select is(api.report_export_max_rows(), 2, 'export cap exposed to the Edge Function');

-- audit viewer
create temp table pg1 as
  select * from api.list_audit_logs('b1000000-0000-0000-0000-0000000008b1', null, 'rep_test', p_limit => 2);
select results_eq($$select action from pg1$$, $$values ('rep.a'), ('rep.b')$$, 'audit page 1, newest first');
select results_eq(
  $$select action from api.list_audit_logs('b1000000-0000-0000-0000-0000000008b1', null, 'rep_test',
      p_before_at => (select created_at from pg1 order by created_at limit 1),
      p_before_id => (select id from pg1 order by created_at limit 1), p_limit => 2)$$,
  $$values ('rep.a')$$, 'audit page 2 via cursor');
select is((select count(*)::int from api.list_audit_logs(null, 'rep.a', 'rep_test')), 3, 'audit filter by action, all businesses');
select throws_ok($$select * from api.list_audit_logs(p_limit => 0)$$, 'PT400', 'VALIDATION_FAILED', 'audit limit must be positive');
select throws_ok($$select * from api.list_audit_logs(p_limit => 201)$$, 'PT400', 'VALIDATION_FAILED', 'audit limit capped by setting');
select throws_ok($$select * from api.list_audit_logs(p_before_at => now())$$, 'PT400', 'VALIDATION_FAILED', 'cursor needs both parts');

-- ---------------------------------------------------------------- business-scoped reporter
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000008f1","role":"authenticated","session_id":"5f100000-0000-0000-0000-0000000008f1"}';
select is((api.report_summary('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z') ->> 'redemptions'), '3',
          'scoped reporter sees own business');
select throws_ok($$select api.report_summary('b2000000-0000-0000-0000-0000000008b2', '2026-03-01Z', '2026-04-01Z')$$,
                 'PT403', 'FORBIDDEN', 'scoped reporter refused other business');
select throws_ok($$select api.report_summary(null, '2026-03-01Z', '2026-04-01Z')$$,
                 'PT403', 'FORBIDDEN', 'scoped reporter refused all-business report');
select throws_ok($$select * from api.report_birthdays(6)$$, 'PT403', 'FORBIDDEN', 'birthdays need global report.view');
select is((select count(*)::int from api.list_audit_logs('b1000000-0000-0000-0000-0000000008b1', null, 'rep_test')), 3,
          'scoped reporter reads own business audit');
select throws_ok($$select * from api.list_audit_logs('b2000000-0000-0000-0000-0000000008b2')$$,
                 'PT403', 'FORBIDDEN', 'scoped reporter refused other business audit');

-- ---------------------------------------------------------------- executive, customer, anon
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000008e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000008e1"}';
select throws_ok($$select api.report_summary('b1000000-0000-0000-0000-0000000008b1', '2026-03-01Z', '2026-04-01Z')$$,
                 'PT403', 'FORBIDDEN', 'executive has no report.view');
select throws_ok($$select * from api.list_audit_logs('b1000000-0000-0000-0000-0000000008b1')$$,
                 'PT403', 'FORBIDDEN', 'executive has no audit.view');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000008c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000008c1"}';
select throws_ok($$select * from api.report_redemption_rows(null, '2026-03-01Z', '2026-04-01Z')$$,
                 'PT403', 'FORBIDDEN', 'customer cannot export');
select ok(not has_function_privilege('anon', 'api.report_summary(uuid, timestamptz, timestamptz)', 'execute'),
          'anon cannot run reports');

select * from finish();
rollback;
