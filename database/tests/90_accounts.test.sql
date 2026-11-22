-- 90_accounts: customer deletion request, anonymisation, card block, unchecked-account purge,
-- service-role claim/complete used by jobs-runner (M9).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000009aa', '910000000901', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000009e1', '910000000902', '{"full_name":"Exec"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000009c1', '919800000901', '{"full_name":"Cust One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000009c2', '919800000902', '{"full_name":"Cust Old"}', '{}'),
  ('c3000000-0000-0000-0000-0000000009c3', '919800000903', '{"full_name":"Cust Checked"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000009b1', 'accounts-biz-1', 'Accounts Biz 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000009aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000009e1', 'executive', 'b1000000-0000-0000-0000-0000000009b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000009aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000009e1', 'b1000000-0000-0000-0000-0000000009b1', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5e100000-0000-0000-0000-0000000009e1', 'e1000000-0000-0000-0000-0000000009e1'),
  ('5c100000-0000-0000-0000-0000000009c1', 'c1000000-0000-0000-0000-0000000009c1');
update public.profiles set date_of_birth = '1990-01-31', membership_status = 'active'
where id = 'c1000000-0000-0000-0000-0000000009c1';
-- c2 registered long ago and never checked in store; c3 is old but passed a check.
update public.profiles set created_at = now() - interval '10 years'
where id in ('c2000000-0000-0000-0000-0000000009c2', 'c3000000-0000-0000-0000-0000000009c3');
insert into public.identity_checks (customer_id, executive_id, business_id, evidence, result) values
  ('c3000000-0000-0000-0000-0000000009c3', 'e1000000-0000-0000-0000-0000000009e1', 'b1000000-0000-0000-0000-0000000009b1',
   '{registration_details}', 'passed');
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000009ba', 'accounts test', 1, 'a0000000-0000-0000-0000-0000000009aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000009c1', 'ba000000-0000-0000-0000-0000000009ba', 'T-ACC-1', '\x0901', 'active', 'c1000000-0000-0000-0000-0000000009c1');
create temp table q (name text primary key, r jsonb);

-- ---------------------------------------------------------------- structure + grants
select ok((select relrowsecurity from pg_class where oid = 'public.deletion_requests'::regclass), 'RLS on deletion_requests');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'deletion_requests'), 0, 'no policies');
select ok(not has_table_privilege('authenticated', 'public.deletion_requests', 'select'), 'authenticated cannot read deletion_requests');
select ok(not has_function_privilege('anon', 'api.request_account_deletion()', 'execute'), 'anon cannot request deletion');
select ok(not has_function_privilege('authenticated', 'api.svc_claim_due_deletions(integer)', 'execute'), 'svc claim is service-role only');
select ok(not has_function_privilege('authenticated', 'api.svc_complete_deletion(uuid,text)', 'execute'), 'svc complete is service-role only');

-- ---------------------------------------------------------------- customer request
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000009c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000009c1"}';
insert into q values ('d1', api.request_account_deletion());
select is((select r ->> 'status' from q where name = 'd1'), 'requested', 'customer requests deletion');
select is((select process_after from public.deletion_requests where user_id = 'c1000000-0000-0000-0000-0000000009c1'),
          now() + make_interval(days => (private.get_setting('retention.deleted_account_days'))::integer),
          'auth removal waits retention.deleted_account_days');
select ok((select full_name = '' and phone_e164 is null and date_of_birth is null and account_status = 'deletion_pending'
           from public.profiles where id = 'c1000000-0000-0000-0000-0000000009c1'), 'profile anonymised at once');
select ok((select phone is null and raw_user_meta_data = '{}'::jsonb and banned_until > now()
           from auth.users where id = 'c1000000-0000-0000-0000-0000000009c1'), 'auth user anonymised, phone freed, banned');
select is((select count(*)::int from auth.sessions where user_id = 'c1000000-0000-0000-0000-0000000009c1'), 0, 'sessions revoked');
select is((select status::text from public.cards where id = 'cad10000-0000-0000-0000-0000000009c1'), 'blocked', 'card blocked');
select is((select current_customer_id from public.cards where id = 'cad10000-0000-0000-0000-0000000009c1'),
          'c1000000-0000-0000-0000-0000000009c1'::uuid, 'blocked card stays linked (never reused)');
select ok(exists (select 1 from audit.audit_logs where action = 'account.deletion_requested'
                  and entity_id = 'c1000000-0000-0000-0000-0000000009c1' and actor_id = 'c1000000-0000-0000-0000-0000000009c1'),
          'request audited with the customer as actor');
select throws_ok($$select api.request_account_deletion()$$, 'PT401', 'UNAUTHENTICATED', 'revoked session cannot call again');
insert into auth.sessions (id, user_id) values ('5c1b0000-0000-0000-0000-0000000009c1', 'c1000000-0000-0000-0000-0000000009c1');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000009c1","role":"authenticated","session_id":"5c1b0000-0000-0000-0000-0000000009c1"}';
select throws_ok($$select api.request_account_deletion()$$, 'PT409', 'ACCOUNT_DELETION_PENDING', 'second request refused');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000009e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000009e1"}';
select throws_ok($$select api.request_account_deletion()$$, 'PT403', 'FORBIDDEN', 'staff cannot self-delete here');

-- ---------------------------------------------------------------- purge_unchecked_accounts
select is(private.purge_unchecked_accounts(), 1, 'one unchecked old account purged');
select ok((select reason = 'unchecked_account' and process_after <= now() and requested_by is null
           from public.deletion_requests where user_id = 'c2000000-0000-0000-0000-0000000009c2'), 'queued for immediate removal');
select ok(not exists (select 1 from public.deletion_requests where user_id = 'c3000000-0000-0000-0000-0000000009c3'),
          'checked customer kept');

-- ---------------------------------------------------------------- claim + complete (jobs-runner)
create temp table claimed as select * from api.svc_claim_due_deletions(10);
select is((select count(*)::int from claimed), 1, 'only the due request is claimed');
select is((select user_id from claimed), 'c2000000-0000-0000-0000-0000000009c2'::uuid, 'claimed the purged account');
select ok((select status = 'processing' and attempts = 1 from public.deletion_requests where user_id = 'c2000000-0000-0000-0000-0000000009c2'),
          'claimed request is processing');
select is((select count(*)::int from api.svc_claim_due_deletions(10)), 0, 'processing request is not claimed twice');
select lives_ok(format('select api.svc_complete_deletion(%L)', (select request_id from claimed)), 'complete without error');
select ok((select status = 'completed' and completed_at is not null from public.deletion_requests
           where user_id = 'c2000000-0000-0000-0000-0000000009c2'), 'request completed');
select is((select account_status::text from public.profiles where id = 'c2000000-0000-0000-0000-0000000009c2'), 'deleted', 'account deleted');
select throws_ok(format('select api.svc_complete_deletion(%L)', (select request_id from claimed)),
                 'PT409', 'CONFLICT', 'completed request cannot be completed again');
select throws_ok($$select api.svc_complete_deletion('99999999-0000-0000-0000-000000000000')$$, 'PT404', 'NOT_FOUND', 'unknown request');

-- failure path: Auth Admin error is recorded and the request is retried
update public.deletion_requests set process_after = now() - interval '1 second' where user_id = 'c1000000-0000-0000-0000-0000000009c1';
create temp table claimed2 as select * from api.svc_claim_due_deletions(10);
select is((select count(*)::int from claimed2), 1, 'due customer request claimed');
select lives_ok(format('select api.svc_complete_deletion(%L, %L)', (select request_id from claimed2), 'auth 500'), 'complete with error');
select ok((select status = 'failed' and error = 'auth 500' from public.deletion_requests where user_id = 'c1000000-0000-0000-0000-0000000009c1'),
          'failure recorded');
select is(private.deletion_due_count(), 1, 'failed request is due again');
select throws_ok($$select * from api.svc_claim_due_deletions(0)$$, 'PT400', 'VALIDATION_FAILED', 'limit must be positive');

select * from finish();
rollback;
