# Admin app (F2)

Private Android app for executives and owners. Expo SDK 58 + Expo Router + NativeWind 4. Talks to Supabase only through `@rewards/api`; theme, `Text` and brand images come from `@rewards/ui`.

## Run
1. Copy `.env.example` to `.env.local` and fill in the staging URL and anon key (never a secret or admin key).
2. From this folder: `npx expo start`, then open it with Expo Go on an Android phone (scanning needs the camera; web shows a notice instead).
3. Sign in with a staff account created by the owner through the `staff-admin` Edge Function. A new or reset account must set its own password first.

## Screens
- Sign in → (forced password change) → home.
- Home: name, role, the business being served (executives: their own; owners: pick one), sign out.
- Scan membership card: card + masked customer; approve after ticking the identity checks, or reject with a reason.
- Scan offer QR: server preview with refusal flags; bill number/amount as the offer requires; confirm.
- Today: the signed-in staff member's confirmed redemptions today at that business (server time zone).
- Businesses (owner only): add, edit, deactivate/reactivate, delete (only if never used; otherwise deactivate).

## Rules kept in the code
- Redemption is never offline. One idempotency key per scanned QR; after a lost connection the bill fields lock and "Try again" reuses the same key, so a retry cannot count twice. A clear refusal from the server gets a fresh key for the next attempt.
- The picked business is a UI choice only. The server checks role and business on every call.
- If a call is refused with `FORBIDDEN`/`UNAUTHENTICATED`, the app re-reads `get_my_staff` and shows "Account disabled" or "Session ended" with sign out (PDF §12 #7).

## Layout
- `src/app` screens: `(auth)` sign-in, `(staff)` guarded screens.
- `src/components` simple large controls (`ui.tsx`) and the QR `Scanner`.
- `src/lib` API client, session, queries, workplace (Zustand), errors; `src/strings.ts` all user-facing text.

## Known limitations
- On a phone against staging (Expo Go, 2026-11-26): executive and owner sign-in, forced password change, owner business picker, home and Today work (reported by the user). Card scan, offer scan and the disabled-account screens are not yet tested there.
- Staging test accounts exist (owner + one executive at Demo Dining Lounge); see `docs/staging_setup.md`.
- Session is stored in AsyncStorage, which is not encrypted.
- Businesses: deleting also removes its files from Storage (if that fails the app says so; the row is still deleted). Slugs keep Latin letters without accents ("Café" → "cafe"); other scripts (e.g. Hindi) fall back to "business". Not yet tested on a phone.
- Owner block/reissue and staff management are not here (planned for the F3 dashboard).
