# Frontend plan

Status: **approved 2026-11-22**. This file is the source of truth for frontend work, the same way BACKEND_PLAN.md is for the backend.

Sources:
- `Group_Rewards_App_Updated_Technical_Plan.pdf`:
  - §2: stack
  - §4: tools
  - §9: screens
  - §11: milestones
  - §12: acceptance
  - §15: Android first
- BACKEND_PLAN.md:
  - §12: contract
  - §6: operations
- `docs/m0-findings.md` (c): Expo + pnpm check

## 1. Where things live (approved folder structure only)

| Folder | What | Stack (PDF §2, §4) |
|---|---|---|
| `frontend/customer` | Customer Android app | Expo + React Native + TypeScript, Expo Router |
| `frontend/admin` | Executive + owner mobile app (private APK) | Expo + React Native + TypeScript, Expo Router |
| `frontend/dashboard` | Owner web dashboard | Next.js + TypeScript, Tailwind CSS, Recharts |
| `packages/shared` | Zod schemas, constants, types (re-exports `backend/contracts`) | TypeScript + Zod |
| `packages/api` | Typed client, one function per operation in BACKEND_PLAN.md §6 | TypeScript + `@supabase/supabase-js` |
| `packages/ui` | Shared mobile UI parts where practical | React Native |

Shared libraries (PDF §4):
- Zustand: local UI state
- TanStack Query: server state and caching
- React Hook Form + Zod: forms
- expo-camera: scanning
- react-native-qrcode-svg: QR display
- NativeWind: mobile styling (PDF: "where appropriate", so to be confirmed)

Versions are pinned when each app is created. M0 verified Expo SDK 58. I will not assume other versions until I check them.

## 2. Rules carried over from CLAUDE.md
- Apps call only `packages/api`, never `supabase.rpc` directly. They show user messages based on error `code`.
- Only the anon or publishable key and the project URL are bundled, read from `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` env vars. The service-role key is never bundled; the CI `security` job checks for it.
- No "phone verified" wording anywhere. A passed identity check does not prove the customer owns the phone.
- Redemption is never offline. A claim shows as redeemed only after the server confirms it (PDF §6).
- No hard-coded business rules. Limits, TTLs and so on come from the server (`app_settings` via RPCs).

## 3. Build order (proposed)

| # | Deliverable | Exit criteria |
|---|---|---|
| F0 | Commit generated `backend/contracts` from CI. `packages/shared` schemas and `packages/api` client for every §6 operation, with unit tests | Typecheck + tests green in CI. Drift check catches contract changes |
| F1 | Customer app: sign up / in / recover, home, link card by QR, offers, claim QR, history, profile, password change, account deletion | Flows work against staging. Customer part of §12 #1, #3, #9, #10 |
| F2 | Admin app: executive home, scan card (approve/reject), scan offer QR (preview + confirm), today, owner mode | Flows work against staging. §12 #1, #4, #5, #7 through the UI |
| F3 | Owner dashboard: totals, offers (+ banner upload), customers, executives, businesses, reports + CSV, audit log | Owner flows work against staging |
| F4 (= M10) | Low-end Android and slow/intermittent network tests, runbooks (backup/restore first), Play/APK release prep, cut-over | All PDF §12 criteria green |

## 4. Decisions (2026-11-22)
- Dev backend: a new Free-plan **staging** project. The M0 spike project is removed first.
- Android testing: **Expo Go** on the user's phone. Dev builds only if a native module needs one.
- Order: F0, then customer, admin, dashboard.
- English only; plain accessible styling (NativeWind on mobile, Tailwind on web).

## 4.1 Background to the decisions

1. **Backend to develop against.** There's no Docker here, so local Supabase isn't available. The apps need a hosted **staging** project, which BACKEND_PLAN.md §14 says the client owns. On the Free plan, staging + production use the 2 active-project limit. The M0 spike project still exists and must be deleted first, or used as a temporary dev backend.
2. **Android testing without an Android SDK here.**
   - Option A: Expo Go on a real phone.
   - Option B: an EAS Build development APK. The EAS free-tier limits are not verified yet.
   - Expo web (in the browser pane) can be used for quick layout checks only. It does not replace device tests (camera, low-end performance).
3. **Low-end device for §12 #11.** This must be a real device you or the client supply. Throttled networks can be simulated, but device performance cannot.
4. **Language.** The PDF names none. Proposed: English only for Phase 1, with all strings in one place so translation can be added later.
5. **Design / branding.** There's no design in the repo. Proposed: plain, accessible components. Business branding (logo/colours) comes from the `businesses` data already in the backend.

## 5. Known gaps (honest status)
- `backend/contracts` is generated in CI but not committed yet. `packages/api` is empty, even though BACKEND_PLAN.md §16.1 #21 said it would be written module by module. F0 fills both.
- Whether Edge Functions can import `packages/shared` is still unverified (BACKEND_PLAN.md §12).
- Native Android build is unverified (M0 (c)).
