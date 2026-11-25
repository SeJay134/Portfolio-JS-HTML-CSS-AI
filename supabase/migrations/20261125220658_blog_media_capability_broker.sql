-- Phase 3D.2D: authorization context, action-scoped grant and expiry fencing.
-- No signing secret, token issuer, scheduler or real user in this migration.
create function blog_internal.authorize_media_grant(p_id uuid,p_action text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); claims jsonb := (select auth.jwt());
 asset private.studio_media_assets%rowtype; current_epoch bigint := floor(extract(epoch from clock_timestamp()))::bigint;
 expiry bigint;
begin
 if caller is null or claims->>'role' is distinct from 'authenticated'
   or not private.is_blog_admin() then raise exception 'Media unavailable' using errcode='42501'; end if;
 if p_id is null or p_action is null or p_action not in ('promote','cleanup')
   or jsonb_typeof(claims->'exp') is distinct from 'number'
   or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
   or coalesce(claims->>'session_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then raise exception 'Media unavailable' using errcode='42501'; end if;
 expiry := least((claims->>'exp')::bigint,current_epoch+120);
 if expiry-current_epoch<15 then raise exception 'Refresh session' using errcode='42501'; end if;
 select * into asset from private.studio_media_assets where id=p_id and owner_id=caller for update;
 if not found or not private.is_blog_admin() then raise exception 'Media unavailable' using errcode='42501'; end if;
 if p_action='promote' then
   if not (asset.state='verified' or (asset.state='reserved' and asset.expires_at>clock_timestamp()))
     then raise exception 'Media unavailable' using errcode='42501'; end if;
 else
   -- Wait beyond reservation and worker-token expiry. A durable rejected
   -- tombstone prevents late promotion or reuse. Quota is NOT released.
   if asset.state='reserved' and asset.expires_at+interval '15 minutes'<=clock_timestamp() then
     update private.studio_media_assets set state='rejected' where id=p_id and owner_id=caller and state='reserved'
       and expires_at+interval '15 minutes'<=clock_timestamp();
   elsif not (asset.state='rejected' and asset.expires_at+interval '15 minutes'<=clock_timestamp()) then
     raise exception 'Media unavailable' using errcode='42501';
   end if;
 end if;
 return jsonb_build_object('asset_id',p_id,'owner_id',caller,'session_id',(claims->>'session_id')::uuid,
   'action',p_action,'issued_at',current_epoch,'expires_at',expiry);
end; $$;
create function public.authorize_media_grant(p_id uuid,p_action text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select blog_internal.authorize_media_grant(p_id,p_action); $$;
revoke all on function blog_internal.authorize_media_grant(uuid,text),public.authorize_media_grant(uuid,text)
 from public,anon,authenticated,service_role,studio_media_worker;
grant execute on function blog_internal.authorize_media_grant(uuid,text),public.authorize_media_grant(uuid,text) to authenticated;

-- Old locally issued proof capabilities lacked action. Require explicit
-- action for all new capabilities; update synthetic tests in this change.
create or replace function blog_internal.media_worker_scope(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb := (select auth.jwt());
 issued bigint; expiry bigint; current_epoch bigint := floor(extract(epoch from now()))::bigint;
begin
 if p_id is null or claims->>'role' is distinct from 'studio_media_worker'
    or claims->>'studio_asset_id' is distinct from p_id::text
    or coalesce(claims->>'studio_media_action','') not in ('promote','cleanup')
    or jsonb_typeof(claims->'iat') is distinct from 'number'
    or jsonb_typeof(claims->'exp') is distinct from 'number'
    or coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then return false; end if;
 issued := (claims->>'iat')::bigint; expiry := (claims->>'exp')::bigint;
 return issued<=current_epoch and expiry>current_epoch and expiry>issued
   and expiry-issued<=120 and private.is_blog_admin();
end; $$;
create or replace function blog_internal.media_worker_object(p_name text,p_bucket text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.studio_media_assets a
   where a.owner_id=(select auth.uid()) and a.quarantine_key=p_name
    and blog_internal.media_worker_scope(a.id)
    and (
      ((select auth.jwt())->>'studio_media_action'='promote' and (
       (p_action='read' and p_bucket in ('studio-media-quarantine','studio-media-verified')
        and (a.state='verified' or (a.state='reserved' and a.expires_at>now())))
       or (p_action='write' and p_bucket='studio-media-verified' and a.state='reserved' and a.expires_at>now())
       or (p_action='cleanup' and p_bucket='studio-media-quarantine' and a.state='verified')))
      or ((select auth.jwt())->>'studio_media_action'='cleanup'
        and a.state='rejected' and a.expires_at+interval '15 minutes'<=now()
        and p_bucket in ('studio-media-quarantine','studio-media-verified')
        and p_action='cleanup')
    ));
$$;
-- Existing narrow get/commit implementations are renamed and wrapped to
-- reject cleanup action before entering any metadata or promotion operation.
alter function blog_internal.get_media_worker_asset(uuid) rename to get_media_worker_asset_promotion;
alter function blog_internal.commit_media_worker_asset(uuid,text,integer,integer,integer) rename to commit_media_worker_asset_promotion;
revoke all on function blog_internal.get_media_worker_asset_promotion(uuid),
 blog_internal.commit_media_worker_asset_promotion(uuid,text,integer,integer,integer)
 from public,anon,authenticated,service_role,studio_media_worker;
create function blog_internal.get_media_worker_asset(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.jwt())->>'studio_media_action' is distinct from 'promote' then
   raise exception 'Media unavailable' using errcode='42501'; end if;
 return blog_internal.get_media_worker_asset_promotion(p_id);
end; $$;
create function blog_internal.commit_media_worker_asset(p_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if (select auth.jwt())->>'studio_media_action' is distinct from 'promote' then
   raise exception 'Media unavailable' using errcode='42501'; end if;
 return blog_internal.commit_media_worker_asset_promotion(p_id,p_sha256,p_byte_size,p_width,p_height);
end; $$;
revoke all on function blog_internal.get_media_worker_asset(uuid),blog_internal.commit_media_worker_asset(uuid,text,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function blog_internal.get_media_worker_asset(uuid),blog_internal.commit_media_worker_asset(uuid,text,integer,integer,integer) to studio_media_worker;
-- Recreate wrappers explicitly to bind the new function OIDs.
create or replace function public.get_media_worker_asset(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.get_media_worker_asset(p_id); $$;
create or replace function public.commit_media_worker_asset(p_id uuid,p_sha256 text,p_byte_size integer,p_width integer,p_height integer) returns jsonb
language sql volatile security invoker set search_path='' as $$ select blog_internal.commit_media_worker_asset(p_id,p_sha256,p_byte_size,p_width,p_height); $$;

-- Cleanup may SELECT metadata only as part of exact bulk delete, never GET.
alter policy studio_worker_select on storage.objects using (
 (blog_internal.media_worker_object(name,bucket_id,'read') and storage.allow_any_operation(array['object.get_authenticated','object.upload','object.delete_many']))
 or (blog_internal.media_worker_object(name,bucket_id,'cleanup') and storage.allow_only_operation('object.delete_many')));
alter policy studio_worker_select_guard on storage.objects using (
 (blog_internal.media_worker_object(name,bucket_id,'read') and storage.allow_any_operation(array['object.get_authenticated','object.upload','object.delete_many']))
 or (blog_internal.media_worker_object(name,bucket_id,'cleanup') and storage.allow_only_operation('object.delete_many')));
