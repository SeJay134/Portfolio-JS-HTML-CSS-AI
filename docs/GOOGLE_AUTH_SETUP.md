# Google-only sign-in (implementation checklist)

This repository is a Vite multi-page app: the portfolio plus separate Photo Compressor and File Converter pages. Authentication code must share one Supabase client and browser session across these entries.

## External setup (manual, no secrets in Git)

1. Create a project at https://supabase.com/dashboard.
2. In Google Auth Platform create an **External** web OAuth client. Under Authorized JavaScript origins add `https://sergei-luna.vercel.app` and `http://127.0.0.1:5001`. Under Authorized redirect URIs add the *Supabase-provided* `https://<project-ref>.supabase.co/auth/v1/callback` — do not point Google directly at this site's callback.
3. In Supabase Authentication > Providers enable Google with the Google Client ID and Client Secret. Turn off password/email, phone, and anonymous sign-in providers. Keep signups enabled. Google accounts with non-Gmail addresses are allowed.
4. In Supabase Authentication > URL Configuration set Site URL to `https://sergei-luna.vercel.app`, and allow `https://sergei-luna.vercel.app/auth/callback/` and `http://127.0.0.1:5001/auth/callback/`.
5. Put the Supabase project URL and **publishable** key in Vercel environment settings and in a local, ignored `.env.local`:
   - `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
   - `VITE_ENABLE_GOOGLE_AUTH=true` (only after Google OAuth and redirects are configured)
6. Never expose Google Client Secret, Supabase secret/service_role keys, or another server secret using `VITE_*`.
7. Make the Google OAuth app available in production when ready. Configure consent screen/authorized domains, and complete any verification Google requires.

## Delivery sequence

- [x] Phase 1: allowlisted OAuth return paths, configuration instructions and tests.
- [x] Phase 2: browser Supabase client, authentication context, Google Login, PKCE callback.
- [x] Phase 3: guard both tool UIs; shared account menu and sign-out (feature-flagged).
- [ ] Phase 4: profile migration + row-level security, API authorization and end-to-end tests.
- [ ] Phase 5: review + production activation.

The local photo/file processing must remain browser-only. A React UI guard does not protect downloadable frontend code or enforce billable usage; paid/API features need server-side authorization.
