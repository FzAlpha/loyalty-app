# M0 spike findings (in progress)

Run: 2026-11-18 (UTC 2026-11-17 19:10–19:20) · temporary Supabase project `rewards-app-m0-spike` (Free plan, ap-south-1, org "prolink") · to be deleted after M0.
Tool versions seen: Node 26.13.0, pnpm 12.21.0 (via `npx`; Corepack is not bundled with this Node), Supabase CLI 3.2.0, Expo SDK 58.0.26, React Native 0.88.1, Edge Runtime 1.79.1 (Deno 2.1.4).

Status legend: **Verified** = observed in a test · **Documented** = Supabase docs say so, not yet tested here · **Unverified** = not yet known.

## (a) Phone + password signup without SMS (§7.1)

| Step | Result | Status |
|---|---|---|
| Default hosted settings | `phone: false`, `phone_autoconfirm: false`, `sms_provider: twilio` (no credentials) | Verified |
| 1. Client `signUp({ phone, password })` with phone provider off | `400 phone_provider_disabled` | Verified |
| 2. Admin `createUser({ phone, password, phone_confirm: true })` from an Edge Function | User created, `phone_confirmed_at` set, **no SMS sent** | Verified |
| Password sign-in for that user with phone provider off | `422 phone_provider_disabled` ("Phone logins are disabled") | Verified |
| Send SMS hook on Free plan | Listed as "Free, Pro" in Supabase Auth Hooks docs | Documented |
| Refusing hook `public.spike_send_sms_refuse(jsonb)` created (always returns `error` 403, sends nothing) | Function runs; grants to `supabase_auth_admin` only | Verified |
| Phone provider enabled with the hook on, Confirm phone off, no Twilio credentials (2026-11-21) | Saved by user; `/settings` shows `phone: true`, `phone_autoconfirm: true` | Verified |
| Password sign-in, correct password | `200`, normal Supabase session | Verified |
| Password sign-in, wrong password | `400 invalid_credentials` | Verified |
| OTP request (`/otp`) | `403` "SMS is not supported by this app."; no SMS sent | Verified |
| Client `signUp({ phone, password })` with signups allowed | `200`, account + session created directly: **bypasses `auth-register`** | Verified |
| **OTP request for an unknown number** | Still `403` to the caller, but Supabase **created a confirmed user for that number and a server-side session** (no tokens returned to caller) | Verified: **risk** |
| "Allow new users to sign up" **off** (2026-11-21): client `signUp` | `422 signup_disabled` | Verified |
| Signups off: `/otp` for an unknown number | `422 signup_disabled`; **no account created** | Verified |
| Signups off: Admin `createUser` (`phone_confirm: true`) from Edge Function | Works | Verified |
| Signups off: password sign-in (new admin-created user and older user) | `200`, sessions issued | Verified |
| Signups off: `/otp` for an existing user | `403` from refusing hook; no SMS | Verified |

**Risk found and fixed by config:** with public signups on, anyone could self-register or create placeholder accounts for any number via `/otp`. With signups off, both are refused while staff-side `auth-register` and sign-in still work. Test users were deleted after each run.

**Result (a): working no-SMS setup on Free plan** = Phone provider on · Confirm phone off · no SMS credentials · Send SMS hook set to a Postgres function that always refuses · "Allow new users to sign up" off · customers created only by `auth-register` via Admin `createUser`.

Notes:
- Admin-created users carry `identity_data.phone_verified: false` and `phone_confirmed_at` set. Per §7.4 neither is treated as proof of phone ownership.
- Supabase stores the phone without `+` (`919990000002`).
- Hidden-email route (option 3) not needed so far.

## (b) Supabase per-IP limits when sign-in goes through an Edge Function (§7.2, §17.1)

| Test | Result | Status |
|---|---|---|
| Source IP Supabase Auth sees for relayed sign-ins | One AWS address (Amazon, Mumbai) for every call from the function | Verified (edge logs `cf_connecting_ip`) |
| 45 rapid failed sign-ins via the function | ~32–35 × `400`, then `429 over_request_rate_limit` | Verified |
| Direct sign-in from another IP at the same moment | `400` (not limited): separate bucket | Verified |
| Client-set `X-Forwarded-For` via the function | Ignored; still `429` | Verified |
| Default `/auth/v1/token` limit | 1800/hour per IP, burst 30, token bucket; **not customisable** | Documented |
| Fix: `Sb-Forwarded-For` header + **secret** API key + "IP Address Forwarding" switched on (Authentication → Rate Limits) | Documented by Supabase; plan-tier restriction not stated | Documented |
| Secret key available inside Edge Functions | `SUPABASE_SECRET_KEYS` (JSON, key `default`) is present | Verified (names only) |
| `Sb-Forwarded-For` with the toggle **off** | Ignored; throttled after ~32 | Verified |
| `Sb-Forwarded-For` with the toggle **on** | Pending: user enables toggle | Unverified |

Consequence if forwarding does not work: all customers share one burst of ~30 sign-ins and ~1800/hour through `auth-sign-in`, so busy periods would throttle legitimate users.

## (c) Expo + pnpm workspaces (§17.4)

| Test | Result | Status |
|---|---|---|
| Blank Expo SDK 58 TypeScript app in `frontend/customer` + `packages/shared` workspace package, pnpm default (isolated) linker, no `.npmrc` | `pnpm install` OK | Verified |
| `expo export --platform android` (Metro bundle) importing `@rewards/shared` | Bundled 595 modules; workspace code present in bundle | Verified |
| `expo-doctor` | 19/20 pass; the failing check was a React Native Directory server error (network), not a project issue | Verified |
| Native Android/iOS build (Gradle/Xcode, EAS) | Not tested: no Android SDK on this PC | Unverified |
| pnpm 12 `minimumReleaseAge` | pnpm auto-added recent Expo packages to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` | Verified |

Result so far: `node-linker=hoisted` **not** needed for JS bundling. Re-check with a native/EAS build in M1.

## Folder wiring (§1)

| Test | Result | Status |
|---|---|---|
| `supabase init --workdir backend` | Works; creates `backend/supabase/config.toml` | Verified |
| `[db.migrations] schema_paths` | CLI 3.2.0 warns it **no longer** drives `db diff`; only the legacy migra engine reads it | Verified (CLI warning) |
| Replacement | `supabase db schema declarative sync` reads `[experimental.pgdelta] declarative_schema_path` (default `supabase/schemas`; config comment says "under `supabase/`") | Verified (CLI help/config) |
| `declarative_schema_path = "../../database/schema"` | Not rejected at parse time; diff/sync needs Docker (shadow DB) | Unverified |

Plan §1 wiring must change (see "Plan impact"). Final check needs Docker: either Docker Desktop on this PC or a GitHub Actions run in M1.

## Spike-only leftovers (removed when the project is deleted)
- `spike-admin-create` Edge Function accepts the public anon key, so anyone with the URL can create test users. Acceptable only on this throwaway project.

## Not part of M0, noted in passing
- Admin `signOut` in supabase-js takes a user JWT, not a user id, so it is **not** a server-side "revoke all sessions for user X" call. §7.3 session-revocation method is still open (M2).

## Plan impact (proposed, needs approval)
1. §1 wiring: replace `schema_paths` with `declarative_schema_path`, or use the plan's fallback (`sync-db` copies `database/schema` → `backend/supabase/schemas`). Decide after a Docker run.
2. §7.2: `auth-sign-in` should forward the caller IP with `Sb-Forwarded-For` using the secret key, if test (b) passes with the toggle on.
3. §7.1/§7: phone + password works without SMS using a refusing Send SMS hook (Free plan). Signup goes only through `auth-register` (Admin `createUser`), with public signups turned off, once that combination passes a test. §7's "no Send SMS Hook" wording must be corrected.
4. Tooling: Corepack is not bundled with Node 26; pin pnpm via `packageManager` and run it with `npx pnpm@<version>` or a global npm install.
