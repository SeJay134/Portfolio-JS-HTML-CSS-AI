-- Phase 2C: no real email, user, role assignment or seed.
-- Only Google OAuth is supported for admin sessions. Keep other providers
-- disabled until the identity/session authorization model is reviewed.
create function private.has_live_google_session() returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null
 and coalesce((select auth.jwt())->'app_metadata'->>'provider' = 'google', false)
 and coalesce((select auth.jwt())->'amr' @> '[{"method":"oauth"}]'::jsonb, false)
 and exists (
   select 1 from auth.sessions s
   where s.id = case when (select auth.jwt())->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     then ((select auth.jwt())->>'session_id')::uuid else null end
     and s.user_id = (select auth.uid())
     and (s.not_after is null or s.not_after > now())
 );
$$;
revoke all on function private.has_live_google_session() from public, anon, authenticated;

create or replace function private.is_blog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select private.has_live_google_session() and exists (
 select 1 from public.profiles p
 join auth.users u on u.id=p.id
 join private.admin_allowlist a on a.user_id=u.id
 join auth.identities i on i.user_id=u.id and i.provider='google' and i.provider_id=a.google_subject
 where p.id=(select auth.uid()) and p.role='admin' and p.status='active'
 and a.enabled and not u.is_anonymous and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now())
 and u.email_confirmed_at is not null and lower(u.email)=a.email
 and lower(i.identity_data->>'email')=a.email and i.identity_data->>'email_verified'='true');
$$;
revoke all on function private.is_blog_admin() from public, anon, authenticated;
grant execute on function private.is_blog_admin() to authenticated;

-- Non-exposed schema dedicated to the one narrow enrollment entry point.
-- Existing private schema remains closed. No tables or other privileges here.
create schema blog_internal;
revoke all on schema blog_internal from public, anon, authenticated;
grant usage on schema blog_internal to authenticated;

create function blog_internal.enroll_current_admin() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
 caller uuid := (select auth.uid());
 verified_email text;
 subject text;
 entry private.admin_allowlist%rowtype;
begin
 if caller is null or not private.has_live_google_session() then return false; end if;

 -- Lock current profile and then allowlist in consistent order; only a
 -- previously unbound entry can promote. An explicit demotion is not undone.
 begin
   select lower(u.email), i.provider_id into strict verified_email, subject
   from public.profiles p
   join auth.users u on u.id=p.id
   join auth.identities i on i.user_id=u.id and i.provider='google'
   where p.id=caller and p.status='active'
     and not u.is_anonymous and u.deleted_at is null
     and (u.banned_until is null or u.banned_until<=now())
     and u.email_confirmed_at is not null
     and lower(i.identity_data->>'email')=lower(u.email)
     and i.identity_data->>'email_verified'='true'
     and i.provider_id is not null and length(btrim(i.provider_id))>0
   for update of p;
 exception when no_data_found or too_many_rows then return false;
 end;
 select * into entry from private.admin_allowlist a
   where a.email=verified_email for update;
 if not found or not entry.enabled then return false; end if;
 if entry.user_id is not null then
   return entry.user_id=caller and entry.google_subject=subject and private.is_blog_admin();
 end if;
 if exists (select 1 from private.admin_allowlist a where a.user_id=caller or a.google_subject=subject) then
   return false;
 end if;
 -- Unique constraints backstop concurrent bindings. No arbitrary user input.
 begin
   update private.admin_allowlist set user_id=caller, google_subject=subject
     where email=verified_email and enabled and user_id is null;
   if not found then return false; end if;
   update public.profiles set role='admin' where id=caller and status='active';
   if not found then raise exception 'Admin profile no longer active' using errcode='42501'; end if;
 exception when unique_violation then return false;
 end;
 return private.is_blog_admin();
end;
$$;
revoke all on function blog_internal.enroll_current_admin() from public, anon, authenticated;
grant execute on function blog_internal.enroll_current_admin() to authenticated;

-- PostgREST sees only the invoker wrapper. The privileged implementation is
-- outside exposed schemas and verifies the signed caller, not arguments.
create function public.resolve_blog_admin() returns boolean
language sql volatile security invoker set search_path = '' as $$
 select blog_internal.enroll_current_admin();
$$;
revoke all on function public.resolve_blog_admin() from public, anon, authenticated;
grant execute on function public.resolve_blog_admin() to authenticated;
