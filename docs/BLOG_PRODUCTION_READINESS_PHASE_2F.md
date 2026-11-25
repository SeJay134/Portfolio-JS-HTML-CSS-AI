# Phase 2F.1 — Production readiness audit

Audit date: 2026-11-25. Read-only hosted checks after approved squash merge of PR #47. Reviewed CI head 5a89e2e7e8bd6b21682995644448253df0ec4448; main 9d6c88c5db26db54af41f663f731a7c001e7bf56. This document does not authorize any database migration, allowlist entry, role assignment, feature activation, paid resource or configuration change.

## Verified baseline

| Check | Evidence / result |
| --- | --- |
| CI | Both workflows success; 62 pgTAP, 29 real local HTTP assertions with publishable key, 174 frontend units, 85 E2E and 180 browser regression passed. Other CI categories green. |
| Hosted database | sergei-portfolio-auth, ACTIVE_HEALTHY, us-east-1, PostgreSQL 17.12. |
| Migration history | Only 20261122002514 google_profiles. Stored SQL matches repository file exactly after trimming outer whitespace. Two blog migrations pending; no drift in that history entry (not a complete schema diff). |
| Profile permissions | RLS enabled; one policy; anon SELECT denied, authenticated SELECT granted, UPDATE denied; private schema USAGE denied; profile creation trigger present. |
| Account baseline | One auth user, one profile, zero admins, one matching verified Google identity, zero non-Google identities. Counts only; no emails or IDs extracted. |
| Compatibility | All four required auth.sessions columns (id, user_id, not_after, oauth_client_id) present. |
| Storage | No buckets. Do not introduce media uploads without separate policies. |
| Advisors | Security: one warning, leaked-password protection disabled; performance: no findings. Google-only settings still need manual confirmation. |
| Vercel | Automatic production deploy from approved merge READY, main SHA matches, production alias assigned. Deployment dpl_4GhoBDidd7kovCKcbNTCMMFQg3nF. Previous build dpl_CtUKmZayqWzA2nCMkDAWidL2gYaY; confirm actual rollback eligibility before relying on it. |
| Public HTTP | /, /blog/, /admin/blog/, /auth/callback/, /sitemap.xml return 200. Blog HTML still empty; admin shell noindex/no-store, no confirmed-admin content in HTML; sitemap includes blog, excludes admin. A syntactically valid nonexistent article returns shell 200 with noindex/no-store (known publication blocker). |
| Vercel config | Metadata only, no decrypted values. Existing six auth-related production variables present. Blog rollout flag names absent; hidden production count zero. Preview auth variables restricted to old feat/google-supabase-auth branch. No dedicated staging branch configuration verified. |

CI: https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/45623739124 and https://github.com/SeJay134/Portfolio-JS-HTML-CSS-AI/actions/runs/45623739173.

## Decision: NO-GO for database changes or live activation

Code and current disabled baseline are healthy. The following prerequisites remain open. Do not interpret CI as proof of a real OAuth journey. HTTP checks inspect HTML/headers, not an interactive authenticated browser session.

### 2F.2 — isolated OAuth staging (separate approval if resources/settings change)
- Prefer disposable local Supabase with exact reviewed migrations and a test-only Google OAuth client/redirect. Alternatively use a separately approved staging project and branch-specific Vercel Preview variables, never production DB credentials. No paid hosting or new Supabase branch without cost approval.
- Verify provider settings: Google only; password/email/phone/anonymous and unrelated OAuth clients disabled; review identity linking/unlinking; exact callback allowlist, site URL, session expiry and actual JWT claims. Verify Data API exposed schemas public/graphql_public only; private and blog_internal must remain unexposed.
- Run actual sign-in with test identities, test-only allowlist, verified email match, bound UUID/subject, first and repeat login, ordinary/blocked/disabled access, sign-out and revocation, browser refresh/back navigation, real publishable-key requests and CORS. Do not print tokens, passwords, emails or client secrets. Test failure or unexpected provider/session behavior blocks rollout.
- Delete disposable fixtures/test environment only after review; never import them into production.

### 2F.3 — backup and rollback readiness
- Verify actual plan, backup retention, latest successful backup and restore method in dashboard. No backup has been created or restore tested by this audit. If managed backups unavailable, use an approved encrypted logical export/restore procedure that preserves required auth/profile data, migration history and settings; verify supported Supabase restore steps in an isolated target. Do not commit dumps or credentials to Git. Record recovery point, owner, retention, access and expected recovery time after rehearsal.
- Record prior known-good Vercel production deployment and environment configuration (names/scopes; values only in approved secure storage). Confirm rollback candidate and restoration of auto-deploy behavior. Vercel rollback does not reverse Supabase changes.
- Compare live schema and migration SQL/hash, check dependencies and locks, confirm no surprise migrations; rerun advisors immediately before approval. Use reviewed migration mechanism that records exact repository versions. If CLI unavailable, do not improvise a production migration path that changes history.
- Both rollout flags must remain off. Deployment and feature activation are separate operations.

### 2F.4 — schema rollout (not authorized)
After explicit approval and completed staging/backup checks: target the exact project; apply only 20261125120000_blog_foundation then 20261125130000_blog_admin_authorization using the approved version-preserving mechanism. Never run local fixture SQL. Verify after each step; stop on mismatch/failure, do not blindly retry or apply second migration. Keep admin allowlist empty and UI flags off.
 
### 2F.5 — production verification (after authorized schema deployment)
Read-only catalog checks: exact migration history, four public blog tables and two private tables, RLS policies, grants, empty search_path on privileged functions, no exposed private schemas, empty blog/allowlist, unchanged profile and zero admins. Rerun security/performance advisors. Verify anonymous Data API reads empty published catalogue, no credentials or private fields; do not introduce fixture accounts or posts in production. Any unexpected access or existing application regression is a stop condition.

### 2F.6/2F.7 — explicit enrollment and staged activation (not authorized)
Owner privately approves one exact email. Add only the approved address to private allowlist via authorized operator after staging. Do not commit it, print it in logs or add a generic wildcard. Bind once on verified Google session using RPC; verify counts and deny other identities. UI flags are not authorization boundaries. Enable VITE_ENABLE_BLOG_ADMIN only after reviewed configuration and a tested production build; enable VITE_ENABLE_LIVE_BLOG separately after anonymous reader checks. No real articles until editor validation, server SEO/404/503, safe unpublication/cache behavior and private media design have been reviewed.

### 2F.8 — post-activation validation and containment
Smoke-check public site/tools, OAuth, admin and catalogue, exact deployment/alias and error logs. Record observed metrics and advisor results. On failure stop publication and disable allowlist entry via approved DB operation to block existing JWTs, revoke affected sessions if needed, disable UI flags and restore a known-good build (or redeploy previous approved configuration). Do not drop blog tables or restore over live auth data by default. Additive schema can remain inactive; recovery or forward fix requires separate approved plan. Already publicly viewed content cannot be recalled. Check auth account and profile integrity and no further public data exposure.

References: [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [password security warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [Vercel deployments](https://vercel.com/docs/deployments).

## Scope
Phase 2F.1 documents readiness and blockers. No migration or role change, environment mutation, backup creation, test project provisioning, manual deployment or production activation was performed. Normal automatic Vercel deployment from the explicitly authorized merge is the only deployment in this phase. No secrets were decrypted. Recheck all baseline evidence before later approval.
