revoke all on table public.card_batches, public.cards, public.card_assignments from public, anon, authenticated;
revoke all on sequence public.card_number_seq from public, anon, authenticated;
-- token_hash is never readable through the API.
grant select (id, batch_id, card_number, status, current_customer_id, blocked_reason, created_at, updated_at)
  on table public.cards to authenticated;
grant select on table public.card_assignments, public.card_batches to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function api.link_card(text) from public, anon;
grant execute on function api.link_card(text) to authenticated;
revoke all on function api.create_card_batch(text, integer) from public, anon;
grant execute on function api.create_card_batch(text, integer) to authenticated;
revoke all on function api.scan_card(text, uuid) from public, anon;
grant execute on function api.scan_card(text, uuid) to authenticated;
revoke all on function api.approve_card(uuid, uuid, public.identity_evidence[], text) from public, anon;
grant execute on function api.approve_card(uuid, uuid, public.identity_evidence[], text) to authenticated;
revoke all on function api.reject_card(uuid, uuid, text) from public, anon;
grant execute on function api.reject_card(uuid, uuid, text) to authenticated;
revoke all on function api.block_card(uuid, uuid, text) from public, anon;
grant execute on function api.block_card(uuid, uuid, text) to authenticated;
revoke all on function api.reissue_card(uuid, text, uuid, text) from public, anon;
grant execute on function api.reissue_card(uuid, text, uuid, text) to authenticated;
