-- Candidate: atomic media projection, OFF by default.
create table private.studio_public_media_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.studio_public_media_gate(singleton,enabled) values(true,false);
alter table private.studio_public_media_gate enable row level security;
revoke all on private.studio_public_media_gate from public,anon,authenticated,service_role,studio_media_worker,studio_public_media_reader;
create function private.studio_public_blocks(p_draft uuid,p_revision integer,doc jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare b jsonb; runs jsonb; items jsonb; result jsonb:='[]'::jsonb; body text; lang text; href text; img jsonb; images jsonb;
begin
 if private.valid_studio_draft(doc) is distinct from true or not exists(select 1 from private.studio_draft_revisions r where r.draft_id=p_draft and r.revision=p_revision and r.document=doc) then
    raise exception 'Invalid publication revision' using errcode='22023'; end if;
 for b in select value from jsonb_array_elements(doc->'blocks') loop
   if b->>'kind' in ('image','gallery') then
     images:='[]'::jsonb;
     for img in select value from jsonb_array_elements(b->'images') loop
       images:=images||jsonb_build_array(private.studio_public_image(p_draft,p_revision,img));
     end loop;
     result:=result||jsonb_build_array(case when b->>'kind'='image'
       then jsonb_build_object('type','image','version',1,'image',images->0)
       else jsonb_build_object('type','gallery','version',1,'images',images) end);
   elsif b->>'kind'='paragraph' then
     select coalesce(jsonb_agg(value order by ord),'[]'::jsonb),
            coalesce(string_agg(value->>'text','' order by ord),'')
       into runs,body from jsonb_array_elements(b->'runs') with ordinality as x(value,ord)
       where value->>'text'<>'';
     if body !~ '[^[:space:]]' then continue; end if;
     -- Publication uses a conservative web-link subset. Reject rather than silently change a link.
     for href in select value->>'href' from jsonb_array_elements(runs) where value ? 'href' loop
       if left(href,1)='/' and left(href,2)<>'//' then null;
       elsif href ~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+[a-z]{2,}(:[0-9]{1,5})?([/?#].*)?$' then null;
       else raise exception 'Unsupported publication link' using errcode='22023'; end if;
     end loop;
     result:=result||jsonb_build_array(jsonb_build_object('type','rich-paragraph','version',1,'runs',runs));
   elsif b->>'kind'='list' then
     select coalesce(jsonb_agg(line order by ord),'[]'::jsonb) into items
       from (select regexp_replace(value,'^[[:space:]]+|[[:space:]]+$','','g') line,ord
         from unnest(string_to_array(b->>'text',chr(10))) with ordinality as x(value,ord)) t
       where line<>'';
     if jsonb_array_length(items)>0 then result:=result||jsonb_build_array(jsonb_build_object('type','list','items',items)); end if;
   elsif b->>'kind' in ('heading','quote','code') then
     body:=b->>'text';
     if body !~ '[^[:space:]]' then continue; end if;
     lang:=btrim(b->>'language');
     result:=result||jsonb_build_array(jsonb_build_object('type',b->>'kind','text',body)||
       case when b->>'kind'='code' and lang ~ '[^[:space:]]' then jsonb_build_object('language',lang) else '{}'::jsonb end);
   else raise exception 'Unsupported publication block' using errcode='22023';
   end if;
 end loop;
 if jsonb_array_length(result)=0 or octet_length(result::text)>1048576 then
   raise exception 'Invalid public content' using errcode='22023'; end if;
 return result;
end; $$;

revoke all on function private.studio_public_blocks(uuid,integer,jsonb)
 from public,anon,authenticated,service_role,studio_media_worker,studio_public_media_reader;
create or replace function blog_internal.change_studio_publication(p_id uuid,p_expected_revision integer,p_expected_generation integer,p_request_id uuid,p_action text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); d private.studio_drafts%rowtype;
 s private.studio_publications%rowtype; e private.studio_publication_events%rowtype; p public.blog_posts%rowtype;
 doc jsonb; blocks jsonb; cat uuid; tag uuid; tag_name text; cat_name text; tax_slug text; names text[];
 next_generation integer; source_rev integer; result jsonb; post_uuid uuid; reading integer; existing_name text; manifest jsonb; cover jsonb; media_enabled boolean:=false;
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Publication unavailable' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_action is null or p_action not in ('publish','unpublish','archive')
    or p_expected_revision is null or p_expected_revision not between 1 and 100
    or p_expected_generation is null or p_expected_generation not between 0 and 199 then
    raise exception 'Invalid publication request' using errcode='22023'; end if;
 -- Same lock order as draft saving. No publish of unsaved or stale edits.
 perform pg_advisory_xact_lock(hashtextextended('studio-owner:'||caller::text,0));
 perform pg_advisory_xact_lock(hashtextextended('studio-draft:'||p_id::text,1));
 select * into d from private.studio_drafts where id=p_id and owner_id=caller for update;
 if not found or not private.is_blog_admin() then raise exception 'Publication unavailable' using errcode='42501'; end if;
 select * into e from private.studio_publication_events where draft_id=p_id and request_id=p_request_id;
 if found then
   if e.action<>p_action or e.expected_revision<>p_expected_revision or e.generation<>p_expected_generation+1 then
      raise exception 'Publication request key already used' using errcode='22023'; end if;
   return e.receipt;
 end if;
 select * into s from private.studio_publications where draft_id=p_id for update;
 if d.revision<>p_expected_revision or coalesce(s.generation,0)<>p_expected_generation then
    raise exception 'Publication conflict' using errcode='40001'; end if;
 if s.post_id is not null then select * into p from public.blog_posts where id=s.post_id for update; end if;
 next_generation:=p_expected_generation+1;
 if p_action='publish' then
   -- Reserve two final generations for unpublish and archive. Exact retries
   -- above remain available even when the event budget is exhausted.
   if p_expected_generation>=198 then
     raise exception 'Publication limit reached; removal remains available' using errcode='22023'; end if;
   select document into doc from private.studio_draft_revisions where draft_id=p_id and revision=p_expected_revision;
   if doc is null or doc is distinct from d.document or doc->>'slug'='' or
      doc->>'slug' in ('media','readiness-probe') or
      not ((doc->>'title') ~ '[^[:space:]]' and (doc->>'description') ~ '[^[:space:]]'
       and (doc->>'author') ~ '[^[:space:]]' and (doc->>'category') ~ '[^[:space:]]') then
      raise exception 'Incomplete publication' using errcode='22023'; end if;
   if s.post_id is not null and p.slug<>doc->>'slug' then raise exception 'Published slug is immutable' using errcode='22023'; end if;
   if exists(select 1 from private.studio_document_asset_ids(doc)) then
     select enabled into media_enabled from private.studio_public_media_gate where singleton for share;
     if media_enabled is distinct from true then
       raise exception 'Media publication is not enabled' using errcode='22023'; end if;
     manifest:=private.prepare_studio_publication_media(p_id,p_expected_revision);
     cover:=manifest->'cover';
     if exists(select 1 from private.studio_revision_media r
       join private.studio_media_assets a on a.id=r.asset_id
       where r.draft_id=p_id and r.revision=p_expected_revision and not exists(
         select 1 from storage.objects o where o.bucket_id='studio-media-verified'
          and o.name=a.verified_key and o.metadata->>'size'=a.byte_size::text))
     then raise exception 'Verified object unavailable' using errcode='22023'; end if;
     blocks:=private.studio_public_blocks(p_id,p_expected_revision,doc);
   else
     blocks:=private.studio_public_text(doc);
   end if;
   cat_name:=btrim(doc->>'category');
   select coalesce(array_agg(n order by n),'{}'::text[]) into names from
     (select distinct btrim(value) n from unnest(string_to_array(doc->>'tags',',')) value where btrim(value)<>'' ) x;
   if cardinality(names)>20 or exists(select 1 from unnest(names) n where length(n)>100 or n !~ '[^[:space:]]') then
      raise exception 'Invalid tags' using errcode='22023'; end if;
   -- Stable, bounded taxonomy slugs even for non-Latin labels. Reject any hash/name collision.
   tax_slug:='category-'||md5(lower(cat_name));
   insert into public.blog_categories(slug,name) values(tax_slug,cat_name) on conflict(slug) do nothing;
   select id,name into cat,existing_name from public.blog_categories where slug=tax_slug;
   if lower(existing_name)<>lower(cat_name) then raise exception 'Category conflict' using errcode='23505'; end if;
   reading:=greatest(1,least(1440,ceil(length(blocks::text)/1200.0)::integer));
   if s.post_id is null then
     insert into public.blog_posts(author_name,category_id,slug,title,description,content,status,reading_minutes,seo_title,seo_description,published_at,cover_image,cover_alt,cover_width,cover_height)
      values(btrim(doc->>'author'),cat,doc->>'slug',btrim(doc->>'title'),btrim(doc->>'description'),blocks,'published',reading,
             nullif(btrim(doc->>'seoTitle'),''),nullif(btrim(doc->>'seoDescription'),''),clock_timestamp(),cover->>'src',cover->>'alt',(cover->>'width')::integer,(cover->>'height')::integer) returning id into post_uuid;
     insert into private.studio_publications(draft_id,post_id,source_revision,generation) values(p_id,post_uuid,p_expected_revision,next_generation);
   else
     post_uuid:=s.post_id;
     update public.blog_posts set author_name=btrim(doc->>'author'),category_id=cat,title=btrim(doc->>'title'),
      description=btrim(doc->>'description'),content=blocks,status='published',reading_minutes=reading,
      seo_title=nullif(btrim(doc->>'seoTitle'),''),seo_description=nullif(btrim(doc->>'seoDescription'),''),
      cover_image=cover->>'src',cover_alt=cover->>'alt',cover_width=(cover->>'width')::integer,cover_height=(cover->>'height')::integer,
      published_at=case when p.status='published' then p.published_at else clock_timestamp() end where id=post_uuid;
     update private.studio_publications set source_revision=p_expected_revision,generation=next_generation where draft_id=p_id;
   end if;
   delete from public.blog_post_tags where post_id=post_uuid;
   foreach tag_name in array names loop
     tax_slug:='tag-'||md5(lower(tag_name));
     insert into public.blog_tags(slug,name) values(tax_slug,tag_name) on conflict(slug) do nothing;
     select id,name into tag,existing_name from public.blog_tags where slug=tax_slug;
     if lower(existing_name)<>lower(tag_name) then raise exception 'Tag conflict' using errcode='23505'; end if;
     insert into public.blog_post_tags(post_id,tag_id) values(post_uuid,tag) on conflict do nothing;
   end loop;
   source_rev:=p_expected_revision;
 else
   if s.post_id is null or (p_action='unpublish' and p.status<>'published') or
      (p_action='archive' and p.status='archived') then raise exception 'Invalid publication transition' using errcode='22023'; end if;
   update public.blog_posts set status=case when p_action='archive' then 'archived' else 'draft' end,
     published_at=case when p_action='unpublish' then null else published_at end where id=s.post_id;
   update private.studio_publications set generation=next_generation where draft_id=p_id;
   source_rev:=s.source_revision;
 end if;
 result:=blog_internal.get_studio_publication(p_id);
 insert into private.studio_publication_events(draft_id,generation,request_id,action,expected_revision,source_revision,receipt)
 values(p_id,next_generation,p_request_id,p_action,p_expected_revision,source_rev,result);
 if p_action='publish' and media_enabled then
   perform private.bind_studio_publication_media(p_id,next_generation);
 end if;
 return result;
end; $$;

