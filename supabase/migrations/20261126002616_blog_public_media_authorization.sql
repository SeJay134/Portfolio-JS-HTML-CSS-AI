-- Candidate only: narrowly scoped public delivery capability. No hosted issuer.
create role studio_public_media_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant studio_public_media_reader to authenticator;
grant usage on schema public,storage,auth,blog_internal to studio_public_media_reader;
grant select on storage.objects,storage.buckets to studio_public_media_reader;

-- Dedicated synthetic server subject, not an author or a browser session.
-- The local trusted signer issues short-lived exact-asset capabilities.
create function blog_internal.public_media_scope(p_id uuid) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb := (select auth.jwt());
 issued bigint; expiry bigint; epoch bigint := floor(extract(epoch from now()))::bigint;
begin
 if p_id is null or claims->>'role' is distinct from 'studio_public_media_reader'
    or claims->>'sub' is distinct from 'a9000000-0000-0000-0000-000000000001'
    or claims->>'studio_public_asset_id' is distinct from p_id::text
    or claims->>'studio_public_action' is distinct from 'read'
    or jsonb_typeof(claims->'iat') is distinct from 'number'
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then return false; end if;
 issued:=(claims->>'iat')::bigint; expiry:=(claims->>'exp')::bigint;
 return issued<=epoch and expiry>epoch and expiry>issued and expiry-issued<=60;
end; $$;

-- Both metadata and Storage GET consult live publication eligibility.
-- Only this server role can invoke the invoker wrapper.
create function blog_internal.resolve_public_media(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not blog_internal.public_media_scope(p_id) then raise exception 'Media unavailable' using errcode='42501'; end if;
 select jsonb_build_object('id',a.id,'key',a.verified_key,'byte_size',a.byte_size,'sha256',a.sha256)
 into result from private.studio_media_assets a where a.id=p_id and a.state='verified'
 and private.active_studio_publication_media(a.id);
 return result;
end; $$;

create function blog_internal.public_media_object(p_name text,p_bucket text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_bucket='studio-media-verified' and exists(
 select 1 from private.studio_media_assets a where a.verified_key=p_name and a.state='verified'
 and blog_internal.public_media_scope(a.id) and private.active_studio_publication_media(a.id));
$$;
create function public.resolve_public_media(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.resolve_public_media(p_id); $$;
revoke all on function blog_internal.public_media_scope(uuid),blog_internal.resolve_public_media(uuid),
 blog_internal.public_media_object(text,text),public.resolve_public_media(uuid)
 from public,anon,authenticated,studio_media_worker,service_role;
grant execute on function blog_internal.resolve_public_media(uuid),blog_internal.public_media_object(text,text),
 public.resolve_public_media(uuid) to studio_public_media_reader;

create policy public_media_reader_select on storage.objects for select to studio_public_media_reader using (
 blog_internal.public_media_object(name,bucket_id) and storage.allow_only_operation('object.get_authenticated'));
create policy public_media_reader_select_guard on storage.objects as restrictive for select to studio_public_media_reader using (
 blog_internal.public_media_object(name,bucket_id) and storage.allow_only_operation('object.get_authenticated'));
create policy public_media_reader_no_insert on storage.objects as restrictive for insert to studio_public_media_reader with check(false);
create policy public_media_reader_no_update on storage.objects as restrictive for update to studio_public_media_reader using(false) with check(false);
create policy public_media_reader_no_delete on storage.objects as restrictive for delete to studio_public_media_reader using(false);
create policy public_media_reader_bucket on storage.buckets for select to studio_public_media_reader using(id='studio-media-verified');
create policy public_media_reader_bucket_guard on storage.buckets as restrictive for select to studio_public_media_reader using(id='studio-media-verified');
