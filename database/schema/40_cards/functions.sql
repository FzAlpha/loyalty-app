-- 40_cards functions: QR format (§6.2), batch creation (§6 card-batches), link_card (§6).

-- ---------------------------------------------------------------- QR payloads
create or replace function private.base64url_encode(p bytea)
returns text
language sql
immutable
set search_path = ''
as $$ select rtrim(translate(replace(encode(p, 'base64'), E'\n', ''), '+/', '-_'), '='); $$;

create or replace function private.base64url_decode(p text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select decode(translate(p, '-_', '+/') || repeat('=', (4 - char_length(p) % 4) % 4), 'base64');
$$;

create or replace function private.card_token_hash(p_token bytea)
returns bytea
language sql
immutable
set search_path = ''
as $$ select sha256(p_token); $$;

-- New payloads use the current prefix/kind/version settings.
create or replace function private.card_qr_payload(p_token bytea)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws('.',
    private.get_setting('qr.prefix') #>> '{}',
    private.get_setting('qr.kind.card') #>> '{}',
    private.get_setting('qr.version.card') #>> '{}',
    private.base64url_encode(p_token));
$$;

-- Accepts any prefix in qr.accepted_prefixes and dispatches on version (only 1 exists). Returns the
-- token hash. A malformed payload raises INVALID_QR without saying which part was wrong.
create or replace function private.parse_card_qr(p_payload text)
returns bytea
language plpgsql
stable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_payload, ''), '.');
  v_token bytea;
begin
  if cardinality(v_parts) <> 4
     or not (private.get_setting('qr.accepted_prefixes') ? v_parts[1])
     or v_parts[2] <> private.get_setting('qr.kind.card') #>> '{}'
     or v_parts[4] !~ '^[A-Za-z0-9_-]+$' then
    perform private.raise_error('INVALID_QR');
  end if;
  if v_parts[3] = '1' then
    begin
      v_token := private.base64url_decode(v_parts[4]);
    exception when others then
      perform private.raise_error('INVALID_QR');
    end;
    if octet_length(v_token) < 16 then
      perform private.raise_error('INVALID_QR');
    end if;
  else
    perform private.raise_error('INVALID_QR');
  end if;
  return private.card_token_hash(v_token);
end;
$$;

-- ---------------------------------------------------------------- used by other modules
-- Phone release (10_identity) must not free a phone whose holder has a pending or active card.
create or replace function private.customer_has_live_card(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cards
                 where current_customer_id = p_customer_id and status in ('pending', 'active'));
$$;

-- ---------------------------------------------------------------- batches
-- Owner (card.batch.create). Generates tokens in the database and returns card_number + qr_payload
-- for each card exactly once; only token hashes are kept, so a batch cannot be exported again.
create or replace function api.create_card_batch(p_label text, p_quantity integer)
returns table (card_number text, qr_payload text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('card.batch.create', null);
  v_batch uuid;
  v_bytes integer := (private.get_setting('cards.token_bytes'))::integer;
  v_prefix text := private.get_setting('cards.number_prefix') #>> '{}';
  v_digits integer := (private.get_setting('cards.number_digits'))::integer;
  v_max integer := (private.get_setting('cards.batch_max_quantity'))::integer;
begin
  if p_label is null or char_length(trim(p_label)) not between 1 and 200 then
    perform private.raise_error('VALIDATION_FAILED', 'label');
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_max then
    perform private.raise_error('VALIDATION_FAILED', 'quantity');
  end if;

  insert into public.card_batches (label, quantity, created_by, exported_at, export_count)
  values (trim(p_label), p_quantity, v_uid, now(), 1)
  returning id into v_batch;

  create temp table if not exists new_cards (n bigint, token bytea) on commit drop;
  truncate pg_temp.new_cards;
  insert into pg_temp.new_cards
  select nextval('public.card_number_seq'), extensions.gen_random_bytes(v_bytes)
  from generate_series(1, p_quantity);

  if (select max(n) from pg_temp.new_cards) >= power(10::numeric, v_digits) then
    perform private.raise_error('CARD_NUMBERS_EXHAUSTED');
  end if;

  insert into public.cards (batch_id, card_number, token_hash)
  select v_batch, v_prefix || '-' || lpad(t.n::text, v_digits, '0'), private.card_token_hash(t.token)
  from pg_temp.new_cards t;

  perform audit.write('card_batch.created', 'card_batch', v_batch, null,
    jsonb_build_object('label', trim(p_label), 'quantity', p_quantity, 'export_count', 1), null);

  return query
    select v_prefix || '-' || lpad(t.n::text, v_digits, '0'), private.card_qr_payload(t.token)
    from pg_temp.new_cards t order by t.n;
end;
$$;

-- ---------------------------------------------------------------- link_card (customer)
-- Card must be unassigned; the caller must be a customer (10_identity) with no pending/active card.
-- The card row is locked, and the partial unique indexes also stop concurrent double links.
create or replace function api.link_card(p_qr_payload text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_hash bytea;
  v_card public.cards;
  v_assignment uuid;
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'card.link');
  end if;
  if exists (select 1 from public.cards where current_customer_id = v_uid) then
    perform private.raise_error('CARD_ALREADY_LINKED');
  end if;
  if not private.customer_can_link(v_uid) then
    perform private.raise_error('FORBIDDEN', 'card.link');
  end if;
  v_hash := private.parse_card_qr(p_qr_payload);
  perform private.consume_rate_limit('card_link', v_uid::text);

  select * into v_card from public.cards where token_hash = v_hash for update;
  if not found then
    perform private.raise_error('INVALID_QR');
  end if;
  if v_card.status <> 'unassigned' then
    perform private.raise_error('CARD_NOT_AVAILABLE');
  end if;

  begin
    update public.cards set status = 'pending', current_customer_id = v_uid where id = v_card.id;
    insert into public.card_assignments (card_id, customer_id) values (v_card.id, v_uid)
    returning id into v_assignment;
  exception when unique_violation then
    perform private.raise_error('CARD_ALREADY_LINKED');
  end;
  perform private.set_membership_status(v_uid, 'pending');

  perform audit.write('card.linked', 'card', v_card.id, null,
    jsonb_build_object('assignment_id', v_assignment, 'customer_id', v_uid), null);
  return jsonb_build_object('card_id', v_card.id, 'card_number', v_card.card_number,
                            'assignment_id', v_assignment, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------- approval (M4, §6)
-- Staff scan at the acting business (card.view). Customer details are masked.
create or replace function api.scan_card(p_qr_payload text, p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_card public.cards;
  v_customer jsonb;
  v_pending jsonb;
begin
  perform private.require_permission('card.view', p_business_id);
  v_hash := private.parse_card_qr(p_qr_payload);
  select * into v_card from public.cards where token_hash = v_hash;
  if not found then
    perform private.raise_error('INVALID_QR');
  end if;
  if v_card.current_customer_id is not null then
    v_customer := private.customer_masked(v_card.current_customer_id);
  end if;
  select jsonb_build_object('assignment_id', a.id, 'requested_at', a.requested_at) into v_pending
  from public.card_assignments a where a.card_id = v_card.id and a.status = 'pending';
  return jsonb_build_object('card_id', v_card.id, 'card_number', v_card.card_number, 'status', v_card.status,
                            'customer', v_customer, 'pending_request', v_pending);
end;
$$;

-- Locks the card and its pending assignment; returns the assignment id or raises CARD_NOT_PENDING.
create or replace function private.lock_pending_card(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.card_status;
  v_assignment uuid;
begin
  select status into v_status from public.cards where id = p_card_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'card');
  end if;
  select id into v_assignment from public.card_assignments
  where card_id = p_card_id and status = 'pending' for update;
  if v_status <> 'pending' or v_assignment is null then
    perform private.raise_error('CARD_NOT_PENDING');
  end if;
  return v_assignment;
end;
$$;

-- Approve = record a passed in-store identity check (§7.4) and activate card + membership, atomically.
create or replace function api.approve_card(
  p_card_id uuid,
  p_business_id uuid,
  p_evidence public.identity_evidence[],
  p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('card.approve', p_business_id);
  v_card public.cards;
  v_a public.card_assignments;
  v_check uuid;
begin
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if p_evidence is null or cardinality(p_evidence) = 0 then
    perform private.raise_error('VALIDATION_FAILED', 'evidence required');
  end if;
  select * into v_a from public.card_assignments where id = private.lock_pending_card(p_card_id);
  select * into v_card from public.cards where id = p_card_id;
  v_check := private.record_identity_check(v_a.customer_id, p_business_id, p_evidence, 'passed', p_note);

  update public.card_assignments
  set status = 'approved', decided_by = v_uid, decided_at = now(), decision_business_id = p_business_id
  where id = v_a.id;
  update public.cards set status = 'active' where id = v_card.id;
  perform private.set_membership_status(v_a.customer_id, 'active');

  perform audit.write('card.approved', 'card', v_card.id, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'active', 'assignment_id', v_a.id, 'identity_check_id', v_check), p_business_id);
  return jsonb_build_object('card_id', v_card.id, 'assignment_id', v_a.id, 'status', 'active',
                            'identity_check_id', v_check);
end;
$$;

-- Reject: card goes back to unassigned (can be linked again), membership becomes rejected.
create or replace function api.reject_card(p_card_id uuid, p_business_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('card.approve', p_business_id);
  v_card public.cards;
  v_a public.card_assignments;
begin
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    perform private.raise_error('VALIDATION_FAILED', 'reason');
  end if;
  select * into v_a from public.card_assignments where id = private.lock_pending_card(p_card_id);
  select * into v_card from public.cards where id = p_card_id;

  update public.card_assignments
  set status = 'rejected', decided_by = v_uid, decided_at = now(), decision_business_id = p_business_id,
      reason = btrim(p_reason)
  where id = v_a.id;
  update public.cards set status = 'unassigned', current_customer_id = null where id = v_card.id;
  perform private.set_membership_status(v_a.customer_id, 'rejected');

  perform audit.write('card.rejected', 'card', v_card.id, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'unassigned', 'assignment_id', v_a.id, 'reason', btrim(p_reason)), p_business_id);
  return jsonb_build_object('card_id', v_card.id, 'assignment_id', v_a.id, 'status', 'rejected');
end;
$$;

-- Eligibility engine (50_offers): customer holds an active card.
create or replace function private.customer_has_active_card(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cards where current_customer_id = p_customer_id and status = 'active');
$$;

-- Claims (60_claims): the customer's active card id, or null.
create or replace function private.customer_active_card_id(p_customer_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.cards where current_customer_id = p_customer_id and status = 'active' limit 1;
$$;

-- ---------------------------------------------------------------- block / reissue (M9, plan §5)
-- Internal: blocks a card row and revokes its live assignment. Caller has locked the card.
create or replace function private.block_card_row(p_card_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.card_assignments set status = 'revoked', reason = p_reason, decided_at = now()
  where card_id = p_card_id and status in ('pending', 'approved');
  update public.cards set status = 'blocked', blocked_reason = p_reason where id = p_card_id;
$$;

-- Block (lost/stolen/abuse). The card keeps current_customer_id, so the customer cannot self-link
-- another card; staff move them to a new card with api.reissue_card.
create or replace function api.block_card(p_card_id uuid, p_business_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('card.block', p_business_id);
  v_card public.cards;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    perform private.raise_error('VALIDATION_FAILED', 'reason');
  end if;
  select * into v_card from public.cards where id = p_card_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'card');
  end if;
  if v_card.status not in ('unassigned', 'pending', 'active') then
    perform private.raise_error('CARD_NOT_BLOCKABLE');
  end if;
  perform private.block_card_row(v_card.id, btrim(p_reason));
  if v_card.current_customer_id is not null then
    perform private.set_membership_status(v_card.current_customer_id, 'blocked');
  end if;
  perform audit.write('card.blocked', 'card', v_card.id, jsonb_build_object('status', v_card.status),
    jsonb_build_object('status', 'blocked', 'reason', btrim(p_reason), 'customer_id', v_card.current_customer_id),
    p_business_id);
  return jsonb_build_object('card_id', v_card.id, 'status', 'blocked', 'customer_id', v_card.current_customer_id);
end;
$$;

-- Account deletion (90_accounts): block the customer's card, never reuse it. Returns the card id.
create or replace function private.block_customer_card(p_customer_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.cards;
begin
  select * into v_card from public.cards where current_customer_id = p_customer_id for update;
  if not found then
    return null;
  end if;
  if v_card.status in ('unassigned', 'pending', 'active') then
    perform private.block_card_row(v_card.id, p_reason);
  end if;
  return v_card.id;
end;
$$;

-- Reissue: move the customer from their current card to a new unassigned card (scanned QR).
-- Old card -> blocked, unlinked, never reused. New card -> pending (in-store approval, M4 flow)
-- when cards.reissue_requires_approval is true or the customer has no passed identity check;
-- otherwise straight to active.
create or replace function api.reissue_card(
  p_old_card_id uuid,
  p_new_qr_payload text,
  p_business_id uuid,
  p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permission('card.reissue', p_business_id);
  v_old public.cards;
  v_new public.cards;
  v_hash bytea;
  v_customer uuid;
  v_pending boolean;
  v_assignment uuid;
  v_reason text := btrim(p_reason);
begin
  if p_business_id is null then
    perform private.raise_error('VALIDATION_FAILED', 'business_id required');
  end if;
  if v_reason is null or char_length(v_reason) not between 1 and 500 then
    perform private.raise_error('VALIDATION_FAILED', 'reason');
  end if;
  v_hash := private.parse_card_qr(p_new_qr_payload);

  select * into v_old from public.cards where id = p_old_card_id for update;
  if not found then
    perform private.raise_error('NOT_FOUND', 'card');
  end if;
  v_customer := v_old.current_customer_id;
  if v_customer is null or v_old.status not in ('pending', 'active', 'blocked') then
    perform private.raise_error('CARD_NOT_REISSUABLE');
  end if;
  if not exists (select 1 from public.profiles where id = v_customer and account_status = 'active') then
    perform private.raise_error('ACCOUNT_INACTIVE');
  end if;

  select * into v_new from public.cards where token_hash = v_hash for update;
  if not found then
    perform private.raise_error('INVALID_QR');
  end if;
  if v_new.id = v_old.id or v_new.status <> 'unassigned' then
    perform private.raise_error('CARD_NOT_AVAILABLE');
  end if;

  update public.card_assignments set status = 'revoked', reason = 'reissued: ' || v_reason, decided_at = now()
  where card_id = v_old.id and status in ('pending', 'approved');
  update public.cards
  set status = 'blocked', blocked_reason = coalesce(blocked_reason, 'reissued: ' || v_reason),
      current_customer_id = null
  where id = v_old.id;

  v_pending := (private.get_setting('cards.reissue_requires_approval'))::boolean
               or not private.has_passed_identity_check(v_customer);
  if v_pending then
    update public.cards set status = 'pending', current_customer_id = v_customer where id = v_new.id;
    insert into public.card_assignments (card_id, customer_id, reason)
    values (v_new.id, v_customer, 'reissue of ' || v_old.card_number)
    returning id into v_assignment;
    perform private.set_membership_status(v_customer, 'pending');
  else
    update public.cards set status = 'active', current_customer_id = v_customer where id = v_new.id;
    insert into public.card_assignments (card_id, customer_id, status, decided_by, decided_at,
                                         decision_business_id, reason)
    values (v_new.id, v_customer, 'approved', v_uid, now(), p_business_id, 'reissue of ' || v_old.card_number)
    returning id into v_assignment;
    perform private.set_membership_status(v_customer, 'active');
  end if;

  perform audit.write('card.reissued', 'card', v_new.id,
    jsonb_build_object('old_card_id', v_old.id, 'old_status', v_old.status),
    jsonb_build_object('new_card_id', v_new.id, 'status', case when v_pending then 'pending' else 'active' end,
                       'customer_id', v_customer, 'assignment_id', v_assignment, 'reason', v_reason),
    p_business_id);
  return jsonb_build_object('old_card_id', v_old.id, 'card_id', v_new.id, 'card_number', v_new.card_number,
                            'assignment_id', v_assignment,
                            'status', case when v_pending then 'pending' else 'active' end);
end;
$$;
