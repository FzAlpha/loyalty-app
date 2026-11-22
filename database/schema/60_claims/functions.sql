-- 60_claims functions: claim QR format (§6.2), create / preview (§6), token lock for redeem (§8), jobs (§9).

-- ---------------------------------------------------------------- QR payloads
create or replace function private.claim_qr_payload(p_claim_id uuid, p_secret bytea)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws('.',
    private.get_setting('qr.prefix') #>> '{}',
    private.get_setting('qr.kind.claim') #>> '{}',
    private.get_setting('qr.version.claim') #>> '{}',
    p_claim_id::text,
    private.base64url_encode(p_secret));
$$;

-- Accepts any prefix in qr.accepted_prefixes and dispatches on version (only 1 exists).
-- Returns the claim id and sha256(secret). Malformed payloads raise INVALID_CLAIM.
create or replace function private.parse_claim_qr(p_payload text, out claim_id uuid, out secret_hash bytea)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_payload, ''), '.');
  v_secret bytea;
begin
  if cardinality(v_parts) <> 5
     or not (private.get_setting('qr.accepted_prefixes') ? v_parts[1])
     or v_parts[2] <> private.get_setting('qr.kind.claim') #>> '{}'
     or v_parts[5] !~ '^[A-Za-z0-9_-]+$' then
    perform private.raise_error('INVALID_CLAIM');
  end if;
  if v_parts[3] = '1' then
    begin
      claim_id := v_parts[4]::uuid;
      v_secret := private.base64url_decode(v_parts[5]);
    exception when others then
      perform private.raise_error('INVALID_CLAIM');
    end;
    if octet_length(v_secret) < 32 then
      perform private.raise_error('INVALID_CLAIM');
    end if;
  else
    perform private.raise_error('INVALID_CLAIM');
  end if;
  secret_hash := sha256(v_secret);
end;
$$;

-- ---------------------------------------------------------------- create (customer)
-- Eligibility engine -> revoke the previous open token -> 32-byte secret -> store sha256 ->
-- return the QR payload once.
create or replace function api.create_claim_token(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_e record;
  v_biz uuid;
  v_card uuid;
  v_secret bytea := extensions.gen_random_bytes(32);
  v_id uuid;
  v_expires timestamptz;
begin
  if not private.session_is_live() then
    perform private.raise_error('FORBIDDEN', 'claim.create');
  end if;
  perform private.consume_rate_limit('claim_create', v_uid::text);

  select * into v_e from private.evaluate_offer(v_uid, p_offer_id, now());
  if not v_e.eligible then
    perform private.raise_error(v_e.reason_code);
  end if;
  select b.business_id into v_biz from private.offer_brief(p_offer_id) b;
  v_card := private.customer_active_card_id(v_uid);
  v_expires := now() + make_interval(secs => (private.get_setting('claims.ttl_seconds', v_biz))::integer);

  update public.claim_tokens set status = 'revoked'
  where customer_id = v_uid and offer_id = p_offer_id and status = 'open';

  insert into public.claim_tokens (customer_id, card_id, offer_id, business_id, secret_hash, expires_at)
  values (v_uid, v_card, p_offer_id, v_biz, sha256(v_secret), v_expires)
  returning id into v_id;

  perform audit.write('claim.created', 'claim_token', v_id, null,
    jsonb_build_object('offer_id', p_offer_id, 'card_id', v_card, 'expires_at', v_expires), v_biz);
  return jsonb_build_object('claim_id', v_id, 'qr_payload', private.claim_qr_payload(v_id, v_secret),
                            'expires_at', v_expires);
end;
$$;

-- ---------------------------------------------------------------- preview (staff)
-- Safe preview with flags; never consumes the token. Callers without claim.preview at the token's
-- business get only the WRONG_BUSINESS flag, no customer or offer details.
create or replace function api.preview_claim(p_qr_payload text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_q record;
  v_t public.claim_tokens;
  v_o record;
  v_e record;
  v_flags text[] := '{}';
begin
  if not (private.session_is_live() and private.can_any('claim.preview')) then
    perform private.raise_error('FORBIDDEN', 'claim.preview');
  end if;
  select * into v_q from private.parse_claim_qr(p_qr_payload);
  select * into v_t from public.claim_tokens where id = v_q.claim_id;
  if not found or v_t.secret_hash <> v_q.secret_hash then
    perform private.raise_error('INVALID_CLAIM');
  end if;
  if not private.can('claim.preview', v_t.business_id) then
    return jsonb_build_object('claim_id', v_t.id, 'flags', jsonb_build_array('WRONG_BUSINESS'));
  end if;

  if v_t.status = 'used' then v_flags := v_flags || 'USED'::text; end if;
  if v_t.status = 'revoked' then v_flags := v_flags || 'REVOKED'::text; end if;
  if v_t.status = 'expired' or (v_t.status = 'open' and v_t.expires_at <= now()) then
    v_flags := v_flags || 'EXPIRED'::text;
  end if;
  select * into v_e from private.evaluate_offer(v_t.customer_id, v_t.offer_id, now());
  if not v_e.eligible or private.customer_active_card_id(v_t.customer_id) is distinct from v_t.card_id then
    v_flags := v_flags || 'NOT_ELIGIBLE'::text;
  end if;
  select * into v_o from private.offer_brief(v_t.offer_id);

  update public.claim_tokens set previewed_by = v_uid, previewed_at = now() where id = v_t.id;

  return jsonb_build_object(
    'claim_id', v_t.id, 'status', v_t.status, 'expires_at', v_t.expires_at,
    'flags', to_jsonb(v_flags),
    'reason_code', case when v_e.eligible then null else v_e.reason_code end,
    'offer', jsonb_build_object('offer_id', v_t.offer_id, 'title', v_o.title,
               'min_purchase_amount', v_o.min_purchase_amount, 'max_discount_amount', v_o.max_discount_amount),
    'customer', private.customer_masked(v_t.customer_id),
    'business_id', v_t.business_id,
    'bill_number_required', (private.get_setting('redemption.bill_number_required', v_t.business_id))::boolean,
    'bill_amount_required', (private.get_setting('redemption.bill_amount_required', v_t.business_id))::boolean
        or v_o.min_purchase_amount is not null);
end;
$$;

-- ---------------------------------------------------------------- used by 70_redemptions (§8 steps 2–5)
-- Locks the token row (lock order: token -> offer -> usage) and checks the secret. Returns a 'used'
-- token so the caller can replay an idempotent redemption; raises for revoked or expired tokens.
-- The secret is 32 random bytes and only digests are compared, so comparison timing reveals
-- nothing useful about the secret.
create or replace function private.lock_claim_for_redeem(p_claim_id uuid, p_secret_hash bytea)
returns public.claim_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.claim_tokens;
begin
  select * into v_t from public.claim_tokens where id = p_claim_id for update;
  if not found or v_t.secret_hash <> p_secret_hash then
    perform private.raise_error('INVALID_CLAIM');
  end if;
  if v_t.status = 'revoked' then
    perform private.raise_error('CLAIM_REVOKED');
  end if;
  -- An error rolls the transaction back, so an open-but-past-expiry token stays 'open' here;
  -- the expire_claims job marks it expired.
  if v_t.status = 'expired' or (v_t.status = 'open' and v_t.expires_at <= now()) then
    perform private.raise_error('CLAIM_EXPIRED');
  end if;
  return v_t;
end;
$$;

create or replace function private.mark_claim_used(p_claim_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.claim_tokens set status = 'used', used_at = now() where id = p_claim_id and status = 'open';
$$;

-- ---------------------------------------------------------------- jobs (§9; run by 99_jobs)
create or replace function private.expire_claims()
returns integer
language sql
security definer
set search_path = ''
as $$
  with x as (update public.claim_tokens set status = 'expired'
             where status = 'open' and expires_at <= now() returning 1)
  select count(*)::integer from x;
$$;

-- Deletes used/expired/revoked tokens older than retention.claim_tokens_days (counted from use or
-- expiry). redemptions.claim_token_id keeps the id (no foreign key), so history is unaffected.
create or replace function private.purge_claim_tokens()
returns integer
language sql
security definer
set search_path = ''
as $$
  with x as (delete from public.claim_tokens
             where status <> 'open'
               and coalesce(used_at, expires_at)
                   < now() - make_interval(days => (private.get_setting('retention.claim_tokens_days'))::integer)
             returning 1)
  select count(*)::integer from x;
$$;

-- Account deletion (90_accounts): an anonymised customer can no longer redeem anything.
create or replace function private.revoke_customer_claims(p_customer_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  with x as (update public.claim_tokens set status = 'revoked'
             where customer_id = p_customer_id and status = 'open' returning 1)
  select count(*)::integer from x;
$$;
