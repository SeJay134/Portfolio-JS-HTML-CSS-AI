-- Only used in a disposable CI database, never a migration or remote seed.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
('91000000-0000-0000-0000-000000000001','api-owner@example.invalid',now(),'{}','{"provider":"google","providers":["google"]}'),
('91000000-0000-0000-0000-000000000002','api-user@example.invalid',now(),'{"role":"admin"}','{"provider":"google","providers":["google"]}');
insert into auth.identities(provider_id,user_id,identity_data,provider) values
('api-owner','91000000-0000-0000-0000-000000000001','{"sub":"api-owner","email":"api-owner@example.invalid","email_verified":true}','google'),
('api-user','91000000-0000-0000-0000-000000000002','{"sub":"api-user","email":"api-user@example.invalid","email_verified":true}','google');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',now(),now()),
('92000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002',now(),now());
insert into private.admin_allowlist(email) values ('api-owner@example.invalid');
insert into public.blog_categories(id,slug,name) values
('93000000-0000-0000-0000-000000000001','api-public','Public API category'),
('93000000-0000-0000-0000-000000000002','api-private','Private API category');
insert into public.blog_tags(id,slug,name) values
('94000000-0000-0000-0000-000000000001','api-public','Public API tag'),
('94000000-0000-0000-0000-000000000002','api-private','Private API tag');
insert into public.blog_posts(id,author_name,category_id,slug,title,description,content,status,published_at) values
('95000000-0000-0000-0000-000000000001','Fixture','93000000-0000-0000-0000-000000000001','api-live','Public fixture','Visible','[{"type":"paragraph","text":"Public body"}]','published',now()-interval '1 day'),
('95000000-0000-0000-0000-000000000002','Fixture','93000000-0000-0000-0000-000000000002','api-draft','Private draft','Secret','[{"type":"paragraph","text":"Private body"}]','draft',null),
('95000000-0000-0000-0000-000000000003','Fixture','93000000-0000-0000-0000-000000000002','api-archive','Private archive','Secret','[]','archived',now()-interval '1 day'),
('95000000-0000-0000-0000-000000000004','Fixture','93000000-0000-0000-0000-000000000002','api-future','Private future','Secret','[{"type":"paragraph","text":"Private body"}]','published',now()+interval '1 day');
insert into public.blog_post_tags values
('95000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001'),
('95000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002');
