# Phase 2E — security review and verification

## Scope and findings

Audited the three repository migrations, Google OAuth callback and return paths, auth context, administrative RLS/entry point, anonymous public reader, publication state, Vercel routes and existing CI. Hosted Supabase inspection is read-only; its advisor cannot analyze unapplied blog migrations. Current hosted security advisor warns about leaked-password protection, performance advisor is clear. Keep Google-only providers and verify the dashboard settings before activation.

1. High impact configuration error: the common Supabase auth client previously accepted any nonempty key. Build now rejects known server-only VITE variables, secret-key values and privileged legacy JWT claims without displaying values. Runtime public and server auth clients require modern publishable keys. A build check is not a substitute for correctly scoped Vercel environment settings; never put secrets under VITE_. Any previously exposed secret must be rotated, not merely removed.
2. Auth lifecycle race: a delayed initial getSession result could overwrite a newer auth event. Ignore it after any event. Track auth event revision in the UI gate, reject stale decisions, and revalidate on focus and back/forward cache restore. Server RLS is authoritative; the UI does not grant database privileges.
3. Coverage gap: mocked HTTP and pgTAP alone do not prove the real gateway/embedded relation contract. New CI job starts a disposable full local Supabase stack and runs actual REST requests using only loopback origin, local test credentials and synthetic users. The local-only JWTs test signed request boundaries and revocation, NOT real Google OAuth. If the local CLI only provides legacy anon credentials, the script reports that fallback; hosted modern publishable-key flow still requires staging verification. Fixtures are not migration files and must never be used remotely.
4. Reviewed defenses: public query uses no admin JWT or cookies; RLS filters published rows and taxonomy, direct writes require live bound admin; private schemas remain excluded; RPC accepts no caller-supplied identity. React escapes content. No raw HTML renderer introduced. Existing 62 pgTAP checks must continue passing. This is a targeted audit, not a penetration-test certification.

## Blockers before activation (Phase 2F and publication)

- CI must validate full local stack, all SQL and frontend tests; inspect actual logs. Local CLI/Docker unavailable in authoring runtime. No production schema modifications or real user assignment in Phase 2E.
- Use an isolated staging environment (or disposable local OAuth setup) to verify real Google login and provider configuration, signed session claims, verified identity, enrollment, logout/revocation, expired sessions, publishable-key browser requests, CORS, and blocked accounts. No real credentials in CI.
- Check production schema/migration history, backup and rollback, security/performance advisors after approved schema deployment, exposed schema settings, Google-only provider settings, explicit email allowlist approval, then feature switch rollout.
- Real publication remains blocked on SEO server response, actual 404/503, safe unpublish/invalidation, validated editor content and separate private draft media policies. A public row may contain only intentionally published fields/content; already viewed/copied public content cannot be recalled. Review editor state preservation before adding persistent editing to revalidation gate.
- Client flags are UI rollout controls, not database authorization. Keep allowlist empty until approved. Existing public blog stays static.

## CI isolation correction

Initial local gateway run passed 29 checks using a publishable key. The pgTAP runner recursively discovered the API fixture SQL under supabase/tests, executed it, and contaminated the SQL suite (11 count assertions failed). The fixture has moved to supabase/test-fixtures/blog-api.sql, outside test discovery, and only the disposable API test script loads it. No policy or SQL test assertion was removed. Existing typed auth mocks now include authRevision; the stale-session regression explicitly flushes the deferred result before asserting. Re-run both workflows on the corrected commit.
