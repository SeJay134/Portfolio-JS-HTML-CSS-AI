# Phase 3F.3C — hosted acceptance blocked; isolation preflight

Base #78 latest bdbda877b72b600d569636721d3563dfa9fc55f7: 29/29 applicable CI passed, 263 unit and 26 integration tests. Git Preview READY. Read-only connected Supabase inventory on 2026-11-26: exactly one healthy project (sergei-portfolio-auth), no development branches; migration history contains only 20261122002514 google_profiles. No independently approved isolated project is available. No SQL, cloud writes, project creation, hosted migration, Vercel environment changes, new share link or explicit deploy performed. Do not use the existing project as a test target. Actual hosted SEO/CDN acceptance is NOT PASSED.

This change makes isolation configuration mandatory at runtime and before candidate post-build file removal. Primary and test project refs must differ, exact server URL must match test ref, publishable key only; enabled Vite live blog must match the same URL/key. Uses synthetic refs in CI; actual account IDs are not committed. This is a misconfiguration fence, not authentication or proof that a declared project is isolated. Existing active Vercel configuration remains unchanged. No paid feature or additional project is created.

## Required before proceeding
- Owner confirms a separate test project/branch and any cost/plan implications; verify actual project inventory and no real content. Do not assume free quota.
- Apply reviewed migration stack only to that test project with explicit approval, verify schema/RLS, OAuth and test admin.
- Configure isolated Preview only, verify SSO, exact Git commit, protected acceptance script, publish/republish/unpublish/archive and CDN. Review hosted media and real OAuth before release.
- Keep Production flags disabled, no migration or merge to main. Record evidence before any release decision.

CI pending for this change. No hosted acceptance result claimed.

Update: isolated free staging created and all 13 reviewed migrations applied; initial catalog security checks passed. See BLOG_HOSTED_STAGING_BOOTSTRAP.md for migration ledger and remaining manual Google OAuth/hosted acceptance gates. #79 CI 32/32 passed. Actual hosted SEO/CDN remains unverified.
