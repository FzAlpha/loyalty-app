revoke all on table public.redemptions from public, anon, authenticated;
grant select on table public.redemptions to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function api.redeem_claim(text, text, text, numeric) from public, anon;
grant execute on function api.redeem_claim(text, text, text, numeric) to authenticated;
revoke all on function api.list_my_redemptions(timestamptz, integer) from public, anon;
grant execute on function api.list_my_redemptions(timestamptz, integer) to authenticated;
revoke all on function api.list_my_redemptions_today(uuid, timestamptz, integer) from public, anon;
grant execute on function api.list_my_redemptions_today(uuid, timestamptz, integer) to authenticated;
