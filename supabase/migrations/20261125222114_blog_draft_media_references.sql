-- Phase 3D.3C: versioned private media references, retained with immutable revisions.
-- Existing v1 documents and table CHECK function OID remain valid.
create function private.valid_studio_draft_v1(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  field text; max_len integer; block jsonb; part jsonb; href text;
  ids text[] := array[]::text[];
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(doc) is distinct from 'object' or octet_length(doc::text)>1048576 then return false; end if;
  if not doc ?& array['id','version','title','description','slug','category','tags','author','seoTitle','seoDescription','blocks']
    or exists(select 1 from jsonb_object_keys(doc) k where k not in ('id','version','title','description','slug','category','tags','author','seoTitle','seoDescription','blocks'))
    or doc->'version' is distinct from '1'::jsonb then return false; end if;
  for field,max_len in select * from (values ('id',36),('title',240),('description',2000),('slug',160),('category',100),
      ('tags',2000),('author',160),('seoTitle',240),('seoDescription',500)) v(k,n)
  loop
    if jsonb_typeof(doc->field) is distinct from 'string' or length(doc->>field)>max_len then return false; end if;
  end loop;
  if doc->>'id' !~ uuid_pattern or (doc->>'slug' <> '' and doc->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
     or jsonb_typeof(doc->'blocks') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'blocks')>100 then return false; end if;
  for block in select value from jsonb_array_elements(doc->'blocks') loop
    if jsonb_typeof(block) is distinct from 'object' then return false; end if;
    if not block ?& array['id','kind','text','language','runs']
       or exists(select 1 from jsonb_object_keys(block) k where k not in ('id','kind','text','language','runs'))
       or jsonb_typeof(block->'id') is distinct from 'string'
       or block->>'id' !~ uuid_pattern or block->>'id'=any(ids)
       or jsonb_typeof(block->'kind') is distinct from 'string'
       or block->>'kind' not in ('heading','paragraph','quote','list','code')
       or jsonb_typeof(block->'text') is distinct from 'string' or length(block->>'text')>10000
       or jsonb_typeof(block->'language') is distinct from 'string' or length(block->>'language')>100
       or jsonb_typeof(block->'runs') is distinct from 'array' then return false; end if;
    ids := array_append(ids,block->>'id');
    if jsonb_array_length(block->'runs') not between 1 and 50 then return false; end if;
    if block->>'kind'='list' and cardinality(string_to_array(block->>'text',chr(10)))>2000 then return false; end if;
    for part in select value from jsonb_array_elements(block->'runs') loop
      if jsonb_typeof(part) is distinct from 'object' then return false; end if;
      if jsonb_typeof(part->'text') is distinct from 'string' or length(part->>'text')>10000
         or exists(select 1 from jsonb_object_keys(part) k where k not in ('text','bold','italic','href'))
         or (part ? 'bold' and jsonb_typeof(part->'bold') is distinct from 'boolean')
         or (part ? 'italic' and jsonb_typeof(part->'italic') is distinct from 'boolean') then return false; end if;
      if part ? 'href' then
        if jsonb_typeof(part->'href') is distinct from 'string' then return false; end if;
        href := part->>'href';
        -- Conservative subset of client URL syntax; no credentials, protocol-relative, control/space or backslash.
        if length(href) not between 1 and 2048 or href ~ '[[:space:][:cntrl:]]' or strpos(href,chr(92))>0 then return false; end if;
        if left(href,1)='/' and left(href,2)<>'//' then null;
        elsif href ~* '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#].*)?$' then
          if substring(href from '^https?://[^/:?#]+:([0-9]{1,5})')::integer>65535 then return false; end if;
        else return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

revoke all on function private.valid_studio_draft_v1(jsonb) from public,anon,authenticated,studio_media_worker;
create function private.valid_studio_image(image jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(image) is distinct from 'object' then false else
   image ?& array['assetId','alt','caption']
   and not exists(select 1 from jsonb_object_keys(image) k where k not in ('assetId','alt','caption'))
   and jsonb_typeof(image->'assetId')='string' and image->>'assetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and jsonb_typeof(image->'alt')='string' and length(image->>'alt')<=500
   and jsonb_typeof(image->'caption')='string' and length(image->>'caption')<=1000 end;
$$;
create or replace function private.valid_studio_draft(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare block jsonb; image jsonb; projected jsonb:='[]'::jsonb; refs integer:=0; gallery_ids text[];
begin
 if jsonb_typeof(doc) is distinct from 'object' or octet_length(doc::text)>1048576 then return false; end if;
 if doc->'version'='1'::jsonb then return private.valid_studio_draft_v1(doc); end if;
 if doc->'version' is distinct from '2'::jsonb or not doc ? 'cover'
    or jsonb_typeof(doc->'blocks') is distinct from 'array' then return false; end if;
 if jsonb_array_length(doc->'blocks')>100 then return false; end if;
 if doc->'cover'<>'null'::jsonb then
   if private.valid_studio_image(doc->'cover') is distinct from true then return false; end if;
   refs:=1;
 end if;
 for block in select value from jsonb_array_elements(doc->'blocks') loop
   if jsonb_typeof(block) is distinct from 'object' then return false; end if;
   if block->>'kind' in ('image','gallery') then
     if jsonb_typeof(block->'images') is distinct from 'array' or block->>'text' is distinct from ''
        or block->>'language' is distinct from '' or block->'runs' is distinct from '[{"text":""}]'::jsonb then return false; end if;
     if (block->>'kind'='image' and jsonb_array_length(block->'images')<>1)
        or (block->>'kind'='gallery' and jsonb_array_length(block->'images') not between 2 and 8) then return false; end if;
     gallery_ids:=array[]::text[];
     for image in select value from jsonb_array_elements(block->'images') loop
       if private.valid_studio_image(image) is distinct from true or image->>'assetId'=any(gallery_ids) then return false; end if;
       gallery_ids:=array_append(gallery_ids,image->>'assetId'); refs:=refs+1;
     end loop;
     projected:=projected||jsonb_build_array((block-'images')||'{"kind":"quote"}'::jsonb);
   else
     projected:=projected||jsonb_build_array(block);
   end if;
 end loop;
 return refs<=20 and private.valid_studio_draft_v1((doc-'cover')||jsonb_build_object('version',1,'blocks',projected));
end; $$;
revoke all on function private.valid_studio_image(jsonb),private.valid_studio_draft(jsonb) from public,anon,authenticated,studio_media_worker;

create table private.studio_revision_media (
 draft_id uuid not null,
 revision integer not null,
 asset_id uuid not null references private.studio_media_assets(id) on delete restrict,
 primary key(draft_id,revision,asset_id),
 foreign key(draft_id,revision) references private.studio_draft_revisions(draft_id,revision) on delete restrict
);
create index studio_revision_media_asset_idx on private.studio_revision_media(asset_id);
alter table private.studio_revision_media enable row level security;
revoke all on private.studio_revision_media from public,anon,authenticated,studio_media_worker;

create function private.studio_document_asset_ids(doc jsonb) returns setof uuid
language sql immutable set search_path='' as $$
 select distinct asset_id::uuid from (
   select doc->'cover'->>'assetId' as asset_id where doc->'version'='2'::jsonb and doc->'cover'<>'null'::jsonb
   union all
   select image->>'assetId' from jsonb_array_elements(doc->'blocks') block
     cross join lateral jsonb_array_elements(case when block->>'kind' in ('image','gallery') then block->'images' else '[]'::jsonb end) image
   where doc->'version'='2'::jsonb
 ) ids where asset_id is not null;
$$;
revoke all on function private.studio_document_asset_ids(jsonb) from public,anon,authenticated,studio_media_worker;

-- Save and revision insert are one transaction. Any bad reference rolls back
-- the working copy as well as the revision. Lock asset state during validation.
create function private.bind_studio_revision_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; asset uuid;
begin
 select d.owner_id into owner from private.studio_drafts d where d.id=new.draft_id;
 for asset in select * from private.studio_document_asset_ids(new.document) order by 1 loop
   perform 1 from private.studio_media_assets a where a.id=asset and a.owner_id=owner and a.state='verified' for share;
   if not found then raise exception 'Media reference unavailable' using errcode='22023'; end if;
   insert into private.studio_revision_media(draft_id,revision,asset_id) values(new.draft_id,new.revision,asset);
 end loop;
 return new;
end; $$;
revoke all on function private.bind_studio_revision_media() from public,anon,authenticated,studio_media_worker;
create trigger studio_bind_revision_media after insert on private.studio_draft_revisions
 for each row execute function private.bind_studio_revision_media();

-- A referenced asset cannot be made unverified or reassigned. Future retention
-- must explicitly account for every revision and published reference.
create function private.protect_referenced_studio_media() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.state,new.owner_id,new.verified_key,new.sha256,new.byte_size,new.width,new.height)
    is distinct from (old.state,old.owner_id,old.verified_key,old.sha256,old.byte_size,old.width,old.height)
    and exists(select 1 from private.studio_revision_media where asset_id=old.id)
 then raise exception 'Referenced media is immutable' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function private.protect_referenced_studio_media() from public,anon,authenticated,studio_media_worker;
create trigger studio_protect_referenced_media before update on private.studio_media_assets
 for each row execute function private.protect_referenced_studio_media();
