# Customer app (F1)

Expo SDK 58 + Expo Router + NativeWind 4. Talks to Supabase only through `@rewards/api`.

## Run
1. Copy `.env.example` to `.env.local` and fill in the staging URL and anon key (never a secret or admin key).
2. From this folder: `npx expo start`, then scan the QR with Expo Go on your phone.
3. Web check: `npx expo start --web`.

Installing native packages: `npx expo install` needs `pnpm` on PATH. Without it, use `npx pnpm@12.21.0 add <pkg>@<version expo suggests>`.

## Layout
- `src/app` screens (file-based routes), `src/components` shared UI, `src/fx` animation effects.
- `src/strings.ts` all user-facing text; colours, fonts, `Text` and the shared brand images live in `packages/ui` (`src/theme` and `components/Text.tsx` re-export them).

## Known limitations
- Session is stored in AsyncStorage, which is not encrypted.
- Shiny Text falls back to plain gold text on web (MaskedView is native only).
- Not built yet: link card by QR (needs expo-camera), change password, account deletion, WhatsApp refer, offer banner images.
- Logos are low-res crops from the client video; originals needed.
- Only the web bundle has been checked. Native run on a phone has not been tested yet.
