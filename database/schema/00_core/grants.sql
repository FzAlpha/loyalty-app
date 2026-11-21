-- Internal schemas are never reachable from the API roles.
revoke all on schema private, audit, ops from public, anon, authenticated;
grant usage on schema api to anon, authenticated;

-- New objects get no implicit privileges (each module grants explicitly).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

revoke all on table public.error_codes, public.app_settings from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
