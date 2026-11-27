revoke all on table public.offers, public.offer_schedules, public.customer_groups, public.customer_group_members,
  public.offer_eligible_groups, public.offer_usage, public.offer_categories from public, anon, authenticated;
grant select on table public.offers, public.offer_schedules, public.customer_groups, public.customer_group_members,
  public.offer_eligible_groups, public.offer_usage, public.offer_categories to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function api.list_eligible_offers() from public, anon;
grant execute on function api.list_eligible_offers() to authenticated;
revoke all on function api.list_offer_categories() from public, anon;
grant execute on function api.list_offer_categories() to authenticated;
revoke all on function api.upsert_offer(jsonb) from public, anon;
grant execute on function api.upsert_offer(jsonb) to authenticated;
revoke all on function api.set_offer_status(uuid, public.offer_status) from public, anon;
grant execute on function api.set_offer_status(uuid, public.offer_status) to authenticated;
revoke all on function api.storage_can_write(text, text) from public, anon;
grant execute on function api.storage_can_write(text, text) to authenticated;
revoke all on function api.get_storage_buckets() from public, anon;
grant execute on function api.get_storage_buckets() to authenticated;
revoke all on function api.list_offers(uuid) from public, anon;
grant execute on function api.list_offers(uuid) to authenticated;
revoke all on function private.pause_business_offers(uuid) from public, anon, authenticated;
