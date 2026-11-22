# Google Login test suite

The owner has already confirmed that real Google OAuth works in the protected
Vercel Preview. Automated tests are independent: they use **mock accounts**
and **mock Supabase endpoints**, and must never ask for Google credentials,
refresh tokens from real users, or a production `service_role` key.

## CI tests

- `npm run test:unit`: AuthProvider lifecycle, session recovery, protected
  route behavior, OAuth error handling and safe return paths.
- `node --test tests/integration/frontend/google-auth-guard.test.mjs`:
  server-side authentication and profile-status authorization.
- `VITE_ENABLE_GOOGLE_AUTH=true VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run build`
  followed by `npx playwright test --config playwright.auth.config.ts --project=chromium`:
  full browser tests of both protected tools, cached sessions, logout,
  OAuth PKCE parameters, callback/session exchange, and invalid callbacks.

The GitHub Actions `auth-gate` job uses those exact test settings. None of
these tests calls Google or uses a real Supabase credential.

## Real-account acceptance checklist (manual, Preview only)

1. Start signed out; both tools must show `Continue with Google`.
2. Sign in through Google; confirm the browser returns to the original tool.
3. Open both tools, reload, and confirm the session persists.
4. Click `Log out` and verify both tools are locked again.
5. Sign in a second time; confirm it works without creating another profile.
6. Confirm that accounts marked `blocked` cannot access the protected API.
7. Check the auth callback is allowlisted in Supabase and the Google OAuth
   client redirects to `https://wuwdlorpkcjmceiedaqx.supabase.co/auth/v1/callback`.

A successful automated mocked flow is **not** proof that the third-party
Google consent screen or a real Supabase project is configured. Keep the
production feature flag disabled until the real-account checklist is passed.
