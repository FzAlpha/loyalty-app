revoke all on table public.partners, public.partner_offers from public, anon, authenticated;
grant select on table public.partners, public.partner_offers to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function api.list_partner_offers() from public, anon;
grant execute on function api.list_partner_offers() to authenticated;
revoke all on function api.upsert_partner(jsonb) from public, anon;
grant execute on function api.upsert_partner(jsonb) to authenticated;
revoke all on function api.upsert_partner_offer(jsonb) from public, anon;
grant execute on function api.upsert_partner_offer(jsonb) to authenticated;
revoke all on function api.set_partner_offer_status(uuid, public.partner_offer_status) from public, anon;
grant execute on function api.set_partner_offer_status(uuid, public.partner_offer_status) to authenticated;
