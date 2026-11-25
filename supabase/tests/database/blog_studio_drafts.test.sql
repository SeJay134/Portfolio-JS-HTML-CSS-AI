begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
('61000000-0000-0000-0000-000000000001','draft-owner@example.invalid',now()),
('61000000-0000-0000-0000-000000000002','draft-other@example.invalid',now()),
('61000000-0000-0000-0000-000000000003','draft-ordinary@example.invalid',now());
insert into auth.identities(provider_id,user_id,identity_data,provider)
 select 'draft-'||right(id::text,1),id,jsonb_build_object('sub','draft-'||right(id::text,1),'email',email,'email_verified',true),'google'
 from auth.users where id::text like '61000000-0000-0000-0000-00000000000%';
insert into auth.sessions(id,user_id,created_at,updated_at)
 select ('71000000-0000-0000-0000-00000000000'||right(id::text,1))::uuid,id,now(),now()
 from auth.users where id::text like '61000000-0000-0000-0000-00000000000%';
insert into private.admin_allowlist(email) values('draft-owner@example.invalid'),('draft-other@example.invalid');
select set_config('test.studio_document',$doc${"id":"96000000-0000-0000-0000-000000000001","version":1,"title":"Private studio fixture","description":"Working copy","slug":"studio-fixture","category":"Test","tags":"SQL","author":"Fixture","seoTitle":"","seoDescription":"","blocks":[{"id":"97000000-0000-0000-0000-000000000001","kind":"paragraph","text":"","language":"","runs":[{"text":"Private body","bold":true,"href":"/blog/fixture/"}]}]}$doc$,true);
select ok(private.valid_studio_draft(current_setting('test.studio_document')::jsonb),'valid editor document');
select ok(not private.valid_studio_draft('{}'::jsonb),'missing fields');
select ok(not private.valid_studio_draft(current_setting('test.studio_document')::jsonb || '{"version":2}'::jsonb),'unknown version');
select ok(not private.valid_studio_draft(jsonb_set(current_setting('test.studio_document')::jsonb,'{blocks,0,runs,0,href}','"javascript:alert(1)"')),'unsafe link');
select ok(not private.valid_studio_draft(current_setting('test.studio_document')::jsonb || '{"slug":"../bad"}'::jsonb),'invalid slug');
select ok(not has_table_privilege('authenticated','private.studio_drafts','SELECT'),'no direct draft read');
select ok(not has_table_privilege('authenticated','private.studio_draft_revisions','UPDATE'),'no direct revision mutation');
select ok(not (select prosecdef from pg_proc where oid='public.save_studio_draft(uuid,integer,uuid,jsonb)'::regprocedure),'public RPC invoker');
set local role anon;
select throws_ok($q$select public.list_studio_drafts()$q$,'42501',null,'anonymous list denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='61000000-0000-0000-0000-000000000003';
set local request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000003","role":"authenticated","session_id":"71000000-0000-0000-0000-000000000003","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}],"user_metadata":{"role":"admin"}}';
select throws_ok($q$select public.list_studio_drafts()$q$,'42501',null,'ordinary list denied');
select throws_ok($q$select public.save_studio_draft('96000000-0000-0000-0000-000000000001',0,'98000000-0000-0000-0000-000000000001',current_setting('test.studio_document')::jsonb)$q$,'42501',null,'ordinary write denied');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='61000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"71000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is(public.resolve_blog_admin(),true,'owner enrolled');
select is(public.list_studio_drafts(),'[]'::jsonb,'empty list');
select is((public.save_studio_draft('96000000-0000-0000-0000-000000000001',0,'98000000-0000-0000-0000-000000000001',current_setting('test.studio_document')::jsonb)->>'revision')::int,1,'first save');
select is((public.save_studio_draft('96000000-0000-0000-0000-000000000001',0,'98000000-0000-0000-0000-000000000001',current_setting('test.studio_document')::jsonb)->>'revision')::int,1,'same request replay');
select throws_ok($q$select public.save_studio_draft('96000000-0000-0000-0000-000000000001',0,'98000000-0000-0000-0000-000000000002',current_setting('test.studio_document')::jsonb)$q$,'40001',null,'stale create conflict');
select throws_ok($q$select public.save_studio_draft('96000000-0000-0000-0000-000000000001',0,'98000000-0000-0000-0000-000000000001',current_setting('test.studio_document')::jsonb || '{"title":"Other"}')$q$,'22023',null,'request key cannot change document');
select is((public.save_studio_draft('96000000-0000-0000-0000-000000000001',1,'98000000-0000-0000-0000-000000000002',current_setting('test.studio_document')::jsonb || '{"title":"Revision two"}')->>'revision')::int,2,'second revision');
select is(public.get_studio_draft('96000000-0000-0000-0000-000000000001')->'document'->>'title','Revision two','latest restored');
select is(public.get_studio_draft('96000000-0000-0000-0000-000000000001',1)->'document'->>'title','Private studio fixture','old revision immutable');
select is(jsonb_array_length(public.list_studio_revisions('96000000-0000-0000-0000-000000000001')),2,'two revisions not three');
select is(jsonb_array_length(public.list_studio_drafts()),1,'one draft');
select is((select count(*) from public.blog_posts where slug='studio-fixture'),0::bigint,'no projection written');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='61000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"71000000-0000-0000-0000-000000000002","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select is(public.resolve_blog_admin(),true,'second admin enrolled');
select is(public.list_studio_drafts(),'[]'::jsonb,'another admin cannot list owner drafts');
select is(public.get_studio_draft('96000000-0000-0000-0000-000000000001'),null::jsonb,'another admin cannot read by ID');
select is(public.list_studio_revisions('96000000-0000-0000-0000-000000000001'),'[]'::jsonb,'another admin cannot list revisions');
select throws_ok($q$select public.save_studio_draft('96000000-0000-0000-0000-000000000001',2,'98000000-0000-0000-0000-000000000003',current_setting('test.studio_document')::jsonb)$q$,'42501',null,'another admin cannot overwrite');
reset role;
delete from auth.sessions where id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='61000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"71000000-0000-0000-0000-000000000001","app_metadata":{"provider":"google"},"amr":[{"method":"oauth"}]}';
select throws_ok($q$select public.get_studio_draft('96000000-0000-0000-0000-000000000001')$q$,'42501',null,'revoked read denied');
select throws_ok($q$select public.save_studio_draft('96000000-0000-0000-0000-000000000001',2,'98000000-0000-0000-0000-000000000003',current_setting('test.studio_document')::jsonb)$q$,'42501',null,'revoked save denied');
reset role;
select * from finish();
rollback;
