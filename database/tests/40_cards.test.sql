-- 40_cards: QR format, batch creation, link_card (double-link guard, M3 exit), phone-release guard.
-- Runs as postgres inside one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

-- fixtures
insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', '910000000101', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e0000000-0000-0000-0000-00000000000e', '910000000102', '{"full_name":"Exec"}',  '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000000c1', '919800000001', '{"full_name":"Cust One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000000c2', '919800000002', '{"full_name":"Cust Two"}', '{}');
insert into public.businesses (id, slug, name) values ('b1000000-0000-0000-0000-000000000001', 'cards-biz', 'Cards Biz');
select private.grant_role('a0000000-0000-0000-0000-00000000000a', 'owner', null, null);
select private.grant_role('e0000000-0000-0000-0000-00000000000e', 'executive', 'b1000000-0000-0000-0000-000000000001', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-00000000000a', null, 'Owner'),
  ('e0000000-0000-0000-0000-00000000000e', 'b1000000-0000-0000-0000-000000000001', 'Exec');
insert into auth.sessions (id, user_id) values
  ('5a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a'),
  ('5e000000-0000-0000-0000-00000000000e', 'e0000000-0000-0000-0000-00000000000e'),
  ('5c100000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-0000000000c1'),
  ('5c200000-0000-0000-0000-0000000000c2', 'c2000000-0000-0000-0000-0000000000c2');

-- structure + deny-by-default
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('cards', 'card_assignments', 'card_batches') and c.relrowsecurity),
          3, 'RLS on all card tables');
select ok(not has_table_privilege('authenticated', 'public.cards', 'insert,update,delete'), 'authenticated cannot write cards');
select ok(not has_column_privilege('authenticated', 'public.cards', 'token_hash', 'select'), 'token_hash not readable by clients');
select ok(not has_function_privilege('anon', 'api.link_card(text)', 'execute'), 'anon cannot link cards');

-- QR parsing
select throws_ok($$select private.parse_card_qr('XX.C.1.AAAAAAAAAAAAAAAAAAAAAA')$$, 'PT400', 'INVALID_QR', 'unknown prefix rejected');
select throws_ok($$select private.parse_card_qr('GR.Q.1.AAAAAAAAAAAAAAAAAAAAAA')$$, 'PT400', 'INVALID_QR', 'claim kind rejected');
select throws_ok($$select private.parse_card_qr('GR.C.2.AAAAAAAAAAAAAAAAAAAAAA')$$, 'PT400', 'INVALID_QR', 'unknown version rejected');
select throws_ok($$select private.parse_card_qr('GR.C.1.AAAA')$$, 'PT400', 'INVALID_QR', 'short token rejected');
select throws_ok($$select private.parse_card_qr('GR.C.1.AA+A')$$, 'PT400', 'INVALID_QR', 'bad charset rejected');

-- batch creation
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","session_id":"5e000000-0000-0000-0000-00000000000e"}';
select throws_ok($$select * from api.create_card_batch('x', 1)$$, 'PT403', 'FORBIDDEN', 'executive cannot create batches');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated","session_id":"5a000000-0000-0000-0000-00000000000a"}';
select throws_ok($$select * from api.create_card_batch('x', 0)$$, 'PT400', 'VALIDATION_FAILED', 'zero quantity rejected');
create temp table t_batch as select * from api.create_card_batch('Test batch', 3);
select is((select count(*)::int from t_batch), 3, 'batch returns one payload per card');
select ok((select bool_and(qr_payload ~ '^GR\.C\.1\.[A-Za-z0-9_-]{22}$' and card_number ~ '^GR-[0-9]{6}$') from t_batch),
          'payloads and card numbers use the configured format');
select is((select count(*)::int from t_batch b join public.cards c on c.card_number = b.card_number
           where c.token_hash = private.parse_card_qr(b.qr_payload) and c.status = 'unassigned'), 3,
          'only token hashes stored; payload maps to its card');
create temp table t_qr as select card_number, qr_payload, row_number() over (order by card_number) as n from t_batch;
grant select on t_qr to authenticated;

-- link_card
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-0000000000c1","role":"authenticated","session_id":"5c100000-0000-0000-0000-0000000000c1"}';
select throws_ok($$select api.link_card('GR.C.1.AAAAAAAAAAAAAAAAAAAAAA')$$, 'PT400', 'INVALID_QR', 'unknown token is INVALID_QR');
select is(api.link_card((select qr_payload from t_qr where n = 1)) ->> 'status', 'pending', 'customer links card');
select is((select membership_status from public.profiles where id = 'c1000000-0000-0000-0000-0000000000c1'),
          'pending'::public.membership_status, 'membership becomes pending');
select throws_ok($$select api.link_card((select qr_payload from t_qr where n = 2))$$, 'PT409', 'CARD_ALREADY_LINKED',
                 'second card for same customer refused');
select ok(not private.phone_release_allowed('c1000000-0000-0000-0000-0000000000c1'), 'phone release blocked while card is pending');
set local role authenticated;
select is((select count(*)::int from public.cards), 1, 'customer sees only own card');
reset role;

set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000000c2","role":"authenticated","session_id":"5c200000-0000-0000-0000-0000000000c2"}';
select throws_ok($$select api.link_card((select qr_payload from t_qr where n = 1))$$, 'PT409', 'CARD_NOT_AVAILABLE',
                 'card linked by someone else is not available');

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","session_id":"5e000000-0000-0000-0000-00000000000e"}';
select throws_ok($$select api.link_card((select qr_payload from t_qr where n = 3))$$, 'PT403', 'FORBIDDEN', 'staff cannot link a card');

set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-0000000000c2","role":"authenticated","session_id":"dead0000-0000-0000-0000-000000000000"}';
select throws_ok($$select api.link_card((select qr_payload from t_qr where n = 3))$$, 'PT403', 'FORBIDDEN', 'revoked session cannot link');

select is((select count(*)::int from audit.audit_logs where action = 'card.linked'), 1, 'link audited');

select * from finish();
rollback;
