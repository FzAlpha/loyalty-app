revoke all on function private.report_tz(uuid) from public, anon, authenticated;
revoke all on function private.report_guard(uuid, timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function api.report_summary(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function api.report_redemptions(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function api.report_signups(timestamptz, timestamptz) from public, anon;
revoke all on function api.report_birthdays(integer) from public, anon;
revoke all on function api.report_redemption_rows(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function api.report_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function api.report_redemptions(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function api.report_signups(timestamptz, timestamptz) to authenticated;
grant execute on function api.report_birthdays(integer) to authenticated;
grant execute on function api.report_redemption_rows(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function api.report_export_max_rows() from public, anon;
grant execute on function api.report_export_max_rows() to authenticated;
