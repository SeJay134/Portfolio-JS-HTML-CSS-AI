-- Phase 3D.1: private media quarantine. No public reads, promotion or client-side verification.
-- Bucket configuration only; never mutate storage.objects data through SQL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('studio-media-quarantine','studio-media-quarantine',false,5000000,array['image/jpeg']),
 ('studio-media-verified','studio-media-verified',false,5000000,array['image/jpeg']);

create table private.studio_media_assets (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id) on delete restrict,
 quarantine_key text generated always as (owner_id::text||'/'||id::text||'.jpg') stored unique,
 state text not null default 'reserved' check(state in ('reserved','verified','rejected')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 hour',
 verified_key text unique,
 byte_size integer,
 width integer,
 height integer,
 sha256 text,
 check (
   (state='verified' and verified_key is not null and verified_key=owner_id::text||'/'||id::text||'.jpg'
    and byte_size is not null and byte_size between 1 and 5000000
    and width is not null and width between 1 and 2200
    and height is not null and height between 1 and 2200
    and sha256 is not null and sha256 ~ '^[0-9a-f]{64}$')
   or (state in ('reserved','rejected') and verified_key is null and byte_size is null
       and width is null and height is null and sha256 is null)
 )
);
create index studio_media_owner_idx on private.studio_media_assets(owner_id,created_at desc);
alter table private.studio_media_assets enable row level security;
revoke all on private.studio_media_assets from public,anon,authenticated;

-- Fixed worst-case allocation: 20 * 5,000,000 bytes per owner. Expired and
-- rejected reservations still count until a separately reviewed cleanup job.
create function blog_internal.reserve_studio_media(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); asset private.studio_media_assets%rowtype;
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 if p_id is null then raise exception 'Invalid media ID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-media-owner:'||caller::text,0));
 perform pg_advisory_xact_lock(hashtextextended('studio-media-id:'||p_id::text,1));
 if not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 select * into asset from private.studio_media_assets where id=p_id;
 if found then
   if asset.owner_id<>caller then raise exception 'Media not available' using errcode='42501'; end if;
   if asset.state<>'reserved' or asset.expires_at<=now() then raise exception 'Reservation no longer available' using errcode='22023'; end if;
 else
   if (select count(*) from private.studio_media_assets where owner_id=caller)>=20 then
     raise exception 'Media reservation limit reached' using errcode='22023';
   end if;
   insert into private.studio_media_assets(id,owner_id) values(p_id,caller) returning * into asset;
 end if;
 return jsonb_build_object('id',asset.id,'object_key',asset.quarantine_key,'expires_at',asset.expires_at,
  'max_bytes',5000000,'state','reserved');
end; $$;

create function public.reserve_studio_media(p_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select blog_internal.reserve_studio_media(p_id);
$$;

-- Called only by Storage INSERT policy. No read, overwrite or signing permission.
create function blog_internal.can_upload_studio_media(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and private.is_blog_admin() and exists(
  select 1 from private.studio_media_assets a
  where a.owner_id=(select auth.uid()) and a.quarantine_key=p_name
   and a.state='reserved' and a.expires_at>now()
 );
$$;
revoke all on function public.reserve_studio_media(uuid),blog_internal.reserve_studio_media(uuid),
 blog_internal.can_upload_studio_media(text) from public,anon,authenticated;
grant execute on function public.reserve_studio_media(uuid),blog_internal.reserve_studio_media(uuid),
 blog_internal.can_upload_studio_media(text) to authenticated;

-- Restrictive guards prevent other permissive policies from accidentally
-- exposing the media buckets. Existing unrelated buckets remain unaffected.
create policy studio_media_reserved_insert on storage.objects for insert to authenticated
 with check(bucket_id='studio-media-quarantine' and blog_internal.can_upload_studio_media(name));
create policy studio_media_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id not in ('studio-media-quarantine','studio-media-verified')
   or (bucket_id='studio-media-quarantine' and blog_internal.can_upload_studio_media(name)));
create policy studio_media_anon_insert_guard on storage.objects as restrictive for insert to anon
 with check(bucket_id not in ('studio-media-quarantine','studio-media-verified'));
create policy studio_media_read_guard on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id not in ('studio-media-quarantine','studio-media-verified'));
create policy studio_media_update_guard on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id not in ('studio-media-quarantine','studio-media-verified'))
 with check(bucket_id not in ('studio-media-quarantine','studio-media-verified'));
create policy studio_media_delete_guard on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id not in ('studio-media-quarantine','studio-media-verified'));
create policy studio_media_bucket_update_guard on storage.buckets as restrictive for update to anon,authenticated
 using(id not in ('studio-media-quarantine','studio-media-verified'))
 with check(id not in ('studio-media-quarantine','studio-media-verified'));
create policy studio_media_bucket_delete_guard on storage.buckets as restrictive for delete to anon,authenticated
 using(id not in ('studio-media-quarantine','studio-media-verified'));
