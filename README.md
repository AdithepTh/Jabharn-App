# Jabharn (จับหาร)

A trip & bill-splitting app — log trips, split meals/lodging costs among
friends, and settle up. Phase 1 targets Android via Expo/React Native,
fully offline, zero backend cost. Sharing/realtime sync is designed in but
switched off until phase 2 (see `src/config/featureFlags.ts`).

**👉 New to this repo? Start with [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md).**

## Status

| Feature | Status |
|---|---|
| Split bills, trips, meals, accommodation (offline) | Designed & working in `reference/web-prototype/`, not yet ported to React Native screens |
| Share trip / realtime sync | Code scaffolded (`CloudRepository`), **off** until phase 2 |
| Login: Google / Email / Guest | Scaffolded (`src/auth/AuthService.ts`), needs a real Firebase project to activate |
| Thai/English language switch | Scaffolded (`src/i18n/`) |
| Trash with 30-day recovery | Built into every repository (`softDelete` / `restore` / `purgeExpiredTrash`) |

## Repo layout

```
App.tsx                        — entry point (placeholder screen for now)
app.json                       — Expo app config
package.json                   — dependencies
src/
  config/featureFlags.ts       — the phase-2 on/off switch + 30-day trash window
  data/                        — repository interface + Local (active) / Cloud (phase 2) implementations
  auth/AuthService.ts          — Google / email-link / guest sign-in
  i18n/                        — Thai/English strings
  firebase/firebaseConfig.ts   — fill in your Firebase project keys here
functions/purgeTrash.js        — phase 2 scheduled Cloud Function (server-side trash cleanup)
firestore.rules                — phase 2 security rules draft
reference/web-prototype/       — the working React web version — use this as the spec for building each screen
docs/GETTING_STARTED.md        — what to actually do, in order
```

## Quick start

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone (Play Store / App
Store) to run it live — no build step needed while developing.

## Before shipping to Google Play

- [ ] Google Play Console account ($25 one-time)
- [ ] New developer accounts (post Nov 2023) require a closed test with
      **12+ testers for 14 days** before applying for production release —
      plan for this
- [ ] `eas build` (via Expo Application Services) — builds Android **and**
      iOS in the cloud, no Mac required for Android
- [ ] Privacy policy + a web page for account/data deletion requests
      (required once accounts exist — see `AuthService.deleteAccount()`)

## License

Private project — not published under an open-source license.
