begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is((select count(*) from storage.buckets where id in ('studio-media-quarantine','studio-media-verified') and not public and file_size_limit=5000000 and allowed_mime_types=array['image/jpeg']),2::bigint,'both buckets private and bounded');
select ok(not has_table_privilege('authenticated','private.studio_media_assets','SELECT'),'no direct metadata read');
select ok(not has_table_privilege('authenticated','private.studio_media_assets','UPDATE'),'no direct verification');
select ok(not (select prosecdef from pg_proc where oid='public.reserve_studio_media(uuid)'::regprocedure),'public reservation RPC invoker');
insert into auth.users(id,email,email_confirmed_at) values
 ('62000000-0000-0000-0000-000000000001','media-owner@example.invalid',now()),
 ('62000000-0000-0000-0000-000000000002','media-other@example.invalid',now()),
 ('62000000-0000-0000-0000-000000000003','media-user@example.invalid',now());
insert into auth.identities(provider_id,user_id,identity_data,provider)
 select 'media-'||right(id::text,1),id,jsonb_build_object('sub','media-'||right(id::text,1),'email',email,'email_verified',true),'google'
 from auth.users where id::text like '62000000-0000-0000-0000-00000000000%';
insert into auth.sessions(id,user_id,created_at,updated_at)
 select ('72000000-0000-0000-0000-00000000000'||right(id::text,1))::uuid,id,now(),now()
 from auth.users where id::text like '62000000-0000-0000-0000-00000000000%';
insert into private.admin_allowlist(email) values('media-owner@example.invalid'),('media-other@example.invalid');
set local role anon;
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000001')$q$,'42501',null,'anonymous cannot reserve');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='62000000-0000-0000-0000-000000000003';
set local request.jwt.claims='{"sub":"62000000-0000-0000-0000-000000000003","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000003","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000001')$q$,'42501',null,'ordinary user cannot reserve');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='62000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is(public.resolve_blog_admin(),true,'owner enrolled');
select is(public.reserve_studio_media('82000000-0000-0000-0000-000000000001')->>'object_key','62000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001.jpg','server-generated exact key');
select is(public.reserve_studio_media('82000000-0000-0000-0000-000000000001')->>'state','reserved','same reservation idempotent');
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001.jpg'),true,'exact owned key allowed');
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/other.jpg'),false,'unreserved key denied');
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/../82000000-0000-0000-0000-000000000001.jpg'),false,'traversal denied');
reset role;
select is((select count(*) from private.studio_media_assets),1::bigint,'one allocation');
set local role authenticated;
set local request.jwt.claim.sub='62000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is(public.resolve_blog_admin(),true,'second admin enrolled');
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001.jpg'),false,'other admin cannot upload to owner key');
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000001')$q$,'42501',null,'other admin cannot reserve existing ID');
reset role;
update private.studio_media_assets set expires_at=now()-interval '1 second';
set local role authenticated;
set local request.jwt.claim.sub='62000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"72000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001.jpg'),false,'expired allocation denied');
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000001')$q$,'22023',null,'no expired reservation renewal');
reset role;
insert into private.studio_media_assets(id,owner_id)
 select ('83000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'62000000-0000-0000-0000-000000000001'::uuid from generate_series(1,19) n;
set local role authenticated;
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000002')$q$,'22023',null,'reservation quota enforced');
reset role;
delete from auth.sessions where id='72000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(blog_internal.can_upload_studio_media('62000000-0000-0000-0000-000000000001/83000000-0000-0000-0000-000000000001.jpg'),false,'revoked session cannot upload');
select throws_ok($q$select public.reserve_studio_media('82000000-0000-0000-0000-000000000003')$q$,'42501',null,'revoked session cannot reserve');
reset role;
select * from finish();
rollback;
