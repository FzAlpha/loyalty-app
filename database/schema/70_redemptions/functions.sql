-- 70_redemptions functions: api.redeem_claim, the critical transaction (BACKEND_PLAN.md §8).

create or replace function private.redemption_result(p_r public.redemptions, p_replayed boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('redemption_id', p_r.id, 'claim_id', p_r.claim_token_id, 'offer_id', p_r.offer_id,
           'customer_id', p_r.customer_id, 'card_id', p_r.card_id, 'business_id', p_r.business_id,
           'executive_id', p_r.executive_id, 'bill_number', p_r.bill_number, 'bill_amount', p_r.bill_amount,
           'redeemed_at', p_r.redeemed_at, 'replayed', p_replayed);
$$;

-- Atomic, locked and idempotent. Same key + same claim + same executive returns the first result
-- with no side effects; a key reused for anything else is IDEMPOTENCY_KEY_REUSED.
create or replace function api.redeem_claim(
  p_qr_payload text,
  p_idempotency_key text,
  p_bill_number text default null,
  p_bill_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_q record;
  v_r public.redemptions;
  v_t public.claim_tokens;
  v_o record;
  v_bill_number text := nullif(trim(p_bill_number), '');
begin
  if not (private.session_is_live() and private.can_any('claim.redeem')) then
    perform private.raise_error('FORBIDDEN', 'claim.redeem');
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,200}$' then
    perform private.raise_error('VALIDATION_FAILED', 'idempotency_key');
  end if;
  if v_bill_number is not null and char_length(v_bill_number) > 100 then
    perform private.raise_error('VALIDATION_FAILED', 'bill_number');
  end if;
  if p_bill_amount is not null and (p_bill_amount < 0 or p_bill_amount >= 10000000000) then
    perform private.raise_error('VALIDATION_FAILED', 'bill_amount');
  end if;

  -- 1. parse
  select * into v_q from private.parse_claim_qr(p_qr_payload);

  -- 0. idempotent replay
  select * into v_r from public.redemptions where idempotency_key = p_idempotency_key;
  if found then
    if v_r.claim_token_id = v_q.claim_id and v_r.executive_id = v_uid then
      return private.redemption_result(v_r, true);
    end if;
    perform private.raise_error('IDEMPOTENCY_KEY_REUSED');
  end if;

  -- 2–5. lock token, check secret, status and expiry
  v_t := private.lock_claim_for_redeem(v_q.claim_id, v_q.secret_hash);

  -- 6. permission at the token's business
  if not private.can('claim.redeem', v_t.business_id) then
    perform private.raise_error('WRONG_BUSINESS');
  end if;

  if v_t.status = 'used' then
    -- A concurrent request with the same key may have committed while we waited on the lock.
    select * into v_r from public.redemptions where idempotency_key = p_idempotency_key;
    if found and v_r.claim_token_id = v_t.id and v_r.executive_id = v_uid then
      return private.redemption_result(v_r, true);
    end if;
    perform private.raise_error('ALREADY_REDEEMED');
  end if;

  -- 7. bill fields (per-business settings; a minimum purchase needs the amount)
  select * into v_o from private.offer_brief(v_t.offer_id);
  if (private.get_setting('redemption.bill_number_required', v_t.business_id))::boolean
     and v_bill_number is null then
    perform private.raise_error('BILL_NUMBER_REQUIRED');
  end if;
  if ((private.get_setting('redemption.bill_amount_required', v_t.business_id))::boolean
      or v_o.min_purchase_amount is not null) and p_bill_amount is null then
    perform private.raise_error('BILL_AMOUNT_REQUIRED');
  end if;
  if v_o.min_purchase_amount is not null and p_bill_amount < v_o.min_purchase_amount then
    perform private.raise_error('BELOW_MIN_PURCHASE');
  end if;

  -- The token is bound to the card that was active when it was issued.
  if private.customer_active_card_id(v_t.customer_id) is distinct from v_t.card_id then
    perform private.raise_error('CARD_INACTIVE');
  end if;

  -- 8–11. offer lock, eligibility re-check, per-customer and total limits (50_offers)
  perform private.consume_offer_use(v_t.customer_id, v_t.offer_id, now());

  -- 12. record (UNIQUE claim_token_id / idempotency_key are the final backstop)
  begin
    insert into public.redemptions (claim_token_id, idempotency_key, customer_id, card_id, offer_id,
                                    business_id, executive_id, bill_number, bill_amount)
    values (v_t.id, p_idempotency_key, v_t.customer_id, v_t.card_id, v_t.offer_id,
            v_t.business_id, v_uid, v_bill_number, p_bill_amount)
    returning * into v_r;
  exception when unique_violation then
    perform private.raise_error('ALREADY_REDEEMED');
  end;

  -- 13. consume the token
  perform private.mark_claim_used(v_t.id);

  -- 14. audit
  perform audit.write('claim.redeem', 'redemption', v_r.id, null,
    jsonb_build_object('claim_id', v_t.id, 'offer_id', v_t.offer_id, 'customer_id', v_t.customer_id,
                       'card_id', v_t.card_id, 'bill_number', v_bill_number, 'bill_amount', p_bill_amount),
    v_t.business_id);
  return private.redemption_result(v_r, false);
end;
$$;
