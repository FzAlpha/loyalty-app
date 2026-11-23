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
- Function sources were transcribed into the deploy calls; only boot-tested, not byte-diffed against the repo. The CI deploy job (planned before production) removes this gap.
- Phone sign-in on hosted with no SMS provider: not yet tested.
- Send SMS hook with `private` schema in the dashboard: not yet tested.
- `Sb-Forwarded-For` / IP forwarding: not yet tested. Without it, all customers share one sign-in rate-limit bucket.
- Session revocation on hosted: not yet tested.
