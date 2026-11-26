-- Read-only aggregate audit. Run ONLY in the independently verified staging SQL editor.
-- Never output account emails, subjects, session tokens, or JWTs.
select
  (select count(*) from auth.users) as users,
  (select count(*) from auth.identities where provider='google') as google_identities,
  (select count(*) from auth.identities where provider<>'google') as other_identities,
  (select count(*) from auth.sessions where not_after is null or not_after>now()) as unexpired_session_rows,
  (select count(*) from public.profiles where role='admin' and status='active') as active_admins,
  (select count(*) from private.admin_allowlist where enabled and user_id is not null and google_subject is not null) as enabled_bound_allowlist,
  (select count(*) from private.admin_allowlist where enabled and user_id is null) as enabled_unbound_allowlist,
  has_function_privilege('anon','public.resolve_blog_admin()','EXECUTE') as anonymous_enrollment,
  has_function_privilege('authenticated','public.resolve_blog_admin()','EXECUTE') as authenticated_enrollment_rpc,
  (select count(*) from public.blog_posts) as public_projection_rows,
  (select enabled from private.studio_public_media_gate where singleton) as media_publication_enabled;
-- The count of unexpired session rows is NOT proof of actual current JWT validity or OAuth method.
