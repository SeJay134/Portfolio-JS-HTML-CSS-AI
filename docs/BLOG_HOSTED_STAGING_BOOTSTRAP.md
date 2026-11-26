# Hosted staging bootstrap and OAuth acceptance (partial)

2026-11-26. Base PR #79, reviewed commit 331c4c3f9b14c9e5131f37075db895e544019f57: 32/32 CI, 241 real local Data API checks, 42 local SEO HTTP requests. Owner explicitly approved a separate free Supabase project in the existing organization; provider quote $0/month. Project sergei-portfolio-staging created US East, healthy. Only staging was migrated. Production history unchanged (google_profiles only). No new paid service.

## Hosted migration evidence

All 13 exact repository SQL files were applied sequentially to the fresh staging project, using the management migration tool; this assigns new timestamps. Do NOT run a blind CLI db push against this project: reconcile the migration ledger first, without replaying existing DDL. Mapping (repository version -> staging ledger version):

| Migration | Repository | Staging |
| --- | --- | --- |
| google_profiles | 20261122002514 | 20261126165828 |
| blog_foundation | 20261125120000 | 20261126165834 |
| blog_admin_authorization | 20261125130000 | 20261126165836 |
| blog_draft_foundation | 20261125204431 | 20261126165839 |
| blog_media_foundation | 20261125212546 | 20261126165841 |
| blog_media_scoped_worker | 20261125220252 | 20261126165848 |
| blog_media_capability_broker | 20261125220658 | 20261126165850 |
| blog_media_library | 20261125221715 | 20261126165852 |
| blog_draft_media_references | 20261125222114 | 20261126165854 |
| blog_publication_foundation | 20261125222516 | 20261126165859 |
| blog_publication_media_references | 20261125225036 | 20261126165901 |
| blog_public_media_authorization | 20261126002616 | 20261126165903 |
| blog_atomic_media_publication | 20261126004445 | 20261126165907 |

SQL inspection: all 15 public/private application tables RLS enabled. Both media buckets private, JPEG-only, 5,000,000 byte limit. Media publication gate false. Anonymous SELECT on blog_posts granted, INSERT denied; authenticated direct UPDATE denied; direct private draft read denied for both roles. Both media roles no login, no bypass RLS, not superusers. Security advisor: 10 INFO notices for intentional default-deny private tables, no warning/error reported. These are catalog checks, not hosted gateway or OAuth acceptance.

## Hosted Google OAuth setup — operator action required

The connected Supabase tool does not offer hosted authentication provider/redirect settings or Google OAuth client management. Do not copy a production client secret or request secrets in chat. A separate local-testing Google client was previously reported (BLOG_OAUTH_LOCAL_ACCEPTANCE.md); reuse only that isolated client or make a dedicated hosted-staging client in Testing mode. No production client edits. Register the exact Supabase staging Auth callback copied from the staging Google provider dashboard as Google's authorized redirect URI (HTTPS, /auth/v1/callback). Retain local callback if using the test client for both environments. Use basic sign-in scopes and two distinct dedicated test identities if available (one administrator candidate, one ordinary test user). Prior one-account local exception does not waive hosted tests.

In staging Authentication > Providers: enable Google using the test Client ID/Secret directly in dashboard; disable email/password, phone, anonymous and other identity providers, keep new-user signups enabled. Keep Google nonce checking enabled. In staging URL Configuration set Site URL to the exact isolated protected Preview origin, and permit only its exact /auth/callback/ path. Do not allow production origin or broad wildcard. Preview URL will be determined after branch-scoped Vercel configuration; register exact callback before real sign-in. Google Authorized JavaScript origins should include the chosen isolated Preview origin, not production. Do not weaken Vercel SSO protection.

Before enabling browser flags, ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY target staging and use the modern publishable key only. Preview-only flags VITE_ENABLE_GOOGLE_AUTH=true and VITE_ENABLE_BLOG_ADMIN=true are not permission grants. Other feature flags are separate, initially disabled. No secret or privileged service key in VITE_*, Git, logs, screenshots or chat.

## Admin onboarding and verification

Read-only preflight 2026-11-26: 0 users, 0 identities, 0 sessions, 0 admins, 0 allowlist entries. Anonymous RPC EXECUTE denied, authenticated EXECUTE allowed but function requires a live verified Google OAuth session and enabled unbound email entry. Do not guess the administrator email or seed the organization account; obtain explicit operator confirmation of a dedicated test address. Add only that unbound allowlist row in the verified staging project after approval; never manually assign profile role or forge session/identity. Actual sign-in will bind verified user and Google subject through resolve_blog_admin(). Test ordinary user denied and allowlisted account admitted; cancel consent, refresh, sign out, disable allowlist, revoke session, confirm subsequent real API denial. Use docs/hosted-staging-oauth-audit.sql for aggregate evidence without personal identifiers; no tokens or secrets recorded. Verify exact observed browser/gateway outcomes separately. Current hosted OAuth acceptance BLOCKED pending operator configuration, confirmed test identity and real login. No hosted fixture content, OAuth configuration, role assignment, Preview activation, production writes or production GO yet.

References: https://supabase.com/docs/guides/auth/social-sign-in/auth-google ; https://supabase.com/docs/guides/auth/redirect-urls .
