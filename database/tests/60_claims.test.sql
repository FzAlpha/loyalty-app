-- 60_claims + 70_redemptions: create / preview / redeem (§6, §8), idempotency, limits, jobs, RLS.
-- Runs as postgres inside one rolled-back transaction. now() is fixed for the whole transaction,
-- so expiry is tested by moving expires_at into the past.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(58);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000007aa', '910000000701', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000007e1', '910000000702', '{"full_name":"Exec One"}', '{"account_type":"staff"}'),
  ('e2000000-0000-0000-0000-0000000007e2', '910000000703', '{"full_name":"Exec Two"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000007c1', '919800000701', '{"full_name":"Cust One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000007c2', '919800000702', '{"full_name":"Cust Two"}', '{}'),
  ('c3000000-0000-0000-0000-0000000007c3', '919800000703', '{"full_name":"Cust Three"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000007b1', 'claims-biz-1', 'Claims Biz 1', 'UTC'),
  ('b2000000-0000-0000-0000-0000000007b2', 'claims-biz-2', 'Claims Biz 2', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000007aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000007e1', 'executive', 'b1000000-0000-0000-0000-0000000007b1', null);
select private.grant_role('e2000000-0000-0000-0000-0000000007e2', 'executive', 'b2000000-0000-0000-0000-0000000007b2', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000007aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000007e1', 'b1000000-0000-0000-0000-0000000007b1', 'Exec One'),
  ('e2000000-0000-0000-0000-0000000007e2', 'b2000000-0000-0000-0000-0000000007b2', 'Exec Two');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-0000000007aa', 'a0000000-0000-0000-0000-0000000007aa'),
  ('5e100000-0000-0000-0000-0000000007e1', 'e1000000-0000-0000-0000-0000000007e1'),
  ('5e200000-0000-0000-0000-0000000007e2', 'e2000000-0000-0000-0000-0000000007e2'),
  ('5c100000-0000-0000-0000-0000000007c1', 'c1000000-0000-0000-0000-0000000007c1'),
  ('5c200000-0000-0000-0000-0000000007c2', 'c2000000-0000-0000-0000-0000000007c2'),
  ('5c300000-0000-0000-0000-0000000007c3', 'c3000000-0000-0000-0000-0000000007c3');
update public.profiles set membership_status = 'active'
where id in ('c1000000-0000-0000-0000-0000000007c1', 'c2000000-0000-0000-0000-0000000007c2', 'c3000000-0000-0000-0000-0000000007c3');
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000007ba', 'claims test', 2, 'a0000000-0000-0000-0000-0000000007aa');
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000007c1', 'ba000000-0000-0000-0000-0000000007ba', 'T-CLM-1', '\x0701', 'active', 'c1000000-0000-0000-0000-0000000007c1'),
  ('cad20000-0000-0000-0000-0000000007c2', 'ba000000-0000-0000-0000-0000000007ba', 'T-CLM-2', '\x0702', 'active', 'c2000000-0000-0000-0000-0000000007c2');

-- o1 basic (2 per customer), o2 min purchase 500, o3 total limit 1, o4 at b2, o5 draft.
insert into public.offers (id, business_id, title, status, starts_at, max_uses_per_customer, total_usage_limit,
                           min_purchase_amount) values
  ('0f000000-0000-0000-0000-000000000701', 'b1000000-0000-0000-0000-0000000007b1', 'basic',   'active', now() - interval '1 day', 2,    null, null),
  ('0f000000-0000-0000-0000-000000000702', 'b1000000-0000-0000-0000-0000000007b1', 'min500',  'active', now() - interval '1 day', null, null, 500),
  ('0f000000-0000-0000-0000-000000000703', 'b1000000-0000-0000-0000-0000000007b1', 'total1',  'active', now() - interval '1 day', null, 1,    null),
  ('0f000000-0000-0000-0000-000000000704', 'b2000000-0000-0000-0000-0000000007b2', 'biz2',    'active', now() - interval '1 day', null, null, null),
  ('0f000000-0000-0000-0000-000000000705', 'b1000000-0000-0000-0000-0000000007b1', 'draft',   'draft',  now() - interval '1 day', null, null, null);

create temp table q (name text primary key, r jsonb);

-- ---------------------------------------------------------------- create (customer)
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
insert into q values ('t1', api.create_claim_token('0f000000-0000-0000-0000-000000000701'));
select ok((select r ->> 'qr_payload' from q where name = 't1')
            ~ ('^GR\.Q\.1\.' || (select r ->> 'claim_id' from q where name = 't1') || '\.[A-Za-z0-9_-]{43}$'),
          'claim payload is GR.Q.1.<id>.<32-byte secret>');
select is((select expires_at from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't1')),
          now() + interval '600 seconds', 'expiry from claims.ttl_seconds');
select is((select secret_hash from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't1')),
          sha256(private.base64url_decode(split_part((select r ->> 'qr_payload' from q where name = 't1'), '.', 5))),
          'only sha256(secret) is stored');
select is((select card_id from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't1')),
          'cad10000-0000-0000-0000-0000000007c1'::uuid, 'token bound to the active card');
insert into q values ('t2', api.create_claim_token('0f000000-0000-0000-0000-000000000701'));
select is((select status::text from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't1')),
          'revoked', 'new token revokes the previous open one');
select is((select count(*)::int from public.claim_tokens where customer_id = 'c1000000-0000-0000-0000-0000000007c1'
           and offer_id = '0f000000-0000-0000-0000-000000000701' and status = 'open'), 1, 'one open token per customer and offer');
select throws_ok($$select api.create_claim_token('0f000000-0000-0000-0000-000000000705')$$,
                 'PT409', 'OFFER_INACTIVE', 'draft offer cannot be claimed');
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-0000000007c3","role":"authenticated","session_id":"5c300000-0000-0000-0000-0000000007c3"}';
select throws_ok($$select api.create_claim_token('0f000000-0000-0000-0000-000000000701')$$,
                 'PT409', 'CARD_INACTIVE', 'customer without an active card cannot claim');
select ok(not has_function_privilege('anon', 'api.create_claim_token(uuid)', 'execute'), 'anon cannot create claims');

-- ---------------------------------------------------------------- preview (staff)
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
insert into q values ('p2', api.preview_claim((select r ->> 'qr_payload' from q where name = 't2')));
select is((select r -> 'flags' from q where name = 'p2'), '[]'::jsonb, 'fresh token previews without flags');
select is((select r #>> '{customer,phone_masked}' from q where name = 'p2'), '******0701', 'preview masks the phone');
select is((select previewed_by from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't2')),
          'e1000000-0000-0000-0000-0000000007e1'::uuid, 'preview records the executive');
select is((select status::text from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't2')),
          'open', 'preview does not consume the token');
select throws_ok($$select api.preview_claim('GR.Q.1.nope.abc')$$, 'PT400', 'INVALID_CLAIM', 'malformed claim QR rejected');
select throws_ok(format('select api.preview_claim(%L)',
                   regexp_replace((select r ->> 'qr_payload' from q where name = 't2'), '\.[^.]+$', '.' || repeat('A', 43))),
                 'PT400', 'INVALID_CLAIM', 'wrong secret rejected');
set local request.jwt.claims = '{"sub":"e2000000-0000-0000-0000-0000000007e2","role":"authenticated","session_id":"5e200000-0000-0000-0000-0000000007e2"}';
insert into q values ('p2b', api.preview_claim((select r ->> 'qr_payload' from q where name = 't2')));
select is((select r -> 'flags' from q where name = 'p2b'), '["WRONG_BUSINESS"]'::jsonb, 'other business sees WRONG_BUSINESS');
select ok(not ((select r from q where name = 'p2b') ? 'customer'), 'other business gets no customer details');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
select throws_ok(format('select api.preview_claim(%L)', (select r ->> 'qr_payload' from q where name = 't2')),
                 'PT403', 'FORBIDDEN', 'customer cannot preview');

-- ---------------------------------------------------------------- redeem (§8)
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't2'), 'key-cust-0001'),
                 'PT403', 'FORBIDDEN', 'customer cannot redeem');
set local request.jwt.claims = '{"sub":"e2000000-0000-0000-0000-0000000007e2","role":"authenticated","session_id":"5e200000-0000-0000-0000-0000000007e2"}';
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't2'), 'key-e2-00001'),
                 'PT403', 'WRONG_BUSINESS', 'executive of another business cannot redeem');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't1'), 'key-old-0001'),
                 'PT409', 'CLAIM_REVOKED', 'replaced (older) QR rejected');
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't2'), 'short'),
                 'PT400', 'VALIDATION_FAILED', 'idempotency key format enforced');
insert into q values ('r2', api.redeem_claim((select r ->> 'qr_payload' from q where name = 't2'), 'key-r2-00001', ' B-17 ', 250));
select is((select r ->> 'replayed' from q where name = 'r2'), 'false', 'first redeem succeeds');
select is((select status::text || ':' || (used_at is not null)::text from public.claim_tokens
           where id = (select (r ->> 'claim_id')::uuid from q where name = 't2')), 'used:true', 'token marked used');
select is((select bill_number || ':' || bill_amount::text || ':' || executive_id::text from public.redemptions
           where id = (select (r ->> 'redemption_id')::uuid from q where name = 'r2')),
          'B-17:250.00:e1000000-0000-0000-0000-0000000007e1', 'redemption row records bill and executive from the session');
select is((select used_count from public.offer_usage where offer_id = '0f000000-0000-0000-0000-000000000701'
           and customer_id = 'c1000000-0000-0000-0000-0000000007c1'), 1, 'per-customer usage counted');
select is((select total_redeemed from public.offers where id = '0f000000-0000-0000-0000-000000000701'), 1, 'offer total counted');
insert into q values ('r2b', api.redeem_claim((select r ->> 'qr_payload' from q where name = 't2'), 'key-r2-00001', 'other', 1));
select is((select r ->> 'replayed' from q where name = 'r2b'), 'true', 'same key replays');
select is((select r ->> 'redemption_id' from q where name = 'r2b'), (select r ->> 'redemption_id' from q where name = 'r2'),
          'replay returns the original redemption');
select is((select count(*)::int from public.redemptions where offer_id = '0f000000-0000-0000-0000-000000000701'), 1,
          'replay has no side effects');
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't2'), 'key-r2-00002'),
                 'PT409', 'ALREADY_REDEEMED', 'used QR (screenshot) rejected');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
insert into q values ('t3', api.create_claim_token('0f000000-0000-0000-0000-000000000701'));
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't3'), 'key-r2-00001'),
                 'PT409', 'IDEMPOTENCY_KEY_REUSED', 'key reused for another claim rejected');
select ok((api.preview_claim((select r ->> 'qr_payload' from q where name = 't2')) -> 'flags') ? 'USED', 'preview flags USED');
select is((select count(*)::int from audit.audit_logs where action = 'claim.redeem'
           and entity_id = (select (r ->> 'redemption_id')::uuid from q where name = 'r2')), 1, 'redeem audited once');

-- per-customer limit (o1 allows 2)
select is(api.redeem_claim((select r ->> 'qr_payload' from q where name = 't3'), 'key-t3-00001') ->> 'replayed', 'false',
          'second use within the per-customer limit');
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
select throws_ok($$select api.create_claim_token('0f000000-0000-0000-0000-000000000701')$$,
                 'PT409', 'CUSTOMER_LIMIT_REACHED', 'limit reached blocks new claims');

-- total limit is re-checked at redeem time (o3 allows 1 in total)
insert into q values ('t4', api.create_claim_token('0f000000-0000-0000-0000-000000000703'));
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000007c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000007c2"}';
insert into q values ('t5', api.create_claim_token('0f000000-0000-0000-0000-000000000703'));
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
select is(api.redeem_claim((select r ->> 'qr_payload' from q where name = 't4'), 'key-t4-00001') ->> 'replayed', 'false',
          'first customer uses the last slot');
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't5'), 'key-t5-00001'),
                 'PT409', 'OFFER_LIMIT_REACHED', 'total limit re-checked at redeem');
select is((select total_redeemed from public.offers where id = '0f000000-0000-0000-0000-000000000703'), 1, 'total never exceeds limit');

-- bill fields: minimum purchase (o2) and per-business bill number setting
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000007c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000007c2"}';
insert into q values ('t6', api.create_claim_token('0f000000-0000-0000-0000-000000000702'));
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
select is((api.preview_claim((select r ->> 'qr_payload' from q where name = 't6')) ->> 'bill_amount_required'), 'true',
          'preview says the bill amount is needed for a minimum purchase');
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't6'), 'key-t6-00001'),
                 'PT400', 'BILL_AMOUNT_REQUIRED', 'minimum purchase needs the bill amount');
select throws_ok(format('select api.redeem_claim(%L, %L, null, 499.99)', (select r ->> 'qr_payload' from q where name = 't6'), 'key-t6-00002'),
                 'PT409', 'BELOW_MIN_PURCHASE', 'bill below the minimum rejected');
insert into public.app_settings (key, scope_business_id, value, value_schema, description)
values ('redemption.bill_number_required', 'b1000000-0000-0000-0000-0000000007b1', 'true', '{}', 'test override');
select throws_ok(format('select api.redeem_claim(%L, %L, null, 600)', (select r ->> 'qr_payload' from q where name = 't6'), 'key-t6-00003'),
                 'PT400', 'BILL_NUMBER_REQUIRED', 'business override requires a bill number');
select is(api.redeem_claim((select r ->> 'qr_payload' from q where name = 't6'), 'key-t6-00004', 'INV-9', 600) ->> 'replayed', 'false',
          'redeem with bill number and enough amount');

-- expiry (o4 at b2) and the expire_claims job
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
insert into q values ('t7', api.create_claim_token('0f000000-0000-0000-0000-000000000704'));
update public.claim_tokens set expires_at = now() - interval '1 second'
where id = (select (r ->> 'claim_id')::uuid from q where name = 't7');
set local request.jwt.claims = '{"sub":"e2000000-0000-0000-0000-0000000007e2","role":"authenticated","session_id":"5e200000-0000-0000-0000-0000000007e2"}';
select ok((api.preview_claim((select r ->> 'qr_payload' from q where name = 't7')) -> 'flags') ? 'EXPIRED', 'preview flags EXPIRED');
select throws_ok(format('select api.redeem_claim(%L, %L)', (select r ->> 'qr_payload' from q where name = 't7'), 'key-t7-00001'),
                 'PT409', 'CLAIM_EXPIRED', 'expired QR rejected');
select ok(private.expire_claims() >= 1, 'expire_claims marks past-expiry tokens');
select is((select status::text from public.claim_tokens where id = (select (r ->> 'claim_id')::uuid from q where name = 't7')),
          'expired', 'expired token status');

-- card blocked after the QR was issued
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000007c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000007c2"}';
insert into q values ('t8', api.create_claim_token('0f000000-0000-0000-0000-000000000701'));
update public.cards set status = 'blocked' where id = 'cad20000-0000-0000-0000-0000000007c2';
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000007e1","role":"authenticated","session_id":"5e100000-0000-0000-0000-0000000007e1"}';
select throws_ok(format('select api.redeem_claim(%L, %L, %L)', (select r ->> 'qr_payload' from q where name = 't8'), 'key-t8-00001', 'INV-10'),
                 'PT409', 'CARD_INACTIVE', 'blocked card cannot redeem');
update public.cards set status = 'active' where id = 'cad20000-0000-0000-0000-0000000007c2';

-- purge keeps redemption history
update public.claim_tokens set used_at = now() - interval '100 days'
where id = (select (r ->> 'claim_id')::uuid from q where name = 't2');
select ok(private.purge_claim_tokens() >= 1, 'purge_claim_tokens removes old used tokens');
select ok(exists(select 1 from public.redemptions where claim_token_id = (select (r ->> 'claim_id')::uuid from q where name = 't2')),
          'redemption keeps the claim id after purge');

-- ---------------------------------------------------------------- RLS / grants / Realtime
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity and c.relname in ('claim_tokens', 'redemptions')),
          2, 'RLS on claim_tokens and redemptions');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime'
           and tablename in ('claim_tokens', 'redemptions')), 2, 'claim_tokens and redemptions in Realtime publication');
select ok(not has_function_privilege('anon', 'api.redeem_claim(text, text, text, numeric)', 'execute'), 'anon cannot redeem');
grant select on q to authenticated;
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000007c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000007c1"}';
set local role authenticated;
select throws_ok($$select secret_hash from public.claim_tokens$$, '42501', null, 'secret_hash is not readable');
select is((select count(*)::int from public.claim_tokens where customer_id <> 'c1000000-0000-0000-0000-0000000007c1'), 0,
          'customer sees only own tokens');
select is((select count(*)::int from public.redemptions), 3, 'customer sees own redemptions');
reset role;
set local request.jwt.claims = '{"sub":"e2000000-0000-0000-0000-0000000007e2","role":"authenticated","session_id":"5e200000-0000-0000-0000-0000000007e2"}';
set local role authenticated;
select is((select count(*)::int from public.redemptions), 0, 'other business sees none of b1 redemptions');
reset role;

select * from finish();
rollback;
