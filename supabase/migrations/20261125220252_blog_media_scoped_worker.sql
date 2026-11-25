-- Phase 3D.2C: scoped worker capability proof. No production token issuer.
-- This role is NOT service_role and has no login, password or BYPASSRLS.
create role studio_media_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant studio_media_worker to authenticator;
grant usage on schema public,storage,auth,blog_internal to studio_media_worker;
grant select,insert,delete on storage.objects to studio_media_worker;
grant select on storage.buckets to studio_media_worker;

-- A verified server-issued capability must identify one asset and the exact
-- live Google session. Expiration is checked by the gateway AND here.
create function blog_internal.media_worker_scope(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb := (select auth.jwt());
 issued bigint; expiry bigint; current_epoch bigint := floor(extract(epoch from now()))::bigint;
begin
 if p_id is null or claims->>'role' is distinct from 'studio_media_worker'
    or claims->>'studio_asset_id' is distinct from p_id::text
    or jsonb_typeof(claims->'iat') is distinct from 'number'
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then return false; end if;
 issued := (claims->>'iat')::bigint;
 expiry := (claims->>'exp')::bigint;
 return issued<=current_epoch and expiry>current_epoch and expiry>issued
   and expiry-issued<=120 and private.is_blog_admin();
end; $$;

create function blog_internal.media_worker_object(p_name text,p_bucket text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.studio_media_assets a
   where a.owner_id=(select auth.uid()) and a.quarantine_key=p_name
    and blog_internal.media_worker_scope(a.id)
    and (
     (p_action='read' and p_bucket in ('studio-media-quarantine','studio-media-verified')
      and (a.state='verified' or (a.state='reserved' and a.expires_at>now())))
     or (p_action='write' and p_bucket='studio-media-verified' and a.state='reserved' and a.expires_at>now())
     or (p_action='cleanup' and p_bucket='studio-media-quarantine' and a.state='verified')
    ));
$$;

create function blog_internal.get_media_worker_asset(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not blog_internal.media_worker_scope(p_id) then raise exception 'Media unavailable' using errcode='42501'; end if;
 select jsonb_build_object('id',a.id,'owner_id',a.owner_id,'state',a.state,
  'sha256',a.sha256,'byte_size',a.byte_size,'width',a.width,'height',a.height) into result
 from private.studio_media_assets a where a.id=p_id and a.owner_id=(select auth.uid())
 and (a.state='verified' or (a.state='reserved' and a.expires_at>now()));
 if result is null then raise exception 'Media unavailable' using errcode='42501'; end if;
 return result;
end; $$;

create function blog_internal.commit_media_worker_asset(p_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare asset private.studio_media_assets%rowtype;
begin
 if not blog_internal.media_worker_scope(p_id) then raise exception 'Media unavailable' using errcode='42501'; end if;
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is null
    or p_byte_size not between 1 and 5000000 or p_width is null or p_width not between 1 and 2200
    or p_height is null or p_height not between 1 and 2200 then raise exception 'Invalid receipt' using errcode='22023'; end if;
 select * into asset from private.studio_media_assets a where a.id=p_id and a.owner_id=(select auth.uid()) for update;
 if not found or not blog_internal.media_worker_scope(p_id) then raise exception 'Media unavailable' using errcode='42501'; end if;
 if asset.state='verified' then
   if (asset.sha256,asset.byte_size,asset.width,asset.height) is distinct from (p_sha256,p_byte_size,p_width,p_height)
   then raise exception 'Media receipt conflict' using errcode='40001'; end if;
 elsif asset.state='reserved' and asset.expires_at>now() then
   -- Storage metadata existence and byte length backstop the trusted worker.
   -- The digest comes from actual read-back bytes, not a client receipt.
   if not exists(select 1 from storage.objects o where o.bucket_id='studio-media-verified'
     and o.name=asset.quarantine_key and o.metadata->>'size'=p_byte_size::text)
   then raise exception 'Verified object unavailable' using errcode='22023'; end if;
   update private.studio_media_assets set state='verified',verified_key=quarantine_key,
     sha256=p_sha256,byte_size=p_byte_size,width=p_width,height=p_height
     where id=p_id and owner_id=(select auth.uid()) and state='reserved' and expires_at>now()
       and blog_internal.media_worker_scope(p_id);
   if not found then raise exception 'Media unavailable' using errcode='42501'; end if;
 else raise exception 'Media unavailable' using errcode='42501'; end if;
 return blog_internal.get_media_worker_asset(p_id);
end; $$;

create function public.get_media_worker_asset(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.get_media_worker_asset(p_id); $$;
create function public.commit_media_worker_asset(p_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer) returns jsonb
language sql volatile security invoker set search_path='' as $$ select blog_internal.commit_media_worker_asset(p_id,p_sha256,p_byte_size,p_width,p_height); $$;

revoke all on function blog_internal.media_worker_scope(uuid),blog_internal.media_worker_object(text,text,text),
 blog_internal.get_media_worker_asset(uuid),blog_internal.commit_media_worker_asset(uuid,text,integer,integer,integer),
 public.get_media_worker_asset(uuid),public.commit_media_worker_asset(uuid,text,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function blog_internal.media_worker_object(text,text,text),blog_internal.get_media_worker_asset(uuid),
 blog_internal.commit_media_worker_asset(uuid,text,integer,integer,integer),
 public.get_media_worker_asset(uuid),public.commit_media_worker_asset(uuid,text,integer,integer,integer) to studio_media_worker;

-- SELECT is required during upload/delete as well as authenticated download.
-- Explicit operation guards exclude list, sign, copy, move and signed upload.
create policy studio_worker_select on storage.objects for select to studio_media_worker using (
 blog_internal.media_worker_object(name,bucket_id,'read')
 and storage.allow_any_operation(array['object.get_authenticated','object.upload','object.delete_many']));
create policy studio_worker_select_guard on storage.objects as restrictive for select to studio_media_worker using (
 blog_internal.media_worker_object(name,bucket_id,'read')
 and storage.allow_any_operation(array['object.get_authenticated','object.upload','object.delete_many']));
create policy studio_worker_insert on storage.objects for insert to studio_media_worker with check (
 blog_internal.media_worker_object(name,bucket_id,'write') and storage.allow_only_operation('object.upload'));
create policy studio_worker_insert_guard on storage.objects as restrictive for insert to studio_media_worker with check (
 blog_internal.media_worker_object(name,bucket_id,'write') and storage.allow_only_operation('object.upload'));
create policy studio_worker_delete on storage.objects for delete to studio_media_worker using (
 blog_internal.media_worker_object(name,bucket_id,'cleanup') and storage.allow_only_operation('object.delete_many'));
create policy studio_worker_delete_guard on storage.objects as restrictive for delete to studio_media_worker using (
 blog_internal.media_worker_object(name,bucket_id,'cleanup') and storage.allow_only_operation('object.delete_many'));
create policy studio_worker_no_update on storage.objects as restrictive for update to studio_media_worker using(false) with check(false);
create policy studio_worker_bucket_read on storage.buckets for select to studio_media_worker
 using(id in ('studio-media-quarantine','studio-media-verified'));
create policy studio_worker_bucket_guard on storage.buckets as restrictive for select to studio_media_worker
 using(id in ('studio-media-quarantine','studio-media-verified'));
