begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('anon','private.studio_publication_media','SELECT'),'anon cannot read references');
select ok(not has_table_privilege('authenticated','private.studio_publication_media','INSERT'),'client cannot bind references');
select ok(not has_function_privilege('studio_media_worker','private.bind_studio_publication_media(uuid,integer)','EXECUTE'),'worker cannot bind');
select ok(not has_function_privilege('service_role','private.active_studio_publication_media(uuid)','EXECUTE'),'no delivery role yet');
select ok(not has_function_privilege('authenticated','private.prepare_studio_publication_media(uuid,integer)','EXECUTE'),'no browser manifest access');
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'unknown asset inactive');
-- Synthetic metadata only, no Storage object writes. Byte verification belongs to real gateway tests.
insert into auth.users(id,email,email_confirmed_at) values
 ('62000000-0000-0000-0000-000000000001','media-ref@example.invalid',now());
insert into private.studio_media_assets(id,owner_id,state,verified_key,byte_size,width,height,sha256)
values ('82000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','verified',
 '62000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001.jpg',100,96,64,repeat('a',64));
select set_config('test.media_doc',$doc{"id":"96000000-0000-0000-0000-000000000001","version":2,"title":"Fixture","description":"Fixture","slug":"media-fixture","category":"Test","tags":"","author":"Fixture","seoTitle":"","seoDescription":"","cover":null,"blocks":[{"id":"97000000-0000-0000-0000-000000000001","kind":"image","text":"","language":"","runs":[{"text":""}],"images":[{"assetId":"82000000-0000-0000-0000-000000000001","alt":"Fixture photo","caption":"Caption"}]}]}$doc$,true);
insert into private.studio_drafts(id,owner_id,revision,document) values
 ('96000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',1,current_setting('test.media_doc')::jsonb);
insert into private.studio_draft_revisions(draft_id,revision,request_id,document) values
 ('96000000-0000-0000-0000-000000000001',1,'98000000-0000-0000-0000-000000000001',current_setting('test.media_doc')::jsonb);
select is(private.prepare_studio_publication_media('96000000-0000-0000-0000-000000000001',1)->'blocks',
 '[{"type":"image","version":1,"image":{"src":"/blog/media/82000000-0000-0000-0000-000000000001.jpg","alt":"Fixture photo","caption":"Caption","width":96,"height":64}}]'::jsonb,'projection excludes private key and owner');
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'verified draft asset not eligible');
select throws_ok($q$select private.studio_public_text(current_setting('test.media_doc')::jsonb)$q$,'22023',null,'existing publication guard remains enabled');
insert into public.blog_categories(id,slug,name) values ('93000000-0000-0000-0000-000000000001','media-test','Test');
insert into public.blog_posts(id,author_name,category_id,slug,title,description,content,status,published_at)
 values ('95000000-0000-0000-0000-000000000001','Fixture','93000000-0000-0000-0000-000000000001','media-fixture','Fixture','Fixture',
 '[{"type":"paragraph","text":"Not the image"}]','published',now());
insert into private.studio_publications(draft_id,post_id,source_revision,generation) values
 ('96000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001',1,1);
insert into private.studio_publication_events(draft_id,generation,request_id,action,expected_revision,source_revision,receipt) values
 ('96000000-0000-0000-0000-000000000001',1,'98000000-0000-0000-0000-000000000002','publish',1,1,'{}');
select throws_ok($q$select private.bind_studio_publication_media('96000000-0000-0000-0000-000000000001',1)$q$,'22023',null,'mismatched projection denied');
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'mismatch creates no eligibility');
update public.blog_posts set content=private.prepare_studio_publication_media('96000000-0000-0000-0000-000000000001',1)->'blocks'
 where id='95000000-0000-0000-0000-000000000001';
select lives_ok($q$select private.bind_studio_publication_media('96000000-0000-0000-0000-000000000001',1)$q$,'bind exact publication');
select lives_ok($q$select private.bind_studio_publication_media('96000000-0000-0000-0000-000000000001',1)$q$,'bind retry');
select is((select count(*) from private.studio_publication_media),1::bigint,'one distinct binding');
select ok(private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'current published generation eligible');
update public.blog_posts set status='draft',published_at=null where id='95000000-0000-0000-0000-000000000001';
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'unpublished asset inactive');
update public.blog_posts set status='published',published_at=now()+interval '1 day' where id='95000000-0000-0000-0000-000000000001';
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'future publication inactive');
update public.blog_posts set published_at=now() where id='95000000-0000-0000-0000-000000000001';
update private.studio_publications set generation=2 where draft_id='96000000-0000-0000-0000-000000000001';
select ok(not private.active_studio_publication_media('82000000-0000-0000-0000-000000000001'),'old generation inactive even when post published');
select throws_ok($q$select private.bind_studio_publication_media('96000000-0000-0000-0000-000000000001',1)$q$,'22023',null,'stale bind denied');
select * from finish();
rollback;
