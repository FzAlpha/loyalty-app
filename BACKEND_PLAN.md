# Rewards-app — Backend Plan

> Source: `Group_Rewards_App_Updated_Technical_Plan.pdf` (16 Nov 2026).
> Scope: **backend only** (Supabase: Postgres, Auth, RLS, RPC, Edge Functions, Storage, Realtime, Cron).
> Folder layout follows the structure the user approved on 18 Nov 2026 (§1), **not** the monorepo in the PDF.
> Status: **PLAN — nothing built yet.** User decisions of 18 and 21 Nov 2026 are applied (§16). M0 findings: `docs/m0-findings.md`. Implications and **unresolved technical limitations** are in §17. Auth (M2) starts only after M0 sign-off.
> Hard constraints: **Supabase Free plan** (no Team/Enterprise or paid-only features) · **no SMS of any kind** · **pnpm workspaces**.

---

## 0. Guiding principles

1. **Nothing hard-coded.** Every value that could change lives in one of three places (see §3):
   - **Environment variables**: secrets, URLs, provider keys, per-environment toggles.
   - **`app_settings` table**: business rules such as claim TTL, lockout thresholds, QR prefixes, retention days, timezone and rate limits. Owners can change them without a deploy.
   - **Reference/seed data**: businesses, roles, permissions, error codes and customer groups. Loaded from data files, never from SQL literals in logic.
2. **Modular by domain.** Each module owns its schema, RLS, RPCs, Edge Functions and tests. A module talks to another module only through that module's functions, not its tables.
3. **The database is the source of truth and the security boundary.** All writes go through `SECURITY DEFINER` RPCs or Edge Functions. Tables have RLS on, are deny-by-default, and grant no direct write access.
4. **Never trust the client.** Role, business ID and customer ID always come from `auth.uid()` and live table lookups, never from request params or long-lived JWT claims.
5. **Atomic and idempotent** for every state change that matters (card link, approval, claim and redemption).

---

## 1. How the repo folders map to Supabase

Supabase CLI requires one project directory named `supabase/` holding `config.toml`, `migrations/` and `functions/`. The CLI's `--workdir` flag (or the `SUPABASE_WORKDIR` env var) chooses where that directory lives. Plan:

```
loyalty app/   (the repo root, called "group-rewards/" in the approved structure)
├── pnpm-workspace.yaml              ← workspace members: frontend/*, packages/*, backend (Node tooling only)
├── package.json                     ← root scripts only (lint, typecheck, codegen); no app code
├── .npmrc                           ← pnpm linker setting (see §17, Expo + pnpm)
├── .github/workflows/               ← CI + nightly backup workflow (approved 18 Nov 2026)
├── frontend/
│   ├── customer/                    ← Expo customer app
│   ├── admin/                       ← Expo executive + owner app
│   └── dashboard/                   ← Next.js owner web dashboard
│
├── backend/                         ← Supabase project root  (supabase --workdir backend …)
│   ├── supabase/
│   │   ├── config.toml              ← every secret/URL via env(...); no literals
│   │   ├── migrations/              ← GENERATED from database/schema (supabase db diff); reviewed, committed
│   │   └── functions/               ← Edge Functions (Deno + TypeScript)
│   │       ├── _shared/             ← cross-cutting modules (see §1.2)
│   │       ├── auth-register/       ← only way customers are created (Admin createUser; public signup off, §7.1)
│   │       ├── auth-sign-in/        ← phone + password via Supabase Auth; best-effort lockout (§7.2)
│   │       ├── auth-recover/        ← redeem a staff-issued recovery code (§7.3)
│   │       ├── staff-admin/
│   │       ├── card-batches/
│   │       ├── account-deletion/
│   │       ├── reports-export/
│   │       └── jobs-runner/
│   ├── contracts/                   ← GENERATED only, never hand-edited (see §12)
│   │   ├── database.types.ts        ← `supabase gen types typescript`
│   │   └── errors.ts                ← generated from database error-code catalog
│   ├── tests/                       ← Edge Function tests + concurrency/load scripts
│   ├── package.json                 ← backend scripts: codegen, env check, deploy helpers (no scripts/ folder)
│   ├── .env.example                 ← every variable documented, no real values
│   └── README.md
│
├── database/                        ← SQL source of truth, organised by module
│   ├── schema/                      ← declarative schema (wired via declarative_schema_path or sync-db fallback, §1)
│   │   ├── 00_core/                 ← extensions, schemas, helpers, settings, error catalog
│   │   ├── 10_identity/             ← profiles, roles, permissions, authz helpers
│   │   ├── 20_businesses/
│   │   ├── 30_staff/
│   │   ├── 40_cards/
│   │   ├── 50_offers/
│   │   ├── 60_claims/
│   │   ├── 70_redemptions/
│   │   ├── 80_audit/
│   │   ├── 85_security/             ← login attempts, rate limits
│   │   ├── 90_accounts/             ← deletion requests, anonymisation
│   │   ├── 95_reporting/            ← report views/RPCs
│   │   └── 99_jobs/                 ← pg_cron registration (schedules read from settings)
│   │       (each module: tables.sql, rls.sql, functions.sql, triggers.sql, grants.sql)
│   ├── seed/
│   │   ├── reference/               ← roles, permissions, error codes, default settings (all envs)
│   │   ├── data/                    ← businesses.json, customer_groups.json (client-provided)
│   │   └── dev/                     ← fake customers/cards/offers for local only
│   ├── tests/                       ← pgTAP tests (RLS, RPC, concurrency, constraints)
│   └── docs/                        ← ERD, state machines, retention policy
│
├── packages/                        ← shared code used by all three frontends (see §12)
│   ├── shared/                      ← Zod request/response schemas, constants, types (re-exports backend/contracts)
│   ├── api/                         ← typed client: one function per api.* RPC / Edge Function
│   └── ui/                          ← shared UI components (frontend concern; not part of the backend plan)
│
├── tools/
│   └── card-generator/              ← Python QR/PDF card tool (reads a batch export, no DB secrets)
│
└── docs/                            ← project-level docs: setup, runbooks, admin onboarding, handover, backup/restore
```

**Wiring (M0: partly checked, final check needs Docker → GitHub Actions in M1):**
- M0 finding: in Supabase CLI 3.2.0, `[db.migrations] schema_paths` **no longer drives `db diff`** (CLI warning). The replacement is `supabase db schema declarative sync`, which reads `[experimental.pgdelta] declarative_schema_path` (default `supabase/schemas`).
- Candidate: `declarative_schema_path = "../../database/schema"`. Accepted at parse time; whether diff/sync works with a path outside `supabase/` is **unverified**.
- `[db.seed] sql_paths = ["../../database/seed/reference/*.sql", …]` (unverified).
- `supabase test db` points at `database/tests`.
- **Fallback if the CLI rejects paths outside `supabase/`:** a `sync-db` script in `backend/package.json` copies `database/schema` into `backend/supabase/schemas` before running `db diff`. `database/` stays the only place anyone edits.

### 1.1 Postgres schemas (namespaces)

| Schema | Exposed via API? | Contents |
|---|---|---|
| `public` | yes (read only, through RLS) | Tables the apps may **read**, such as offers, own profile and own card |
| `api` | yes | **Only** callable RPCs: the app's write surface. `SECURITY DEFINER`, `search_path=''` |
| `private` | **no** | Helpers: authz checks, settings lookup, eligibility engine, token hashing, audit writer |
| `audit` | no | Append-only audit log |
| `ops` | no | Login attempts, rate-limit buckets, job state |

The `api` schema gets `GRANT EXECUTE … TO authenticated` per function. Table writes are `REVOKE`d from `anon` and `authenticated`.

### 1.2 Edge Function shared modules (`functions/_shared/`)

```
_shared/
  config/      env loader + Zod validation; fails fast when a variable is missing
  supabase/    client factories: userClient(req) uses the caller's JWT, adminClient() uses the service role
  http/        request parsing, CORS (origins from env), JSON responses, error→HTTP mapping
  errors/      AppError + codes (generated from DB catalog, never string literals)
  authz/       requireUser(), requirePermission() → calls private RPC, never trusts body
  credentials/ phone normalisation (E.164), password policy check
  ratelimit/   calls ops.consume_rate_limit()
  audit/       thin wrapper over audit RPC
  logging/     structured logs, request id, PII redaction
```

Each function's `index.ts` stays a thin handler: **validate → authorize → call one RPC or service → map the result**. Business rules live in SQL, so the RPC path and the Edge Function path cannot drift apart.

---

## 2. What runs where

| Concern | Where | Why |
|---|---|---|
| Card link, approve/reject, claim create/preview/redeem, block/reissue, offer CRUD, settings | **SQL RPC** (`api.*`) | Needs transactions and row locks; one round trip |
| Registration (`auth-register`), phone sign-in with lockout, recovery-code redemption, staff create/reset/disable, account deletion (auth user removal), CSV export, card batch export | **Edge Function** | Needs the service role or Auth Admin API, outbound HTTP, or file streaming |
| Expiry, cleanup, deletion processing | **pg_cron** (+ `pg_net` → Edge Function when Auth Admin API is needed) | Runs on the server, so no client is involved |
| Live status (card approved, claim redeemed) | **Realtime** (Postgres changes, RLS-filtered) | Customer screen updates instantly |
| Logos and banners | **Storage** buckets with RLS | Owner writes; public or authenticated read |

---

## 3. Configuration strategy (the "no hard-coding" contract)

### 3.1 Environment variables (`backend/.env.example`, validated at startup)

| Group | Variables (names only) |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `SUPABASE_PROJECT_REF` |
| Auth (server only) | None extra: M0 showed phone identities work without SMS, so no `AUTH_INTERNAL_EMAIL_DOMAIN` (§7.1) |
| Backups (CI only) | `BACKUP_DB_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_TARGET_*` (client-owned external cloud storage; provider not yet chosen), `BACKUP_RETENTION_DAYS` (30) |
| Security | `CORS_ALLOWED_ORIGINS`, `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET`, `PLAY_INTEGRITY_*` (optional), `FEATURE_*` flags |
| Ops | `APP_ENV` (`local`\|`staging`\|`production`), `LOG_LEVEL`, `JOBS_RUNNER_SECRET` |

`config.toml` uses `env(VAR)` for every secret. Frontends get **only** the URL and anon key.

### 3.2 `app_settings` table (runtime business rules)

```
app_settings(key text, scope_business_id uuid null, value jsonb, value_schema jsonb,
             description text, updated_by uuid, updated_at timestamptz)
  PK (key, coalesce(scope_business_id, '00000000-…'))
```
- `private.get_setting(key, business_id default null)` returns the business-specific value first, then the global one, then **raises an error**. It never falls back to a silent default in code.
- Values are validated against `value_schema` (JSON Schema via `pg_jsonschema`) on write.
- Default values come from `database/seed/reference/settings.sql`.

Initial keys (values come from the PDF and are seeded, not coded):

| Key | Seed value | Used by |
|---|---|---|
| `claims.ttl_seconds` | 600 | create_claim_token |
| `qr.prefix` | `GR` (decided) | QR encode |
| `qr.accepted_prefixes` | `["GR"]` | QR parse; lets a future rename still accept already-printed cards |
| `qr.kind.card` / `qr.kind.claim` | `C` / `Q` | Distinguishes card and claim QRs that share the `GR` prefix |
| `qr.version.card` / `qr.version.claim` | 1 / 1 | QR encode/parse |
| `cards.token_bytes` | 16 | card batches |
| `cards.number_prefix` / `cards.number_digits` | `GR` / 6 → `GR-000001` (decided; kept with app name "Rewards-app", §17.6) | card batches |
| `cards.reissue_requires_approval` | false | reissue_card |
| `auth.lockout.max_failures` / `window_seconds` / `lock_seconds` | 5 / 900 / 900 (decided; best-effort, §7.2) | auth-sign-in |
| `auth.password.min_length` | proposed 8 (must not be lower than the Supabase Auth setting) | client validation, auth-recover |
| `auth.recovery.code_ttl_seconds` / `code_max_attempts` / `code_length` | proposed 900 / 5 / 8 | in-store recovery (§7.3) |
| `auth.recovery.remote_code_ttl_seconds` / `remote_daily_limit_per_owner` | proposed 300 / 5 | owner remote fallback (§7.3) |
| `ratelimit.<action>` | `{capacity, refill_per_sec}` | register, sign-in, recovery issue + redeem, claim create, link card |
| `redemption.bill_number_required` / `bill_amount_required` | false / false, overridable per business (decided) | redeem |
| `locale.timezone` | `Asia/Kolkata` | day/time windows, "today" reports |
| `retention.*` | **provisional technical defaults** in §17.5 (not legal requirements; pending client legal review under the DPDP Act) | jobs |
| `jobs.<name>.cron` | cron string | jobs registration |
| `offers.cross_business_enabled` | false | phase-2 switch |

### 3.3 Reference data (seeded from files)

- `roles`, `permissions`, `role_permissions` (see §5): adding a **manager** role becomes a data change, not a code change.
- `error_codes(code, http_status, description)`: the backend raises codes and the frontends translate them. The `codegen` script exports this table to `backend/contracts/errors.ts`.
- `businesses`: loaded from `database/seed/data/businesses.json` (the four businesses, logos and colours when the client supplies them).
- `customer_groups`: loaded from a data file.

---

## 4. Data model (by module)

All primary keys are `uuid` (`gen_random_uuid()`). All tables get `created_at` and `updated_at` (trigger-maintained), FKs, `CHECK` constraints and indexes on FKs and lookup columns. Statuses are Postgres enums because the state machines in code depend on them. Everything else is data.

### core
- `app_settings` (above), `error_codes`.

### identity
- `profiles(id → auth.users, full_name, phone_e164 unique, identity_checked_at null (summary of the latest passed check in `identity_checks`; **not phone-ownership verification**, §7.4), date_of_birth null, membership_status enum[none,pending,active,rejected,blocked], account_status enum[active,disabled,deletion_pending,deleted], created_at, updated_at)`
- `roles(id, key unique, name)`, `permissions(id, key unique, description)`, `role_permissions(role_id, permission_id)`
- `user_roles(user_id, role_id, business_id null, is_active, granted_by, granted_at)`: `business_id` null means all businesses (owner).
- `identity_checks(id, customer_id, executive_id, business_id, evidence enum[registration_details, proof_of_purchase, account_info] [], result enum[passed, failed], note text null (short, no ID numbers), checked_at)`. **Data minimisation:** no document images, ID numbers or copies of proof are stored, only which kinds of evidence were seen, the result and the responsible executive.
- `phone_release_requests(id, phone_e164, holder_customer_id, requested_by, requested_business_id, reason, status enum[pending, approved, rejected, cancelled], decided_by null, decided_at null, created_at)`. Requester and approver must be different people.

### businesses
- `businesses(id, slug unique, name, logo_path, brand_color, address, phone, timezone null, opening_hours jsonb, is_active)`

### staff
- `staff(user_id PK → profiles, business_id null, display_name, is_active, must_change_password bool, disabled_at, disabled_by)`. Operational detail; permissions come from `user_roles`.

### cards
- `card_batches(id, label, quantity, created_by, exported_at, export_count)`
- `cards(id, batch_id, card_number unique, token_hash bytea unique, status enum[unassigned,pending,active,blocked,retired], current_customer_id null unique-where-not-null, blocked_reason, …)`
- `card_assignments(id, card_id, customer_id, status enum[pending,approved,rejected,revoked], requested_at, decided_by, decided_at, decision_business_id, reason)` keeps the full history.
  Partial unique index: one `pending|approved` assignment per customer and one per card.

### offers
- `offers(id, business_id, title, description, banner_path, terms, status enum[draft,active,paused,archived], starts_at, ends_at, max_uses_per_customer null, total_usage_limit null, total_redeemed int default 0, min_purchase_amount null, max_discount_amount null, birthday_window_days null, …)`
- `offer_schedules(offer_id, weekday smallint, start_time, end_time)`: no rows means any time.
- `offer_eligible_groups(offer_id, group_id)`: no rows means all active members.
- `customer_groups(id, key, name)`, `customer_group_members(group_id, customer_id)`
- `offer_usage(offer_id, customer_id, used_count, last_used_at)` PK(offer_id, customer_id)

### claims
- `claim_tokens(id, customer_id, card_id, offer_id, business_id, secret_hash bytea, status enum[open,used,expired,revoked], expires_at, created_at, used_at, previewed_by, previewed_at)`
  Partial unique index: one `open` token per (customer, offer).

### redemptions
- `redemptions(id, claim_token_id unique, idempotency_key unique, customer_id, card_id, offer_id, business_id, executive_id, bill_number null, bill_amount null, redeemed_at)`

### audit
- `audit.audit_logs(id, actor_id, actor_role, business_id, action, entity_type, entity_id, before jsonb, after jsonb, request_id, ip inet, created_at)`. Append-only: no UPDATE/DELETE grants, plus a trigger that blocks both.

### security (`ops`)
- `ops.login_attempts(phone_e164, failures, first_failure_at, locked_until, last_ip)`
- `ops.recovery_codes(id, user_id, code_hash, channel enum[in_store,owner_remote], issued_by, issued_business_id null, reason null, expires_at, attempts, status enum[open,used,expired,revoked], used_at)`. Partial unique index: one `open` code per user
- `ops.rate_limit_buckets(bucket_key, tokens, updated_at)` for a Postgres token bucket. Redis is not needed at this scale.

### accounts
- `deletion_requests(id, user_id, status enum[requested,processing,completed,failed], requested_at, completed_at, error)`

### phase 2 (schema reserved, not built)
- `purchases`, cross-business offers (behind `offers.cross_business_enabled`).

---

## 5. Authorization model

**Permission-based, not role-string-based.** Every privileged RPC starts with:

```sql
perform private.require_permission('card.approve', p_business_id);
```

`private.require_permission(perm, business_id)` checks **live** tables on every call:
1. `auth.uid()` is not null, and `profiles.account_status = 'active'`.
2. A `user_roles` row is active and has a role holding `perm`, scoped to that business or to all businesses.
3. If the user is staff: `staff.is_active` is true and `staff.business_id` matches. This makes a **disabled executive with an old JWT fail immediately**.

Seeded permissions (examples): `card.view`, `card.approve`, `card.block`, `card.reissue`, `card.batch.create`, `claim.preview`, `claim.redeem`, `offer.manage`, `business.manage`, `staff.manage`, `customer.view`, `customer.manage`, `customer.recover` (issue in-store recovery code), `customer.recover_remote` (owner only; restricted remote fallback), `customer.identity_check` (record an in-store identity check), `customer.release_phone.request` (executive: request a phone-number release), `customer.release_phone.approve` (owner: approve or reject it), `report.view`, `audit.view`, `settings.manage`.

Seeded roles: `customer`, `executive` (business-scoped), `owner` (all businesses). **No manager role in Phase 1 (decided).** It can be added later as data only.

**RLS patterns** (read side):
- Customer: `profiles`, `cards` and `redemptions` where `customer_id = auth.uid()`. Offers are readable when `status='active'` and inside their dates.
- Staff: rows whose `business_id` the user holds `*.view` permission on, through `private.can(perm, business_id)` (marked `STABLE` so it is cached per statement).
- No INSERT/UPDATE/DELETE policies on any table. Writes happen only through `api.*`.

**Custom Access Token Hook** (available on Free/Pro): adds `app_roles` to the JWT **for UI routing only**. It is never used for authorization.

---

## 6. Operations catalogue (API surface)

Every RPC: `SECURITY DEFINER`, `SET search_path = ''`, validates input, calls `require_permission`, raises catalogued error codes, writes audit, returns a typed composite/JSON.

| Operation | Type | Key checks / behaviour |
|---|---|---|
| register | `auth-register` Edge Fn (Admin `createUser`, `phone_confirm: true`); public signup disabled (§7.1) | Rate limit, phone uniqueness, trigger creates profile + `customer` role, audit. No OTP |
| `auth-sign-in` | Edge Fn | Rate limit → lockout check on `ops.login_attempts` → Supabase Auth `signInWithPassword` (Supabase stays the password authority) → record success/failure → return the session (§7.2). Best-effort: direct calls to Supabase Auth bypass it |
| change password | Supabase Auth `updateUser({password})` from the signed-in app | Supabase's own checks; no custom code |
| `api.issue_recovery_code(customer_id, channel, reason?)` | RPC (staff/owner) | `in_store` needs `customer.recover` + in-store identity check; `owner_remote` needs `customer.recover_remote`, a reason, shorter TTL and a daily cap (§7.3) → revoke previous open code → random code, store hash only → shown once → audit |
| `auth-recover` | Edge Fn | Rate limit → phone + code + new password → code valid, `open`, not expired, attempts left (constant-time compare; failed attempts counted) → Auth Admin `updateUserById(password)` → mark code `used` → revoke all sessions (method verified in M2, §17.1) → audit |
| `api.record_identity_check(customer_id, evidence[], result, note?)` | RPC (staff) | `customer.identity_check` for the acting business; executive = `auth.uid()` (never client-supplied); inserts `identity_checks`; on `passed` updates `profiles.identity_checked_at`; also called inside `approve_card` → audit |
| `api.request_phone_release(phone_e164, reason)` | RPC (staff) | `customer.release_phone.request`; only when the current holder has no passed identity check and no active card; creates a `pending` request → audit |
| `api.decide_phone_release(request_id, approve, note?)` | RPC (owner) | `customer.release_phone.approve`; decider ≠ requester; re-checks the holder conditions under `FOR UPDATE`; on approve, the holder account is disabled and its phone freed (holder account then follows the deletion path) → audit |
| `api.link_card(qr_payload)` | RPC | Parse and version-check the payload → hash the token → card `unassigned` → customer has no pending/active card → in one transaction, set card `pending`, add assignment, set profile `membership_status='pending'`, write audit |
| `api.scan_card(qr_payload, business_id)` | RPC (staff) | Returns status, masked customer info (name, last 4 phone digits) and pending request; `card.view` for the acting business (executive permissions are business-scoped) |
| `api.approve_card(card_id, business_id, evidence[], note?)` / `api.reject_card(card_id, business_id, reason)` | RPC | `card.approve` for the acting business; `SELECT … FOR UPDATE` on card + assignment; approve requires a `passed` identity check recorded in the same call (evidence + result, §7.4), then sets card `active` and profile `active`; reject releases the card back to `unassigned` and sets profile `rejected`; audit |
| `api.list_eligible_offers()` | RPC | Runs the eligibility engine for the caller |
| `api.create_claim_token(offer_id)` | RPC | Eligibility engine → revoke the previous open token → 32-byte random secret (`gen_random_bytes`) → store `sha256` → `expires_at = now() + get_setting('claims.ttl_seconds')` → return the QR payload **once** |
| `api.preview_claim(qr_payload)` | RPC (staff) | Returns a safe preview plus flags: `EXPIRED`, `USED`, `WRONG_BUSINESS`, `NOT_ELIGIBLE`. Does not consume the token |
| `api.redeem_claim(qr_payload, idempotency_key, bill_number?, bill_amount?)` | RPC (staff) | See §8: atomic, locked and idempotent |
| `api.block_card` / `api.reissue_card` | RPC | Owner permissions; reissue revokes the old assignment and links the new card (approval required or not, per setting) |
| `api.upsert_offer(offer jsonb)`, `api.set_offer_status(offer_id, status)` | RPC | `offer.manage` scoped to the offer's business. Upsert takes the full offer plus optional `schedules[]` / `group_ids[]` (omitted = unchanged); new offers are `draft`; `archived` is final |
| `api.update_business` | RPC | `business.manage` |
| `api.set_setting(key, value, business_id?)` | RPC | `settings.manage`; validates against `value_schema` |
| `staff-admin` (create / reassign / enable / disable / reset credential) | Edge Fn | Owner only; Auth Admin API (`createUser`, `updateUserById`). Reset sets a temporary password and `staff.must_change_password=true` (app forces a change on next sign-in). Disable sets `staff.is_active=false`, applies an Auth ban (`updateUserById` + `ban_duration`) and revokes sessions; then calls the staff RPC for DB changes and audit |
| `api.request_account_deletion()` + `account-deletion` | RPC + Edge Fn | Marks the request, anonymises the profile, retires the card per policy, keeps anonymised redemptions; the job deletes the auth user after the configured retention |
| `card-batches` (create / export) | Edge Fn | Owner; generates N tokens and stores only hashes; returns the **one-time** CSV (card_number, qr_payload) for the Python tool; export count is audited |
| `api.report_*` / `reports-export` | RPC + Edge Fn | Totals, redemptions by day/month/business/offer/executive, signups by month, birthdays; CSV streaming |
| `api.list_audit_logs(filters)` | RPC | `audit.view` |

### 6.1 Eligibility engine: one function, used everywhere

`private.evaluate_offer(customer_id, offer_id, at timestamptz) → (eligible bool, reason_code text)` checks, in order: account active → membership active → card active → offer active and inside its dates → schedule (weekday and time window in the business timezone from settings) → group membership → birthday window → per-customer limit → total limit.
The offer feed, claim creation and redemption all call the same function, so the rules cannot diverge.

### 6.2 QR payload format (versioned, no PII)

- Card: `{qr.prefix}.{qr.kind.card}.{qr.version.card}.{base64url(token)}` → e.g. `GR.C.1.<token>`
- Claim: `{qr.prefix}.{qr.kind.claim}.{qr.version.claim}.{claim_id}.{base64url(secret)}` → e.g. `GR.Q.1.<id>.<secret>`

`private.parse_qr(payload, kind)` accepts any prefix in `qr.accepted_prefixes` and dispatches on version, so the format or the prefix can change without breaking printed cards. The database stores only `sha256(secret)`.

---

## 7. Authentication details

Constraints (decided): **phone + password, no SMS anywhere** (no registration OTP, no SMS recovery, no SMS provider, no DLT), **Supabase Free plan** (Password Verification Hook is Team/Enterprise only; the **Send SMS Hook is available on Free** and is used only to refuse SMS, see below), **Supabase Auth stays the password authority** (no custom password-hash layer).

> M0 findings for signup are recorded in `docs/m0-findings.md` (21 Nov 2026). Signup path decided (§16.1 #8).

### 7.1 Signup and sign-in
- Passwords are stored and checked only by Supabase Auth. We never store or derive passwords.
- **Signup path (decided after M0, verified on a Free project):**
  - Supabase **Phone provider on**, **Confirm phone off**, **no SMS provider credentials**.
  - **Send SMS Hook** = Postgres function `private.auth_send_sms_hook(event jsonb)` (module `10_identity`) that **always returns an error** (`http_code` 403) and sends nothing. Execute granted only to `supabase_auth_admin`. Any OTP request therefore fails; nothing pretends to send.
  - **"Allow new users to sign up" off** (`[auth] enable_signup = false`). Blocks client `signUp` and stops `/otp` from creating placeholder accounts for unknown numbers (both seen in M0 with signups on).
  - Customers are created only by the **`auth-register` Edge Function** via Auth Admin `createUser({ phone, password, phone_confirm: true })`, after rate limit and validation.
  - These are project settings: they must be set in each environment (dashboard / `config.toml`) and checked by a smoke test in CI. The `config.toml` key for the Send SMS hook is not in the CLI 3.2.0 template; confirm it in M1 before relying on it.
- Hidden-email identity (former option 3) is **not needed**; no domain is bought.
- If Supabase needs a "confirmed" flag on the phone for login, that flag only switches login on. **It is not treated as proof of phone ownership** anywhere in our data or UI (§7.4).
- Sign-in: apps call `auth-sign-in`, which calls Supabase `signInWithPassword` and returns the normal Supabase session. Sessions, refresh, RLS and Realtime are standard supabase-js.

### 7.2 Failed-login lockout (decided: accepted limitation for the initial launch)
The lockout is a **usability and abuse-reduction measure, not a guaranteed security boundary**. Docs, UI copy and client material must not describe it as guaranteed. Protection is layered: Supabase Auth's built-in protections + our application-level rate limiting + the best-effort lockout below.
- `auth-sign-in`: rate limit (per IP and per phone) → if `ops.login_attempts.locked_until > now()` reply `ACCOUNT_LOCKED` with the unlock time and **do not call Supabase** → otherwise call `signInWithPassword` → on failure increment `failures` (window restarts after `window_seconds`); at `max_failures` set `locked_until = now() + lock_seconds` → on success clear the row.
- Thresholds from settings: **5 failures in 900 s → locked 900 s** (decided).
- Unknown phone numbers get the same response and similar timing as wrong passwords.
- Second layer: Supabase Auth's built-in per-IP rate limits. `/token` is documented at 1800/hour per IP, burst 30, not customisable; behind `auth-sign-in` all users share one IP unless forwarding works (§17.1).

> **Known limitation (documented, not solved):** the exact 5-failure lockout **cannot be guaranteed**. Supabase Auth's `/token` endpoint is public, so a client that calls it directly with the anon key skips `auth-sign-in` and our counter. Against that path only Supabase's per-IP limits apply, and we found no documented per-account lockout in Supabase Auth on the Free plan. Our own apps always use `auth-sign-in`, so normal users see the agreed lockout. Accepted for the initial launch (conditional, §16.1). If strict enforcement becomes mandatory, choose from the alternatives in §17.1 **before** anything is built.

### 7.3 Account recovery without SMS (decided: staff-issued one-time codes)
- **In store (primary):** an executive with `customer.recover` checks the customer's identity in person, then calls `api.issue_recovery_code(customer_id, 'in_store')`.
- **Owner remote (restricted fallback):** only `customer.recover_remote` (owner role only). Requires a written reason, uses a shorter TTL (`auth.recovery.remote_code_ttl_seconds`), a per-owner daily cap (`auth.recovery.remote_daily_limit_per_owner`), and is flagged in the audit log.
- Both channels: random code from `gen_random_bytes`; **only its hash is stored**; shown once on the issuer's screen; issuing revokes any older open code; issuing is rate-limited.
- Redemption (`auth-recover`): rate limited per IP and per phone → code must be `open`, unexpired, with attempts left (constant-time compare; each failure counted; at the limit the code is `revoked`) → Auth Admin `updateUserById` sets the new password → code marked `used` (**single use**) → **all sessions revoked** → audit.
- How to revoke all of a user's sessions from the server is **not yet verified** (candidate: Auth Admin sign-out; fallback: deleting the user's rows in `auth.sessions` / refresh tokens). Confirmed in M2 before recovery ships (§17.1).
- Staff passwords are reset by an owner through `staff-admin` (temporary password + `must_change_password`).

### 7.4 Identity check vs phone ownership (decided)
Without OTP we **cannot verify that a person owns a phone number**, and the system never claims to.
- **Phase 1 process (decided):** verification happens in person at the store. The executive checks the registration details (name, phone, date of birth if given) against the person in front of them, plus any available proof of purchase or account information.
- **What is recorded:** one `identity_checks` row: evidence kinds seen, result (`passed`/`failed`), the responsible executive (taken from the session, never the client), business and time. `profiles.identity_checked_at` mirrors the latest pass. Labelled "identity checked by staff" in every UI and report, never "phone verified".
- **Data minimisation:** no photos, scans, ID numbers or copies of receipts are stored; the optional note is short and must not contain ID numbers.
- No field named or meaning "phone verified" exists in Phase 1. If OTP is ever added, a separate `phone_ownership_verified_at` column is added then.
- Offers, claims and redemptions need an active card, which needs the in-store check, so an unchecked account can do nothing of value.
- **Phone release / reassignment (two-step, decided):** if someone registered a number that is not theirs, the real holder goes to a store. An executive records a request (`api.request_phone_release`, reason required); a **separate approval** by an owner (`api.decide_phone_release`, approver ≠ requester) frees the number. Only allowed when the current holder has no passed identity check and no active card. Both steps are recorded and audited.
- Accounts with no passed identity check are deleted **30 days after registration** (provisional default, §17.5; job in §9).

### 7.5 Staff
- Created only by owners through `staff-admin`. No self-signup path into a staff role (signup assigns `customer` only).
- Disable: `staff.is_active=false` (blocks every RPC at once) **plus** an Auth ban **plus** session revocation.

### 7.6 Abuse protection
- Postgres token-bucket rate limits on register, sign-in, recovery issue/redeem, `create_claim_token` and `link_card`. Limits come from settings.
- Optional CAPTCHA (Turnstile or hCaptcha) on registration behind a `FEATURE_*` flag; optional Play Integrity check, also behind a flag.

---

## 8. Redemption: the critical transaction

```text
api.redeem_claim(payload, idempotency_key, bill_number, bill_amount):
  0. if a redemption with this idempotency_key exists → return it (same result, no side effects)
  1. parse payload → claim_id, secret
  2. SELECT … FROM claim_tokens WHERE id = claim_id FOR UPDATE          -- lock order: token → offer → usage
  3. constant-time compare sha256(secret) with secret_hash; on mismatch → INVALID_CLAIM
  4. status must be 'open' (used → ALREADY_REDEEMED, revoked → CLAIM_REVOKED)
  5. expires_at > now(), else mark expired → CLAIM_EXPIRED
  6. require_permission('claim.redeem', token.business_id)               -- wrong business → WRONG_BUSINESS
  7. bill_number/bill_amount required? (get_setting per business)
  8. SELECT offer FOR UPDATE (only when total_usage_limit is set)
  9. private.evaluate_offer(customer, offer, now())                      -- re-check at redeem time
 10. INSERT offer_usage … ON CONFLICT DO UPDATE SET used_count = used_count + 1
        WHERE used_count < max_uses_per_customer  → 0 rows = LIMIT_REACHED
 11. UPDATE offers SET total_redeemed = total_redeemed + 1 (guarded by limit)
 12. INSERT redemptions (claim_token_id UNIQUE, idempotency_key UNIQUE)
 13. UPDATE claim_tokens SET status='used', used_at=now()
 14. audit.write('claim.redeem', …)
 COMMIT
```
- A second concurrent request blocks on step 2, then fails at step 4. The `UNIQUE(claim_token_id)` constraint is a final backstop.
- A screenshot of a used QR fails at step 4. An old QR after a newer one was issued fails at step 4, because the old token is revoked.
- Realtime pushes the `claim_tokens` status change, so the customer screen shows "Redeemed" only after the server commits.

---

## 9. Scheduled jobs (pg_cron; schedules come from `jobs.*.cron` settings)

| Job | Action |
|---|---|
| `expire_claims` | `open` tokens past `expires_at` → `expired` |
| `purge_claim_tokens` | Delete expired/used tokens older than the retention setting (redemptions keep the reference) |
| `purge_login_attempts` | Rows older than `retention.login_attempts_days` (30) |
| `purge_rate_limit_buckets` | Counters not updated for `retention.rate_limit_counters_days` (30) |
| `expire_recovery_codes` | `open` codes past `expires_at` → `expired`. Codes are already invalidated at use (`used`) or replacement (`revoked`) by the RPCs themselves; this job deletes codes `retention.recovery_codes_days` (30) after expiry or use. Audit rows remain |
| `purge_unchecked_accounts` | Accounts with no passed identity check, registered more than `retention.unchecked_accounts_days` (30) ago → deleted through `jobs-runner` (frees the phone number) → audit |
| `process_deletions` | `pg_net` → `jobs-runner` Edge Function (secret header) → Auth Admin delete after `retention.deleted_account_days` |
| `audit_retention` | Delete (or export then delete) audit rows older than `retention.audit_logs_days` |

Nightly database backups are **not** a pg_cron job: they run from `.github/workflows/` (§14). Dump expiry (`BACKUP_RETENTION_DAYS`, 30) is enforced by the backup workflow and/or a lifecycle rule on the external bucket, not by the database.

`private.register_jobs()` reads the settings and (re)creates the cron entries, so a schedule change is a settings update.

---

## 10. Storage and Realtime

- Buckets: `business-assets` (logos) and `offer-banners`. Bucket names come from settings or env. Public read; write only with `business.manage` or `offer.manage` for that business (storage RLS on `storage.objects` using a path prefix of `business_id/`). File size and MIME limits are set on the bucket.
- Realtime: publication contains `card_assignments`, `claim_tokens` and `redemptions`. Customers receive only their own rows through RLS; staff receive their business's rows (for the "Today" screen).

---

## 11. Audit

`audit.write(action, entity_type, entity_id, before, after, business_id)` is called inside every privileged RPC and Edge Function. Actor, role and request ID are captured from `auth.uid()` and the request headers. Generic row triggers also cover `offers`, `businesses`, `staff`, `user_roles` and `app_settings` so that no change is missed.

---

## 12. Contract with the frontends

Each layer has one job, so nothing is defined twice:

| Location | Owns | Written by |
|---|---|---|
| `backend/contracts/` | `database.types.ts`, `errors.ts` | **Generated** by the backend `codegen` script (`supabase gen types` + the `error_codes` table). Never hand-edited |
| `packages/shared/` | Zod schemas for every RPC/Edge Function request and response, constants and shared types (re-exports `backend/contracts`) | Hand-written |
| `packages/api/` | Typed client: one function per operation in §6 (wraps `supabase.rpc` / `supabase.functions.invoke`), validates with `packages/shared`, maps errors to codes | Hand-written |
| `packages/ui/` | UI components | Frontend work, outside this plan |

- Frontends import `packages/api` and never call `supabase.rpc('…')` directly. A change to the backend contract shows up as a type error in every app.
- Every operation returns `{ data } | { error: { code } }`, and the apps translate the code.
- CI fails if `backend/contracts` is out of date with the database (codegen drift check).
- Edge Functions (Deno) keep their own `functions/_shared/`. Whether they can import Zod schemas from `packages/shared` is **unverified**; it gets checked in the M0 spike. Until then, request schemas used by Edge Functions live in `_shared/` too.
- `packages/*` are shared through **pnpm workspaces** (decided). See §17.4 for the Expo setting to verify.

---

## 13. Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| Database | **pgTAP** (`supabase test db`) in `database/tests` | Constraints, every RLS policy (customer A cannot read customer B; executive cannot see another business), every RPC's happy path and each error code, eligibility engine table tests |
| Concurrency | Deno script in `backend/tests/concurrency` | N parallel redeems of one claim → exactly 1 succeeds; limits hold under parallel load; parallel `link_card` on one card |
| Edge Functions | `deno test` with a local Supabase instance | Sign-in lockout via `auth-sign-in` (5th failure locks, unlock after 900 s, unknown phone indistinguishable); recovery code (hash only stored, expiry, attempt limit, single use, sessions revoked, audit rows written, remote channel restricted to owners with daily cap); staff-admin permissions; rate limits |
| Known-limitation check | Deno script | Records (does not hide) that direct Supabase Auth sign-in skips our lockout counter, and measures which Supabase per-IP limit applies instead (§7.2) |
| Security regression | pgTAP + scripts | Disabled executive with a still-valid JWT is rejected; expired/used/screenshot QR rejected; no field or label claims "phone verified"; service-role key absent from frontend bundles (grep in CI) |
| Acceptance | Checklist mapped 1:1 to PDF §12 | Each PDF acceptance criterion has a named test |

---

## 14. Environments and delivery pipeline

- **local**: `supabase start` (Docker) + `database/seed/dev`.
- **staging** (dev) and **production**: separate Supabase projects (Mumbai `ap-south-1` if available), **owned by the client's organisation**. On the Free plan these two use up the active-project limit (§17.2).
- CI (GitHub Actions in `.github/workflows/`, approved): lint SQL → `supabase db diff` must be clean → pgTAP → Deno tests → codegen drift check → on main: `supabase db push` + `functions deploy` to staging; manual approval for production.
- Secrets: `supabase secrets set` per environment, sourced from the CI secret store. Never committed.
- Backups (decided): **nightly independent backups** from a scheduled GitHub Actions workflow running `supabase db dump` (roles, schema, data), encrypted with `BACKUP_ENCRYPTION_KEY` before upload, stored in **client-owned external cloud storage, separate from Supabase**. Dumps kept 30 days (provisional). Write-only credentials for the workflow; the encryption key is held by the client outside that storage.
- **Restore testing (decided: periodic):** a separate workflow restores the latest dump into a throwaway local Postgres/Supabase instance and runs a smoke check (row counts, pgTAP subset). Proposed cadence: monthly, plus after any schema-heavy release; each result logged in `docs/`. Cadence still to confirm (§16.2).
- Limitations in §17.2.

---

## 15. Backend milestones (aligned to PDF §11)

| # | Deliverable | Exit criteria |
|---|---|---|
| 0 | **Spikes (approved)**: (a) phone + password signup with no SMS provider, in the order of §7.1; (b) Supabase per-IP auth rate limits when every sign-in comes through an Edge Function; (c) Expo + pnpm workspaces resolution (§17.4). Also: folder wiring (§1, `schema_paths`) | Findings written to `docs/` and summarised in §17; **auth design (§7) confirmed or revised with you before M2** |
| 1 | Foundation: core module (settings, error catalog, authz helpers, audit), envs, CI, nightly backup workflow, codegen | pgTAP and CI green; one backup restored in a drill |
| 2 | Identity and auth (only after M0 sign-off): roles/permissions seed, signup path chosen in M0, `auth-sign-in` + lockout, recovery codes + `auth-recover`, identity checks, two-step phone release, staff-admin | Auth tests pass; session-revocation method verified; disabled staff blocked |
| 3 | Cards: batches, hashing, export for the Python tool, `link_card` | Double-link test passes |
| 4 | Approval: scan, approve, reject, Realtime | Atomic status tests pass |
| 5–6 | Offers: CRUD, schedules, groups, eligibility engine, storage | Eligibility table tests pass |
| 7 | Claims and redemption: create, preview, redeem, idempotency, jobs | Concurrency suite passes |
| 8 | Reporting, CSV export, audit viewer RPCs | Owner reports verified |
| 9–10 | Security hardening, load/slow-network tests, production cut-over, runbooks | All PDF §12 criteria green |

---

## 16. Decisions

### 16.1 Decided (18 Nov 2026)
| # | Topic | Decision |
|---|---|---|
| 1 | Supabase plan | **Free** for now. No Team/Enterprise features |
| 2 | SMS | **None.** No OTP at registration, no SMS recovery, no SMS provider, no DLT |
| 3 | Folder structure | §1, plus `.github/workflows/` for CI |
| 4 | Package manager | **pnpm workspaces** |
| 5 | Shared code | `backend/contracts` generated only; `packages/shared` hand-written schemas/types/constants; `packages/api` hand-written typed client |
| 6 | Password authority | **Supabase Auth.** No custom password-hash layer |
| 7 | Lockout | 5 failures in 15 min → 15 min lock, via `auth-sign-in`. **Gap accepted conditionally for the initial launch**: Supabase built-in protections + app rate limiting; documented as *not* guaranteed against direct Supabase Auth requests and never described as a security boundary (§7.2, §17.1) |
| 8 | Signup path | **Decided 21 Nov after M0:** phone + password; Phone provider on, confirm off, no SMS credentials; refusing Send SMS Hook; public signups off; customers created only via `auth-register` (Admin `createUser`) (§7.1) |
| 9 | Recovery | Staff-issued one-time codes (hashed, expiring, single use, invalidated on use or replacement, rate-limited, audited, sessions revoked). Owner remote issue is a restricted fallback |
| 10 | Identity check | In person at the store: registration details + available proof of purchase or account info. Record result + responsible executive; minimise stored personal data. **Identity check ≠ phone ownership** (§7.4) |
| 11 | Phone reassignment | Requires a separate recorded approval (executive requests, owner approves, different people) |
| 12 | Retention | Provisional technical defaults in §17.5, pending legal review (DPDP Act) |
| 13 | M0 | Approved: no-SMS signup test, Supabase IP limits through Edge Functions, Expo + pnpm |
| 14 | Backups | Encrypted nightly dumps in client-owned external cloud storage, separate from Supabase; periodic restore tests |
| 15 | QR | `GR.C.1.…` cards, `GR.Q.1.…` claims; older formats still accepted. **`GR` prefix kept** with the name Rewards-app (cards `GR-000001`) |
| 16 | Manager role | Not in Phase 1 |
| 17 | Bill number / amount | Optional by default, configurable per business |
| 18 | App name | **Rewards-app** |
| 19 | Hidden-email domain | **Not needed** (M0) |
| 20 | Auth build timing | Auth architecture not implemented until M0 findings are available |
| 21 | Build order | Plan order kept: M1 foundation first; `packages/api` functions written as each module lands (21 Nov) |
| 22 | Testing | No local Docker; DB and Edge Function tests run in GitHub Actions (21 Nov) |

### 16.2 Still open
1. **Backup storage provider** (which client-owned cloud account/bucket) and **restore-test cadence** (proposed monthly).
2. **Legal review** of the provisional retention defaults by the client (DPDP Act 2023).
3. **Shared sign-in IP limit fix** (§17.1): `Sb-Forwarded-For` retest with "IP Address Forwarding" on.
4. **GitHub repository** for CI (this folder is not yet a git repo).

---

## 17. Implications and unresolved technical limitations

### 17.1 Authentication (Supabase Auth as password authority)
**Unresolved limitation — lockout bypass.** Supabase Auth's sign-in endpoint is public. Anyone calling it directly with the anon key skips `auth-sign-in`, so the 5-failure lockout applies only to traffic through our function. Direct callers face only Supabase's per-IP limits. **Accepted conditionally for the initial launch** (option A below). It is a limitation, not a solved problem, and must never be presented as a guaranteed security boundary. Revisit if the client requires strict enforcement or if monitoring shows abuse.

Alternatives if strict enforcement becomes mandatory (none will be built without your approval):

| Option | What it is | Cost / risk |
|---|---|---|
| A. Accept + monitor | **Chosen for initial launch.** Tighten Supabase per-IP limits; alert on unusual failure rates in Supabase Auth logs | No per-account guarantee |
| B. Paid plan hook | Team/Enterprise **Password Verification Hook** lets Postgres reject attempts while locked | Paid plan; conflicts with the Free-plan decision |
| C. Custom credential layer | Our own password hash; Supabase only sees a server-derived secret (previous proposal, rejected for now) | We own password security, key rotation and more code |
| D. Self-hosted Supabase Auth | Run our own Auth server where hook availability and limits are ours to configure | Hosting and ops burden; hook support when self-hosting **not verified** |

**Resolved in M0 — signup without SMS** (§7.1). Remaining risk: it depends on three project settings (Phone on, Send SMS Hook refusing, signups off). If someone turns public signups back on, anyone can self-register or reserve any phone number via `/otp`. A CI smoke test checks `/auth/v1/settings` (`disable_signup: true`) per environment.

**Resolved (M2) — server-side session revocation.** supabase-js Admin `signOut` takes a user JWT, not a user id, so recovery and staff disable delete the user's `auth.sessions` rows (`private.revoke_user_sessions`). CI verifies that afterwards the old refresh token is refused (400) and `/auth/v1/user` rejects the old access token (403). PostgREST RPCs also refuse dead sessions via `private.session_is_live`. Limitation: other services that only check the JWT signature would accept the old access token until it expires. Local stack only, not verified on hosted.

**Confirmed problem — Supabase per-IP limits behind one Edge Function IP** (M0 test b): every sign-in through `auth-sign-in` reaches Supabase from one Edge Function IP and shares one bucket (burst ~30, then `429`; documented 1800/hour). Busy periods would throttle real users. Documented fix: send `Sb-Forwarded-For: <caller IP>` with the **secret** API key and switch on "IP Address Forwarding". Ignored with the switch off (verified); with it on: **not yet tested**. Not adopted until tested and agreed with you.

### 17.2 Free plan (verify current numbers on supabase.com/pricing before launch)
Figures come from 2026 third-party summaries, not from Supabase directly:
- **Project pausing:** Free projects are paused after about a week without activity. Production with real traffic should stay active; staging may pause and must be restored manually from the dashboard. Paused projects serve no requests.
- **Backups:** no usable managed backups / PITR on Free. Our encrypted nightly dump in client-owned external storage is the only backup. Limitations: up to ~24 h of data loss; no point-in-time restore; Auth data inside the dump must be restore-tested; Storage files (logos, banners) are not in a DB dump and need their own copy (to plan in M1); a backup is only trusted once a periodic restore test has passed.
- **2 active projects** per organisation: staging + production use both. Local development runs in Docker.
- **Quotas** (approx.): 500 MB database, 500k Edge Function invocations/month. Every sign-in and recovery goes through an Edge Function. Claim tokens and audit logs drive DB size, hence the retention jobs.
- Still available on Free and used: RLS, RPCs, Edge Functions, pg_cron, pg_net, Realtime, Storage, Custom Access Token Hook (UI routing only).

### 17.3 Identity vs phone ownership
- The system can only say "staff checked this person's identity". It can never say "this person owns this phone number". UI copy, reports and exports must use that wording.
- The in-store check is only as strong as the evidence available (registration details, proof of purchase, account info). It reduces, but does not eliminate, the risk of someone claiming another person's account.
- Phone reassignment needs two different people (executive + owner), which limits single-insider abuse but adds an owner step for every release.
- Supabase may internally mark the phone as "confirmed" so login works; that flag is ignored for any trust decision.

- **Phone release frees the Auth phone (M2):** on approve, `private.release_auth_phone` clears `auth.users.phone`, removes the phone identity, bans the old user (100 years) and revokes its sessions in the same transaction. This writes `auth.*` tables directly (not the Admin API), which Supabase does not document as supported; `backend/tests/auth_phone_release.sh` checks it against GoTrue in CI and must keep passing on CLI/Auth upgrades.
- **M2 (open): release does not check active cards** yet; added with the cards module (M3).

### 17.8 M2 auth limitations (as built)
- Lockout and rate limits run in `auth-sign-in`; direct calls to Supabase Auth `/token` with the anon key bypass them (only Auth's built-in IP limits apply).
- Client IP comes from the first `X-Forwarded-For` entry; whether the Edge runtime passes the real client IP is unverified (Sb-Forwarded-For retest deferred). Until verified, per-IP limits may group users.
- `ratelimit.*` settings (`register`, `sign_in_ip`, `sign_in_phone`, `recover_ip`, `recover_phone`, `recovery_issue`) are seeded with defaults approved 2026-11-21. If the client IP is not forwarded, all users share one IP and `sign_in_ip` (60/10 min) caps the whole app; revisit after the Sb-Forwarded-For retest.
- Disabled staff are banned with a long `ban_duration` (Auth has no permanent flag) plus `staff.is_active = false` and session revocation.
- In `auth-recover` the code is spent before the password update; if the update fails, staff must issue a new code.
- Edge Functions are type-checked and HTTP-tested in CI (backend/tests/edge_functions.sh: register, sign-in + lockout, recover, staff-admin) against the local stack. Local stack only: hosted function behaviour is not tested.
- Local stack (CLI v3.2.0) disables phone login unless an `[auth.sms.<provider>]` block is enabled; the send_sms hook does not count. So local phone + password sign-in is off and the GoTrue e2e sign-in checks fail. Hosted is unaffected (M0). CI enables a Twilio block with fake values in the runner copy only (approved 2026-11-21); the send_sms hook still refuses all SMS. The tracked config.toml keeps Twilio off, so local dev outside CI has no phone login.

### 17.4 pnpm workspaces
- Adds `pnpm-workspace.yaml`, root `package.json` (scripts only) and `.npmrc` (§1).
- M0 (c): Expo SDK 58 bundles a `packages/*` workspace dependency with pnpm's default isolated linker; `node-linker=hoisted` **not** needed for JS bundling. Native/EAS build not yet tested (M1).
- Corepack is not bundled with Node 26: pin pnpm in `packageManager` and run it via `npx pnpm@<version>` or a global npm install.
- Edge Functions (Deno) are unaffected. Whether they can import from `packages/shared` is still unverified.

### 17.5 Retention
**Every value below is a provisional technical default chosen by the project, not a legal requirement.** No legal retention requirement has been identified or confirmed yet. The client must review them under India's DPDP Act 2023 and any accounting/tax obligations; any legal requirement found then overrides the default and is recorded here in its own column.

| Setting | Provisional default | Counted from | Legal requirement |
|---|---|---|---|
| `retention.claim_tokens_days` | 90 | expiry or use | Not yet reviewed |
| `retention.login_attempts_days` | 30 | last attempt | Not yet reviewed |
| `retention.deleted_account_days` | 30 | deletion request (profile anonymised immediately) | Not yet reviewed |
| `retention.audit_logs_days` | 730 (2 years) | event time | Not yet reviewed |
| `retention.unchecked_accounts_days` | 30 | registration (no passed identity check) | Not yet reviewed |
| `retention.recovery_codes_days` | 30 | expiry or use (codes invalidated immediately on use or replacement) | Not yet reviewed |
| `retention.rate_limit_counters_days` | 30 | last update | Not yet reviewed |
| `BACKUP_RETENTION_DAYS` (backup dumps) | 30 | dump date | Not yet reviewed |

Database values live in `app_settings`, so changing them needs no code change. Note: a deleted account's data can still exist inside backup dumps for up to 30 days after deletion; the legal review should cover this.

### 17.6 QR and cards
- Approved: `GR.C.1.…` (card) and `GR.Q.1.…` (claim). `qr.accepted_prefixes` and version dispatch keep older formats readable.
- `GR-000001` with 6 digits caps at 999,999 cards; the digit count is a setting.
- App name is **Rewards-app**; the **`GR` prefix is kept** (decided). Nothing about the prefix blocks the first print run. Printed numbers and QR codes cannot change afterwards, so any later prefix change applies to new batches only, while `qr.accepted_prefixes` keeps old cards readable.

### 17.7 Unchanged
Redemption transaction (§8), eligibility engine (§6.1), cards, offers, storage, Realtime, audit, reporting and the folder layout are not affected.

---

## Sources consulted
- [Supabase — Password Verification Hook](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook)
- [Supabase — Auth Hooks (plan availability)](https://supabase.com/docs/guides/auth/auth-hooks.md)
- [Supabase — Testing auth flows](https://supabase.com/docs/guides/auth/testing-auth-flows)
- [Supabase — Self-hosted phone MFA](https://supabase.com/docs/guides/self-hosting/self-hosted-phone-mfa.md)
- [Supabase CLI reference (`--workdir`)](https://supabase.com/docs/reference/cli/usage)
- [Supabase config.toml sample (`[functions.*] entrypoint`)](https://glama.ai/mcp/servers/@supabase-community/mcp-supabase/blob/5f110e7a6adb6c5e1c4329767e81b348410b8ad3/supabase/config.toml)
- [Jet Admin — Supabase pricing 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [DEV — Supabase free tier limits in 2026](https://dev.to/mahdi_benrhouma_fe1c6005/supabase-free-tier-limits-in-2026-what-you-actually-get-and-when-you-will-hit-them-4mhe)
- [Expo — Monorepos guide](https://docs.expo.dev/guides/monorepos/)
- [Callstack — React Native monorepo with pnpm workspaces](https://callstack.com/blog/react-native-monorepo-with-pnpm-workspaces)
