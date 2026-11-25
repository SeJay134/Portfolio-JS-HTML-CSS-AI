# Phase 2B — database foundation

Production is read-only for this task. The existing applied migration 20261122002514_google_profiles has the same SQL as the repository migration 202611210001_google_profiles; rename the file without replaying or changing remote history. Verify again before remote deployment.

New tables: blog_posts, blog_categories, blog_tags, blog_post_tags, private.admin_allowlist, private.blog_post_authors. RLS grants public reads only for published rows with published_at <= now, and only taxonomy linked to published rows. Admin access requires active profile, enabled allowlist, bound UUID and verified matching Google identity. No public access to account UUIDs or admin email; the public byline is separate. No automatic enrollment yet; the allowlist is empty. Existing profile trigger unchanged. Direct DB owner imports must set author attribution explicitly if needed.

The private predicate uses caller UID and current DB state, not JWT role or user metadata. No direct private schema access. Revoking allowlist or blocking profile takes effect for subsequent statements even with unchanged token. Phase 2C must add enrollment and explicit active-session checks, concurrency-safe binding, fail-closed UI gate and tests before admin activation.

Content is bounded JSON array; full block schema validation, media, revisions, publishing transitions and static snapshot invalidation are later phases. Current public site uses empty static data; do not publish live rows until the publication pipeline is reviewed. Never put secrets in public rows.

Local-only CI starts isolated Supabase PostgreSQL 17, runs pgTAP synthetic fixtures in rollback transaction and database lint. No production credentials or linked commands. CLI/Docker unavailable in authoring environment and registry DNS blocked; migration version chosen in UTC format manually, CI must validate it. No production migrations before explicit approval, backup/rollback plan, migration history recheck, local tests, security review and advisors.

Run locally: supabase db start; supabase test db --local; supabase db lint --local --level error --fail-on error; supabase stop --no-backup.
