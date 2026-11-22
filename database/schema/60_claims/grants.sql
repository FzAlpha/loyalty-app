revoke all on table public.claim_tokens from public, anon, authenticated;
grant select (id, customer_id, card_id, offer_id, business_id, status, expires_at, created_at, used_at,
              previewed_by, previewed_at)
  on table public.claim_tokens to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function api.create_claim_token(uuid) from public, anon;
grant execute on function api.create_claim_token(uuid) to authenticated;
revoke all on function api.preview_claim(text) from public, anon;
grant execute on function api.preview_claim(text) to authenticated;
