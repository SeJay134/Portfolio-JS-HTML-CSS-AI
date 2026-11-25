begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('60000000-0000-0000-0000-000000000001','enrollment1@example.invalid',now(),'{"role":"admin"}'),
('60000000-0000-0000-0000-000000000002','enrollment2@example.invalid',now(),'{"role":"admin"}'),
('60000000-0000-0000-0000-000000000003','enrollment3@example.invalid',now(),'{"role":"admin"}'),
('60000000-0000-0000-0000-000000000004','enrollment4@example.invalid',now(),'{"role":"admin"}'),
('60000000-0000-0000-0000-000000000005','enrollment5@example.invalid',now(),'{"role":"admin"}'),
('60000000-0000-0000-0000-000000000006','enrollment6@example.invalid',now(),'{"role":"admin"}');
insert into auth.identities(provider_id,user_id,identity_data,provider)
select 'enroll-'||right(id::text,1),id,jsonb_build_object('sub','enroll-'||right(id::text,1),'email',email,'email_verified',right(id::text,1)<>'3'),'google'
from auth.users where id::text like '60000000-0000-0000-0000-00000000000%';
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('70000000-0000-0000-0000-00000000000'||right(id::text,1))::uuid,id,now(),now()
from auth.users where id::text like '60000000-0000-0000-0000-00000000000%';
insert into private.admin_allowlist(email,enabled) values
('enrollment1@example.invalid',true),('enrollment3@example.invalid',true),('enrollment4@example.invalid',true),('enrollment5@example.invalid',false),('enrollment6@example.invalid',true);
update public.profiles set status='blocked' where id='60000000-0000-0000-0000-000000000004';
select ok(not has_schema_privilege('authenticated','private','USAGE'),'private schema remains closed');
select ok(not has_table_privilege('authenticated','private.admin_allowlist','UPDATE'),'no client allowlist writes');
select ok(not (select prosecdef from pg_proc where oid='public.resolve_blog_admin()'::regprocedure),'public RPC is invoker');
set local role anon;
select throws_ok($q$select public.resolve_blog_admin()$q$,'42501',null,'anonymous RPC denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'not allowlisted cannot enroll');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000003';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000003","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'unverified cannot enroll');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000004';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000004","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'blocked cannot enroll');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000005';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000005","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000005","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'disabled cannot enroll');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"bad-session","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'malformed session fails closed');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'another user session denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"password"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'password session denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000001","app_metadata":{"provider":"github"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'non-Google session denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),true,'first verified enrollment succeeds');
select is(public.resolve_blog_admin(),true,'returning enrollment is idempotent');
select is((select role from public.profiles where id=auth.uid()),'admin','profile role assigned by DB');
select lives_ok($q$insert into public.blog_posts(author_name,slug,title) values('Fixture','admin-draft','Draft')$q$,'active session can write');
reset role;
select is((select user_id from private.admin_allowlist where email='enrollment1@example.invalid'),'60000000-0000-0000-0000-000000000001'::uuid,'UUID permanently bound');
select is((select google_subject from private.admin_allowlist where email='enrollment1@example.invalid'),'enroll-1','Google subject bound');
-- Primary Google claim is insufficient if a different identity is linked.
insert into auth.identities(provider_id,user_id,identity_data,provider)
values ('linked-other','60000000-0000-0000-0000-000000000001','{"sub":"linked-other","email":"enrollment1@example.invalid","email_verified":true}','github');
set local role authenticated;
select is(public.resolve_blog_admin(),false,'linked non-Google identity denies admin even with Google claim');
select is((select count(*) from public.blog_posts where slug='admin-draft'),0::bigint,'linked identity cannot read draft');
reset role;
delete from auth.identities where provider='github' and provider_id='linked-other';
-- OAuth server clients are a different trust boundary. A signed client_id
-- claim alone must not permit admin access even with a live first-party session.
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"client_id":"80000000-0000-0000-0000-000000000001"}';
set local role authenticated;
select is(public.resolve_blog_admin(),false,'third-party OAuth token denied');
reset role;
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
-- Session revocation blocks both RPC and actual RLS, even on cached JWT.
delete from auth.sessions where id='70000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.resolve_blog_admin(),false,'deleted session denied');
select is((select count(*) from public.blog_posts where slug='admin-draft'),0::bigint,'revoked token cannot read draft');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Fixture','revoked','Denied')$q$,'42501',null,'revoked token cannot write');
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',now(),now(),now()-interval '1 minute');
set local role authenticated;
select is(public.resolve_blog_admin(),false,'expired session denied');
reset role;
update auth.sessions set not_after=null where id='70000000-0000-0000-0000-000000000001';
update public.profiles set role='user' where id='60000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.resolve_blog_admin(),false,'explicit demotion not undone by login');
reset role;
update public.profiles set role='admin' where id='60000000-0000-0000-0000-000000000001';
update private.admin_allowlist set enabled=false where email='enrollment1@example.invalid';
set local role authenticated;
select is(public.resolve_blog_admin(),false,'disabled binding cannot reactivate');
reset role;
-- Matching email with a bound different account must never transfer access.
update private.admin_allowlist set user_id='60000000-0000-0000-0000-000000000002',google_subject='enroll-2' where email='enrollment6@example.invalid';
set local role authenticated;
set local request.jwt.claim.sub='60000000-0000-0000-0000-000000000006';
set local request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000006","role":"authenticated","session_id":"70000000-0000-0000-0000-000000000006","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin","email":"fixture1@example.invalid"}}';
select is(public.resolve_blog_admin(),false,'bound email cannot transfer to different account');
reset role;
select * from finish();
rollback;
