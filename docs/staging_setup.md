# Staging setup — rewards-app-staging

Project ref `feiiyzyqtvntipcflbdo` (ap-south-1, Free plan). URL `https://feiiyzyqtvntipcflbdo.supabase.co`.

## Done by Claude (Supabase MCP tools, 2026-11-22)
- Schema: all `database/schema` modules applied; 121 function bodies match the repo (md5).
- Seed: reference data and 8 pg_cron jobs.
- Edge Functions (v1, ACTIVE): `auth-register`, `auth-sign-in`, `auth-recover`, `jobs-runner` (verify_jwt off); `account-deletion`, `card-batches`, `reports-export`, `staff-admin` (verify_jwt on).
- Vault: `jobs_runner_url` set.
- Advisors: only the 7 expected INFO "RLS enabled, no policy" notices (deny by default).

## Applied 2026-11-23 (Claude, browser pane)
- Signups off, confirm email off, phone on, confirm phone off, Send SMS hook = `private.auth_send_sms_hook`, `api` exposed, IP Address Forwarding on. Other values already matched.
- Phone could not be saved without Twilio fields until the Send SMS hook was enabled; with the hook on, the dashboard saves it with no credentials.
- Vault `jobs_runner_secret` generated in-database (`gen_random_bytes(32)`, hex); user copied it to Edge Function secret `JOBS_RUNNER_SECRET`.
- Verified: jobs-runner 403 without/wrong secret; pg_net call with Vault values → 200 `claimed: 0`.
- Data API "Automatically expose new tables" is on (default); left unchanged.

## F1 backend applied 2026-11-25 (Claude, Supabase MCP)
- Applied only the F1 changes (new tables incl. 55_partners, changed functions, grants/RLS, new seed rows), not a full re-apply.
- pgTAP `database/tests/22_f1_customer.test.sql`: 53/53 pass, run inside a rolled-back transaction (TAP output returned through a raised error; no psql here).
- Advisors: only expected notices (RLS-no-policy deny-all tables incl. card_passes; SECURITY DEFINER RPCs; list_businesses open to anon by design; unindexed partner_offers.created_by FK, same as offers).
- No business rows or partner data loaded yet.

## F2 backend applied 2026-11-26 (Claude, Supabase MCP)
- Migration `f2_admin_staff_context_today`: api.get_my_staff, api.list_my_redemptions_today, grants, setting staff.today.page_max.
- pgTAP `database/tests/23_f2_admin.test.sql`: 24/24 pass in a rolled-back transaction (results collected in a temp table; pgTAP 1.3.3 has no per-test results table).
- Advisors: no new lint types; the two RPCs are listed with the other SECURITY DEFINER api.* RPCs (by design).

## Staff test accounts (2026-11-26)
- First owner (bootstrap, because `staff-admin` needs an existing owner):
  1. User: Admin API `POST /auth/v1/admin/users` with phone, temp password, `phone_confirm: true`, `app_metadata.account_type = "staff"`. Run locally; the user types the password and the secret key.
  2. Claude (SQL): `private.revoke_roles(uid, 'customer')` + `private.grant_role(uid, 'owner', null, null)` + `insert into public.staff (user_id, business_id, display_name) values (uid, null, name)`.
- The new `sb_secret_` key goes only in the `apikey` header (it is not a JWT). Calls whose User-Agent looks like a browser (PowerShell's default starts with `Mozilla/5.0`) are refused with "Forbidden use of secret API key in browser". Send a plain User-Agent.
- More staff: sign in as the owner and call `staff-admin` `create` (the app path).
- Created: owner "chirag" (staff.manage OK); executive "chirag-exe-1" at Demo Dining Lounge via staff-admin.
- Issue: both also got the `customer` role. Likely cause (inferred, not confirmed in Auth source): admin createUser inserts the row before app_metadata.account_type is set, so the signup trigger sees no "staff". SQL tests miss it (they insert app_metadata directly).
- Fixed 2026-11-26: migration `staff_upsert_revokes_customer_role` (api.svc_staff_upsert revokes `customer`). Checked in a rolled-back transaction (customer 1 → 0, executive granted). Customer role revoked on both test accounts; they now hold only owner / executive.
- Passwords are not recorded anywhere; both accounts must change password at first sign-in.

## Business management applied 2026-11-26 (Claude, Supabase MCP)
- Migration `business_create_delete_deactivate`: error codes BUSINESS_INACTIVE/BUSINESS_IN_USE, api.create_business, api.delete_business, api.list_managed_businesses, private.business_is_active/require_business_active, updated evaluate_offer, scan_card, approve_card, reject_card.
- pgTAP `database/tests/21_businesses.test.sql`: 23/23 pass in a rolled-back transaction.
- Demo data checked: 4 active businesses, 6 active offers, 1 partner, owner + executive.
- Migration `business_slug_unaccent_delete_returns_assets`: unaccent extension, create_business slug without accents, delete_business returns the files folder. pgTAP 21: 25/25 in a rolled-back transaction; owner can still delete files under a deleted business folder (storage_can_write true).

## Dashboard checklist (user)
Values mirror `backend/supabase/config.toml`. If a setting can't be found or can't be saved, **stop and report back**. Never enter fake Twilio (or any SMS) credentials on hosted.

1. **Data API**: expose schema `api` (keep `public`, `graphql_public`). Set extra search path to `public, extensions`. Max rows 1000.
2. **Auth → Sign In / Providers**:
   - "Allow new users to sign up": **off**. Anonymous sign-ins: off.
   - Email provider: on. Confirm email: **off**. Secure password change: **off**. Secure email change (double confirm): on.
   - Phone provider: **on**. Confirm phone: **off**. No SMS provider credentials.
3. **Auth → Hooks**: Send SMS hook → Postgres function `private.auth_send_sms_hook`. (Unverified that the dashboard lists the `private` schema. If it doesn't, stop and report.)
4. **Auth → defaults to confirm**: minimum password length 6, no extra password requirements, JWT expiry 3600, refresh token rotation on, reuse interval 10.
5. **Auth → Rate Limits**: token refresh 150, sign-in/sign-ups 30. **IP Address Forwarding**: switch on. m0-findings says it's under Authentication → Rate Limits. Not verified on this project; if it's missing or plan-gated, report back.
6. **Site URL**: leave as is until a frontend is deployed. CORS is closed: `CORS_ALLOWED_ORIGINS` is unset.
7. **JOBS_RUNNER_SECRET** (64 hex chars). Generate it locally in PowerShell (it goes to the clipboard and is never shown):
   ```powershell
   $b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b|%{$_.ToString('x2')}) -join '' | Set-Clipboard
   ```
   - Edge Functions → Secrets: add `JOBS_RUNNER_SECRET` = the pasted value.
   - SQL editor: `select vault.create_secret('<paste>', 'jobs_runner_secret');` The editor may keep this in query history, so delete that history entry afterwards.
   - Don't paste the value into chat or any repo file.

## Verification after the checklist (Claude)
- `jobs-runner` without the header → 401, not 503 `JOBS_NOT_CONFIGURED`.
- Run `private.job_process_deletions()` once and check the pg_net response (`net._http_response`) returns 2xx.
- Phone + password sign-in through `auth-register` / `auth-sign-in` on hosted.

## Known limitations / unverified
- F1: only the changed modules were applied, not a full schema re-apply; not byte-diffed against the repo.
- F1/F2: backend/contracts not regenerated (needs CI codegen; the MCP type generator covers only `public`, not `api`).
- Function sources were transcribed into the deploy calls; only boot-tested, not byte-diffed against the repo. The CI deploy job (planned before production) removes this gap.
- Phone sign-in on hosted with no SMS provider: not yet tested.
- Send SMS hook with `private` schema in the dashboard: not yet tested.
- `Sb-Forwarded-For` / IP forwarding: not yet tested. Without it, all customers share one sign-in rate-limit bucket.
- Session revocation on hosted: not yet tested.
