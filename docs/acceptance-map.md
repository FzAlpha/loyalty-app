# Acceptance map: spec §12 → tests

Each acceptance criterion in `Group_Rewards_App_Updated_Technical_Plan.pdf` §12 maps to named tests that run in CI (`.github/workflows/ci.yml`).
A test is named as `file › description`.
pgTAP files are in `database/tests/`. Shell and Deno suites are in `backend/tests/`.

Status key:
- **Backend covered**: the server-side rule is enforced and tested.
- **Partial**: some part is not testable yet; the gap is stated.
- **Not covered**: planned for a later milestone.

The backend tests call the same RPCs and Edge Functions the apps use. The customer app (F1) and admin app (F2) now implement the UI for #1, #4, #5 and #7 (admin: scan card approve/reject, offer preview + confirm with an idempotency key, WRONG_BUSINESS/USED refusals, disabled/session-ended screens), but no criterion has yet been checked through an app on a phone against staging.

| # | Criterion (spec §12) | Tests | Status |
|---|---|---|---|
| 1 | A new customer registers, links an unassigned card and sees it become active after executive approval | `edge_functions.sh › customer registers`; `edge_functions.sh › customer links card over PostgREST`; `40_cards › customer links card`; `40_cards › membership becomes pending`; `40_cards › executive approves`; `40_cards › card and membership active`; `40_cards › card_assignments in Realtime publication` | Backend covered. Live status updates in the app are not tested (no app yet). |
| 2 | A card already linked to another customer cannot be linked again | `40_cards › card linked by someone else is not available`; `40_cards › second card for same customer refused` | Backend covered |
| 3 | A claim expires after 10 minutes; a fresh claim can be generated | `00_core › other business falls back to global` (default `claims.ttl_seconds` = 600); `60_claims › expiry from claims.ttl_seconds`; `60_claims › preview flags EXPIRED`; `60_claims › expired QR rejected`; `60_claims › expire_claims marks past-expiry tokens`; `60_claims › new token revokes the previous open one`; `99_jobs › schedule from jobs.expire_claims.cron` | Backend covered |
| 4 | A used claim QR or screenshot cannot be redeemed again | `60_claims › used QR (screenshot) rejected`; `60_claims › replaced (older) QR rejected`; `60_claims › preview flags USED`; `redeem_concurrency.ts › losers all get ALREADY_REDEEMED` | Backend covered |
| 5 | An executive cannot redeem an offer belonging to another business | `60_claims › executive of another business cannot redeem`; `60_claims › other business sees WRONG_BUSINESS`; `60_claims › other business gets no customer details` | Backend covered |
| 6 | Per-customer and total usage limits hold under simultaneous redemption attempts | `redeem_concurrency.ts › N parallel redeems of one claim -> exactly 1 success`; `redeem_concurrency.ts › one redemption row, total_redeemed = 1`; `redeem_concurrency.ts › M customers race for total limit L -> exactly L successes`; `redeem_concurrency.ts › losers get OFFER_LIMIT_REACHED`; `60_claims › one open token per customer and offer`; `60_claims › limit reached blocks new claims`; `60_claims › total never exceeds limit` | Backend covered. Per-customer: a customer holds only one open claim per offer, so their parallel attempts all race on one claim (scenario 1). There is no separate parallel test across several claims from one customer. |
| 7 | A disabled executive cannot continue privileged operations, including with an old session | `10_identity › disabled staff fails at once`; `10_identity › revoked session fails at once`; `85_security › disabled executive loses permissions`; `edge_functions.sh › disabled executive cannot sign in`; `edge_functions.sh › disable revokes executive session` | Backend covered |
| 8 | Repeated failed login attempts trigger the agreed temporary lockout | `edge_functions.sh › failure $max locks the phone` (limit read from `auth.lockout.max_failures`); `edge_functions.sh › right password while locked is refused` | Backend covered |
| 9 | A customer cannot access another customer's profile, card or redemption history | `10_identity › customer sees only own profile`; `40_cards › customer sees only own card`; `60_claims › customer sees only own tokens`; `60_claims › customer sees own redemptions`; `95_reporting` scope tests | Backend covered (RLS) |
| 10 | Account deletion is available in the app and follows the agreed retention policy | `90_accounts › customer requests deletion`; `90_accounts › profile anonymised at once`; `90_accounts › card blocked`; `90_accounts › auth removal waits retention.deleted_account_days`; `90_accounts › one unchecked old account purged`; `edge_functions.sh › customer requests account deletion`; `edge_functions.sh › jobs-runner processes due deletions`; `edge_functions.sh › auth user soft-deleted`; `99_jobs › one row past retention purged` | Partial. Backend and Edge Function are covered. The in-app button is not built yet. On hosted, the scheduled run needs Vault secrets (see BACKEND_PLAN.md §9); pg_cron → pg_net → jobs-runner is not exercised end to end in CI. |
| 11 | Core flows work on a low-end Android device and on a slow or intermittent connection | none | Not covered: M10 (needs the frontend apps) |

## Regression guards (not in §12)

`security_scan.sh` (CI job `security`) does two checks:
- It fails if `service_role` or `SUPABASE_SERVICE_ROLE_KEY` appears in `frontend/` or `packages/`. It also checks for the key value itself, but only when `SERVICE_ROLE_KEY` is set. The CI `security` job does not set it.
- It fails if any "phone verified" field or label appears anywhere in the frontend, packages, schema, seed or functions.

The frontend folders are still empty, so the scan has nothing to check there yet.
