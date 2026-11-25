-- Additive migration; no real data or admin enrollment.
create table private.admin_allowlist (
 email text primary key check (email=lower(btrim(email)) and length(email) between 3 and 320 and position('@' in email)>1),
 enabled boolean not null default true,
 user_id uuid unique references auth.users(id) on delete restrict,
 google_subject text unique,
 created_at timestamptz not null default now(),
 check ((user_id is null)=(google_subject is null)),
 check (google_subject is null or length(btrim(google_subject))>0)
);
alter table private.admin_allowlist enable row level security;
revoke all on private.admin_allowlist from public,anon,authenticated;
revoke all on schema private from public,anon,authenticated;
-- Policy-only predicate; checks live DB state, never client metadata.
create function private.is_blog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists (
 select 1 from public.profiles p
 join auth.users u on u.id=p.id
 join private.admin_allowlist a on a.user_id=u.id
 join auth.identities i on i.user_id=u.id and i.provider='google' and i.provider_id=a.google_subject
 where p.id=(select auth.uid()) and p.role='admin' and p.status='active'
 and a.enabled and not u.is_anonymous and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now())
 and u.email_confirmed_at is not null and lower(u.email)=a.email
 and lower(i.identity_data->>'email')=a.email and i.identity_data->>'email_verified'='true');
$$;
revoke all on function private.is_blog_admin() from public,anon,authenticated;
grant execute on function private.is_blog_admin() to authenticated;

create table public.blog_categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (length(slug)<=120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check (length(btrim(name)) between 1 and 100),
 created_at timestamptz not null default now()
);
create table public.blog_tags (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (length(slug)<=120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check (length(btrim(name)) between 1 and 100),
 created_at timestamptz not null default now()
);
create table public.blog_posts (
 id uuid primary key default gen_random_uuid(),
 author_name text not null check (length(btrim(author_name)) between 1 and 160),
 category_id uuid references public.blog_categories(id) on delete restrict,
 slug text not null unique check (length(slug)<=160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check (length(btrim(title)) between 1 and 240),
 description text not null default '' check (length(description)<=2000),
 content jsonb not null default '[]'::jsonb check (jsonb_typeof(content)='array' and octet_length(content::text)<=1048576),
 cover_image text, cover_alt text, cover_width integer, cover_height integer,
 status text not null default 'draft' check (status in ('draft','published','archived')),
 featured boolean not null default false,
 reading_minutes integer not null default 1 check (reading_minutes between 1 and 1440),
 seo_title text check (length(seo_title)<=240),
 seo_description text check (length(seo_description)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 published_at timestamptz,
 constraint blog_cover_complete check (
 (cover_image is null and cover_alt is null and cover_width is null and cover_height is null)
 or (cover_image is not null and cover_alt is not null and cover_width is not null and cover_height is not null
 and length(btrim(cover_alt)) between 1 and 500 and cover_width between 1 and 20000 and cover_height between 1 and 20000
 and cover_image ~ '^/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$' and cover_image !~ '(^|/)[.][.](/|$)')),
 constraint blog_publication_complete check (
 status <> 'published' or (published_at is not null and category_id is not null
 and length(btrim(description))>0 and jsonb_array_length(content)>0))
);
-- Public byline does not reveal private account UUID.
create table private.blog_post_authors (
 post_id uuid primary key references public.blog_posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete restrict
);
alter table private.blog_post_authors enable row level security;
revoke all on private.blog_post_authors from public,anon,authenticated;
create table public.blog_post_tags (
 post_id uuid not null references public.blog_posts(id) on delete cascade,
 tag_id uuid not null references public.blog_tags(id) on delete restrict,
 primary key(post_id,tag_id)
);
create index blog_posts_category_idx on public.blog_posts(category_id);
create index blog_posts_published_idx on public.blog_posts(published_at desc,id) where status='published';
create index blog_posts_status_updated_idx on public.blog_posts(status,updated_at desc);
create index blog_post_tags_tag_idx on public.blog_post_tags(tag_id,post_id);
create index blog_post_authors_author_idx on private.blog_post_authors(author_id);
create function private.blog_record_author() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is not null then
  if not private.is_blog_admin() then
   raise exception 'Blog administrator required' using errcode='42501';
  end if;
  insert into private.blog_post_authors(post_id,author_id) values(new.id,(select auth.uid()));
 end if;
 return new;
end;
$$;
revoke all on function private.blog_record_author() from public,anon,authenticated;
create trigger blog_record_author after insert on public.blog_posts for each row execute function private.blog_record_author();
create function private.blog_touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now(); return new; end;
$$;
revoke all on function private.blog_touch_updated_at() from public,anon,authenticated;
create trigger blog_touch_updated_at before update on public.blog_posts for each row execute function private.blog_touch_updated_at();
alter table public.blog_posts enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_post_tags enable row level security;
revoke all on public.blog_posts,public.blog_categories,public.blog_tags,public.blog_post_tags from public,anon,authenticated;
grant select on public.blog_posts,public.blog_categories,public.blog_tags,public.blog_post_tags to anon,authenticated;
grant insert,update,delete on public.blog_posts,public.blog_categories,public.blog_tags,public.blog_post_tags to authenticated;
create policy blog_posts_public_read on public.blog_posts for select to anon,authenticated
using (status='published' and published_at<=now());
create policy blog_categories_public_read on public.blog_categories for select to anon,authenticated
using (exists(select 1 from public.blog_posts p where p.category_id=blog_categories.id and p.status='published' and p.published_at<=now()));
create policy blog_tags_public_read on public.blog_tags for select to anon,authenticated
using (exists(select 1 from public.blog_post_tags pt join public.blog_posts p on p.id=pt.post_id where pt.tag_id=blog_tags.id and p.status='published' and p.published_at<=now()));
create policy blog_post_tags_public_read on public.blog_post_tags for select to anon,authenticated
using (exists(select 1 from public.blog_posts p where p.id=blog_post_tags.post_id and p.status='published' and p.published_at<=now()));
create policy blog_posts_admin_all on public.blog_posts for all to authenticated
using ((select private.is_blog_admin())) with check ((select private.is_blog_admin()));
create policy blog_categories_admin_all on public.blog_categories for all to authenticated
using ((select private.is_blog_admin())) with check ((select private.is_blog_admin()));
create policy blog_tags_admin_all on public.blog_tags for all to authenticated
using ((select private.is_blog_admin())) with check ((select private.is_blog_admin()));
create policy blog_post_tags_admin_all on public.blog_post_tags for all to authenticated
using ((select private.is_blog_admin())) with check ((select private.is_blog_admin()));
