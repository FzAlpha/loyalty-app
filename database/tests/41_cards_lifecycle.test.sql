-- 40_cards block + reissue (M9). Reissued card goes to pending unless approval is switched off
-- and the customer has a passed identity check.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000004aa', '910000000401', '{"full_name":"Owner"}', '{"account_type":"staff"}'),
  ('e1000000-0000-0000-0000-0000000004e1', '910000000402', '{"full_name":"Exec"}', '{"account_type":"staff"}'),
  ('c1000000-0000-0000-0000-0000000004c1', '919800000401', '{"full_name":"Cust One"}', '{}'),
  ('c2000000-0000-0000-0000-0000000004c2', '919800000402', '{"full_name":"Cust Two"}', '{}');
insert into public.businesses (id, slug, name, timezone) values
  ('b1000000-0000-0000-0000-0000000004b1', 'cards-life-1', 'Cards Life 1', 'UTC');
select private.grant_role('a0000000-0000-0000-0000-0000000004aa', 'owner', null, null);
select private.grant_role('e1000000-0000-0000-0000-0000000004e1', 'executive', 'b1000000-0000-0000-0000-0000000004b1', null);
insert into public.staff (user_id, business_id, display_name) values
  ('a0000000-0000-0000-0000-0000000004aa', null, 'Owner'),
  ('e1000000-0000-0000-0000-0000000004e1', 'b1000000-0000-0000-0000-0000000004b1', 'Exec');
update public.profiles set membership_status = 'active'
where id in ('c1000000-0000-0000-0000-0000000004c1', 'c2000000-0000-0000-0000-0000000004c2');
insert into public.card_batches (id, label, quantity, created_by) values
  ('ba000000-0000-0000-0000-0000000004ba', 'lifecycle test', 4, 'a0000000-0000-0000-0000-0000000004aa');
-- k1 c1 active, k2 + k3 unassigned (known tokens), k4 c2 active.
insert into public.cards (id, batch_id, card_number, token_hash, status, current_customer_id) values
  ('cad10000-0000-0000-0000-0000000004c1', 'ba000000-0000-0000-0000-0000000004ba', 'T-LIFE-1', '\x0401', 'active', 'c1000000-0000-0000-0000-0000000004c1'),
  ('cad20000-0000-0000-0000-0000000004c2', 'ba000000-0000-0000-0000-0000000004ba', 'T-LIFE-2',
     private.card_token_hash('\x04020000000000000000000000000002'::bytea), 'unassigned', null),
  ('cad30000-0000-0000-0000-0000000004c3', 'ba000000-0000-0000-0000-0000000004ba', 'T-LIFE-3',
     private.card_token_hash('\x04030000000000000000000000000003'::bytea), 'unassigned', null),
  ('cad40000-0000-0000-0000-0000000004c4', 'ba000000-0000-0000-0000-0000000004ba', 'T-LIFE-4', '\x0404', 'active', 'c2000000-0000-0000-0000-0000000004c2');
create temp table q (name text primary key, r jsonb);
insert into q values
  ('qr2', to_jsonb(private.card_qr_payload('\x04020000000000000000000000000002'::bytea))),
  ('qr3', to_jsonb(private.card_qr_payload('\x04030000000000000000000000000003'::bytea)));

select ok(not has_function_privilege('anon', 'api.block_card(uuid,uuid,text)', 'execute'), 'anon cannot block cards');

-- ---------------------------------------------------------------- block
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-0000000004e1","role":"authenticated"}';
select throws_ok($$select api.block_card('cad10000-0000-0000-0000-0000000004c1', 'b1000000-0000-0000-0000-0000000004b1', 'lost')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot block (no card.block)');
select throws_ok($$select api.reissue_card('cad10000-0000-0000-0000-0000000004c1', 'x', 'b1000000-0000-0000-0000-0000000004b1', 'lost')$$,
                 'PT403', 'FORBIDDEN', 'executive cannot reissue (no card.reissue)');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000004aa","role":"authenticated"}';
select throws_ok($$select api.block_card('cad10000-0000-0000-0000-0000000004c1', 'b1000000-0000-0000-0000-0000000004b1', '  ')$$,
                 'PT400', 'VALIDATION_FAILED', 'reason required');
insert into q values ('b', api.block_card('cad10000-0000-0000-0000-0000000004c1', 'b1000000-0000-0000-0000-0000000004b1', 'lost'));
select is((select r ->> 'status' from q where name = 'b'), 'blocked', 'owner blocks a card');
select ok((select status = 'blocked' and current_customer_id = 'c1000000-0000-0000-0000-0000000004c1' and blocked_reason = 'lost'
           from public.cards where id = 'cad10000-0000-0000-0000-0000000004c1'), 'blocked card keeps its customer');
select is((select membership_status::text from public.profiles where id = 'c1000000-0000-0000-0000-0000000004c1'), 'blocked',
          'membership blocked');
select throws_ok($$select api.block_card('cad10000-0000-0000-0000-0000000004c1', 'b1000000-0000-0000-0000-0000000004b1', 'again')$$,
                 'PT409', 'CARD_NOT_BLOCKABLE', 'cannot block twice');
select ok(exists (select 1 from audit.audit_logs where action = 'card.blocked' and entity_id = 'cad10000-0000-0000-0000-0000000004c1'),
          'block is audited');

-- ---------------------------------------------------------------- reissue (approval required, the default)
select throws_ok($$select api.reissue_card('cad10000-0000-0000-0000-0000000004c1', 'GR.C.1.bad', 'b1000000-0000-0000-0000-0000000004b1', 'lost')$$,
                 'PT400', 'INVALID_QR', 'bad QR for the new card');
insert into q values ('r', api.reissue_card('cad10000-0000-0000-0000-0000000004c1', (select r #>> '{}' from q where name = 'qr2'),
                                            'b1000000-0000-0000-0000-0000000004b1', 'lost'));
select is((select r ->> 'status' from q where name = 'r'), 'pending', 'reissued card is pending');
select ok((select status = 'blocked' and current_customer_id is null from public.cards where id = 'cad10000-0000-0000-0000-0000000004c1'),
          'old card blocked and unlinked');
select ok((select status = 'pending' and current_customer_id = 'c1000000-0000-0000-0000-0000000004c1'
           from public.cards where id = 'cad20000-0000-0000-0000-0000000004c2'), 'new card pending for the customer');
select is((select count(*)::int from public.card_assignments where card_id = 'cad20000-0000-0000-0000-0000000004c2' and status = 'pending'),
          1, 'pending assignment for in-store approval');
select is((select membership_status::text from public.profiles where id = 'c1000000-0000-0000-0000-0000000004c1'), 'pending',
          'membership pending');
select throws_ok(format($$select api.reissue_card('cad10000-0000-0000-0000-0000000004c1', %L, 'b1000000-0000-0000-0000-0000000004b1', 'again')$$,
                        (select r #>> '{}' from q where name = 'qr3')),
                 'PT409', 'CARD_NOT_REISSUABLE', 'an unlinked card cannot be reissued');
select throws_ok(format($$select api.reissue_card('cad40000-0000-0000-0000-0000000004c4', %L, 'b1000000-0000-0000-0000-0000000004b1', 'swap')$$,
                        (select r #>> '{}' from q where name = 'qr2')),
                 'PT409', 'CARD_NOT_AVAILABLE', 'new card must be unassigned');

-- ---------------------------------------------------------------- reissue without approval
update public.app_settings set value = 'false' where key = 'cards.reissue_requires_approval' and scope_business_id is null;
insert into public.identity_checks (customer_id, executive_id, business_id, evidence, result) values
  ('c2000000-0000-0000-0000-0000000004c2', 'e1000000-0000-0000-0000-0000000004e1', 'b1000000-0000-0000-0000-0000000004b1',
   '{registration_details}', 'passed');
insert into q values ('r2', api.reissue_card('cad40000-0000-0000-0000-0000000004c4', (select r #>> '{}' from q where name = 'qr3'),
                                             'b1000000-0000-0000-0000-0000000004b1', 'damaged'));
select is((select r ->> 'status' from q where name = 'r2'), 'active', 'approval off + passed check: new card active');
select is((select status::text from public.card_assignments where card_id = 'cad30000-0000-0000-0000-0000000004c3'), 'approved',
          'assignment approved by the caller');

select * from finish();
rollback;
