# Backend Progress

Legend: `[x]` done · `[~]` in progress · `[ ]` todo · `[!]` blocked
Plan: BACKEND_PLAN.md (section numbers in brackets)

## Current status
- [x] PDF analysed
- [x] Backend plan written (BACKEND_PLAN.md)
- [x] Folder skeleton created (approved structure)
- [x] 18 Nov decisions (three rounds) applied; decisions §16, limitations §17
- [~] M0 spikes running on temp project rewards-app-m0-spike (findings: docs/m0-findings.md)
- [x] M0: admin createUser + phone_confirm works without SMS
- [x] M0: phone sign-in works (Phone on + refusing Send SMS hook, no Twilio)
- [x] Plan updated with M0 results (§1, §7, §16, §17)
- [x] M0: signups off blocks self-signup + OTP accounts; admin createUser + sign-in still work
- [x] M0: relayed sign-ins share one Edge Fn IP; throttled after ~30
- [!] M0: Sb-Forwarded-For fix — needs "IP Address Forwarding" toggle on (user)
- [x] M0: Expo SDK 58 + pnpm isolated linker bundles workspace package
- [ ] M0: Expo native/EAS build (no Android SDK here; M1)
- [x] M0: folder wiring — declarative_schema_path to database/schema verified in CI
- [ ] M0: delete spike project after tests

## Decisions
- 2026-11-18: Folder structure approved (plan §1); dashboard = frontend/dashboard
- 2026-11-18: Supabase Free plan for now; no Team/Enterprise features
- 2026-11-18: No SMS at all (no OTP, no SMS recovery, no provider, no DLT); phone + password kept
- 2026-11-18: Supabase Auth is password authority; no custom hash layer
- 2026-11-18: Lockout 5 fails / 15 min → 15 min via Edge Fn; gap accepted conditionally for launch, not a security boundary
- 2026-11-18: Signup path undecided until M0; preferred phone + password, no confirmation; hidden email only after review
- 2026-11-18: Recovery = staff one-time codes; owner remote = restricted fallback
- 2026-11-18: Identity check in store (registration details + proof of purchase/account info); record result + executive; minimal data
- 2026-11-18: Phone reassignment needs separate recorded approval (executive requests, owner approves)
- 2026-11-18: Retention (provisional, not legal): claims 90d, login attempts 30d, deleted accts 30d, audit 2y
- 2026-11-18: Retention (provisional, not legal): unchecked accts 30d, recovery codes 30d, rate counters 30d, backups 30d
- 2026-11-18: M0 tests approved: no-SMS signup, IP limits via Edge Fn, Expo+pnpm
- 2026-11-18: Encrypted nightly backups to client-owned external storage; periodic restore tests
- 2026-11-18: QR GR.C.1 / GR.Q.1; old formats still accepted; card no. GR-000001
- 2026-11-18: .github/workflows/ approved for CI
- 2026-11-18: pnpm workspaces; contracts generated, packages/shared + api hand-written
- 2026-11-18: No manager role in Phase 1; bill fields optional per business
- 2026-11-18: App name = Rewards-app
- 2026-11-18: Keep GR prefix with Rewards-app
- 2026-11-18: No hidden-email domain unless M0 needs it
- 2026-11-18: Auth architecture not implemented until M0 findings available
- 2026-11-18: M0 on temporary hosted Free project; tools via npm/npx (Corepack missing on Node 26)
- 2026-11-21: Keep plan order: M1 foundation first; packages/api per module as it lands
- 2026-11-21: No Docker locally; DB/backend tests run in GitHub Actions
- 2026-11-21: Signup = Phone on, confirm off, refusing Send SMS hook, signups off, auth-register only
- 2026-11-21: Hidden-email identity not needed
- 2026-11-21: Repo github.com/FzAlpha/loyalty-app; spec PDF kept out of git

## M1 Foundation
- [x] Git repo + GitHub remote (FzAlpha/loyalty-app)
- [x] Root pnpm workspace files; backend package.json, .env.example, README
- [x] config.toml: api schema exposed, signups off, seed via psql for now
- [x] 00_core: schemas, app_settings, error_codes, get_setting, raise_error, request context
- [x] 00_core: authz helpers as deny-all stubs (bodies in M2)
- [x] 80_audit: append-only audit_logs, audit.write, row trigger on app_settings
- [x] Seeds: error codes, default settings
- [x] pgTAP: 29 checks pass on spike project
- [~] CI workflow (supabase start, apply, seed, pgTAP, codegen) — first run pending
- [ ] Commit generated contracts after first CI run (drift check)
- [x] Declarative schema wiring verified in CI (probe step)
- [ ] Seed ratelimit.<action> and jobs.<name>.cron — values not decided
- [!] Nightly encrypted backup workflow + restore drill — backup provider not chosen
- [ ] Staging deploy on main — needs staging project + secrets

## Milestones (§15)
- [~] M0 Spikes: no-SMS signup, IP limits via Edge Fn, Expo+pnpm, folder wiring
- [~] M1 Foundation: core module, envs, CI, encrypted backups + restore drill, codegen
- [ ] M2 Identity & auth (after M0 sign-off)
- [ ] M3 Cards
- [ ] M4 Approval
- [ ] M5–6 Offers
- [ ] M7 Claims & redemption
- [ ] M8 Reporting & audit
- [ ] M9–10 Hardening & release

## Open questions (§16.2)
- [ ] Sb-Forwarded-For retest with IP Address Forwarding on
- [ ] M0 sign-off (unblocks M2)
- [ ] Backup storage provider + restore-test cadence (proposed monthly)
- [ ] Client legal review of provisional retention defaults (DPDP Act)
