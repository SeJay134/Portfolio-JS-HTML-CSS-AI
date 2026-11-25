begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000001','fixture1@example.invalid',now(),'{"role":"admin"}'),
('10000000-0000-0000-0000-000000000002','fixture2@example.invalid',now(),'{"role":"admin"}'),
('10000000-0000-0000-0000-000000000003','fixture3@example.invalid',now(),'{"role":"admin"}'),
('10000000-0000-0000-0000-000000000004','fixture4@example.invalid',now(),'{"role":"admin"}'),
('10000000-0000-0000-0000-000000000005','fixture5@example.invalid',now(),'{"role":"admin"}');
insert into auth.identities(provider_id,user_id,identity_data,provider)
select 'fixture-'||right(id::text,1),id,jsonb_build_object('sub','fixture-'||right(id::text,1),'email',email,'email_verified',right(id::text,1)<>'4'),'google'
from auth.users where id::text like '10000000-0000-0000-0000-00000000000%';
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('50000000-0000-0000-0000-00000000000'||right(id::text,1))::uuid,id,now(),now()
from auth.users where id::text like '10000000-0000-0000-0000-00000000000%';
update public.profiles set role='admin' where id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005');
update public.profiles set status='blocked' where id='10000000-0000-0000-0000-000000000003';
insert into private.admin_allowlist(email,user_id,google_subject) values
('fixture2@example.invalid','10000000-0000-0000-0000-000000000002','fixture-2'),
('fixture3@example.invalid','10000000-0000-0000-0000-000000000003','fixture-3'),
('fixture4@example.invalid','10000000-0000-0000-0000-000000000004','fixture-4'),
('fixture5@example.invalid',null,null);
insert into public.blog_categories(id,slug,name) values
('20000000-0000-0000-0000-000000000001','public-category','Public'),
('20000000-0000-0000-0000-000000000002','private-category','Private');
insert into public.blog_tags(id,slug,name) values
('30000000-0000-0000-0000-000000000001','public-tag','Public'),
('30000000-0000-0000-0000-000000000002','private-tag','Private');
insert into public.blog_posts(id,author_name,category_id,slug,title,description,content,status,published_at) values
('40000000-0000-0000-0000-000000000001','Fixture','20000000-0000-0000-0000-000000000001','live','Live','Visible','[{"type":"paragraph","text":"live"}]','published',now()-interval '1 day'),
('40000000-0000-0000-0000-000000000002','Fixture','20000000-0000-0000-0000-000000000002','draft','Draft','Secret','[]','draft',null),
('40000000-0000-0000-0000-000000000003','Fixture','20000000-0000-0000-0000-000000000002','archived','Archived','Secret','[]','archived',now()-interval '1 day'),
('40000000-0000-0000-0000-000000000004','Fixture','20000000-0000-0000-0000-000000000002','future','Future','Secret','[{"type":"paragraph","text":"future"}]','published',now()+interval '1 day');
insert into public.blog_post_tags values
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('blog_posts','blog_categories','blog_tags','blog_post_tags') and c.relrowsecurity),4::bigint,'all public tables use RLS');
select ok(not has_schema_privilege('authenticated','private','USAGE'),'private schema closed');
select ok(not has_table_privilege('authenticated','private.admin_allowlist','SELECT'),'allowlist inaccessible');
select ok(not has_table_privilege('authenticated','private.blog_post_authors','SELECT'),'author UUID private');
set local role anon;
select is((select array_agg(slug) from public.blog_posts),array['live']::text[],'guest sees only live');
select is((select array_agg(slug) from public.blog_categories),array['public-category']::text[],'guest sees public categories only');
select is((select array_agg(slug) from public.blog_tags),array['public-tag']::text[],'guest sees public tags only');
select is((select count(*) from public.blog_post_tags),1::bigint,'guest sees public tag links only');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Guest','guest','Guest')$q$,'42501',null,'guest cannot insert');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"role":"admin"},"session_id":"50000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is((select count(*) from public.blog_posts),1::bigint,'forged role metadata cannot read drafts');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('User','user','User')$q$,'42501',null,'user cannot insert');
select throws_ok($q$update public.blog_posts set title='Hijacked' where slug='live'$q$,'42501',null,'user cannot update');
select throws_ok($q$delete from public.blog_posts where slug='live'$q$,'42501',null,'user cannot delete');
select throws_ok($q$insert into public.blog_categories(slug,name) values('bad','Bad')$q$,'42501',null,'user cannot create taxonomy');
select throws_ok($q$update public.profiles set role='admin' where id=auth.uid()$q$,'42501',null,'no self promotion');
select throws_ok($q$select * from private.admin_allowlist$q$,'42501',null,'user cannot read allowlist');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"admin"},"session_id":"50000000-0000-0000-0000-000000000003","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is((select count(*) from public.blog_posts),1::bigint,'blocked admin denied draft access');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Denied','denied','Denied')$q$,'42501',null,'blocked admin cannot write');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","user_metadata":{"role":"admin"},"session_id":"50000000-0000-0000-0000-000000000004","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is((select count(*) from public.blog_posts),1::bigint,'unverified admin denied draft access');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Denied','denied','Denied')$q$,'42501',null,'unverified admin cannot write');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","user_metadata":{"role":"admin"},"session_id":"50000000-0000-0000-0000-000000000005","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is((select count(*) from public.blog_posts),1::bigint,'unbound admin denied draft access');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Denied','denied','Denied')$q$,'42501',null,'unbound admin cannot write');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","user_metadata":{"role":"admin"},"session_id":"50000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is((select count(*) from public.blog_posts),4::bigint,'verified bound admin sees all');
select is((select count(*) from public.blog_tags),2::bigint,'admin sees private taxonomy');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Fixture','new-draft','Draft')$q$,'42501',null,'admin cannot bypass publication insert');
select throws_ok($q$update public.blog_posts set title='Updated' where slug='live'$q$,'42501',null,'admin cannot bypass publication update');
select throws_ok($q$delete from public.blog_posts where slug='live'$q$,'42501',null,'admin cannot bypass publication delete');
select throws_ok($q$update public.blog_posts set status='published' where slug='draft'$q$,'42501',null,'admin cannot bypass publication transition');
select throws_ok($q$insert into public.blog_categories(slug,name) values('invalid','Bad')$q$,'42501',null,'admin cannot bypass taxonomy creation');
select throws_ok($q$insert into public.blog_tags(slug,name) values('invalid','Bad')$q$,'42501',null,'admin cannot bypass tag creation');
select throws_ok($q$select * from private.admin_allowlist$q$,'42501',null,'admin cannot read allowlist');
reset role;
select ok(not exists(select 1 from public.blog_posts where slug='new-draft'),'direct admin insert created no post');
update private.admin_allowlist set enabled=false where email='fixture2@example.invalid';
set local role authenticated;
select is((select count(*) from public.blog_posts),1::bigint,'revocation works with unchanged JWT');
select throws_ok($q$insert into public.blog_posts(author_name,slug,title) values('Revoked','revoked','Revoked')$q$,'42501',null,'revoked admin cannot write');
reset role;
select * from finish();
rollback;
