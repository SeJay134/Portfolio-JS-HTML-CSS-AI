-- Phase 3B.1: isolated working copies; no public projection writes or real data.
-- Existing blog_internal is non-exposed. Only narrow invoker RPCs are public.
create function private.valid_studio_draft(doc jsonb) returns boolean
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
revoke all on function private.valid_studio_draft(jsonb) from public,anon,authenticated;

create table private.studio_drafts (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id) on delete restrict,
 revision integer not null check(revision between 1 and 100),
 document jsonb not null check(private.valid_studio_draft(document) and document->>'id'=id::text),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index studio_drafts_owner_updated_idx on private.studio_drafts(owner_id,updated_at desc,id);
create unique index studio_drafts_slug_idx on private.studio_drafts((document->>'slug')) where document->>'slug'<>'';
create table private.studio_draft_revisions (
 draft_id uuid not null references private.studio_drafts(id) on delete restrict,
 revision integer not null check(revision between 1 and 100),
 request_id uuid not null,
 document jsonb not null check(private.valid_studio_draft(document) and document->>'id'=draft_id::text),
 created_at timestamptz not null default now(),
 primary key(draft_id,revision), unique(draft_id,request_id)
);
alter table private.studio_drafts enable row level security;
alter table private.studio_draft_revisions enable row level security;
revoke all on private.studio_drafts,private.studio_draft_revisions from public,anon,authenticated;

create function blog_internal.list_studio_drafts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := (select auth.uid());
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision,'title',d.document->>'title',
    'category',d.document->>'category','slug',d.document->>'slug','updated_at',d.updated_at) order by d.updated_at desc,d.id)
    from private.studio_drafts d where d.owner_id=caller),'[]'::jsonb);
end; $$;

create function blog_internal.get_studio_draft(p_id uuid,p_revision integer default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 if p_revision is null then
  select jsonb_build_object('id',d.id,'revision',d.revision,'document',d.document,'updated_at',d.updated_at) into result
   from private.studio_drafts d where d.id=p_id and d.owner_id=caller;
 else
  select jsonb_build_object('id',d.id,'revision',r.revision,'document',r.document,'updated_at',r.created_at) into result
   from private.studio_drafts d join private.studio_draft_revisions r on r.draft_id=d.id
   where d.id=p_id and d.owner_id=caller and r.revision=p_revision;
 end if;
 return result;
end; $$;

create function blog_internal.list_studio_revisions(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := (select auth.uid());
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('revision',r.revision,'created_at',r.created_at) order by r.revision desc)
  from private.studio_drafts d join private.studio_draft_revisions r on r.draft_id=d.id
  where d.id=p_id and d.owner_id=caller),'[]'::jsonb);
end; $$;

create function blog_internal.save_studio_draft(p_id uuid,p_expected_revision integer,p_request_id uuid,p_document jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid := (select auth.uid());
 current_draft private.studio_drafts%rowtype;
 previous_request private.studio_draft_revisions%rowtype;
 next_revision integer; saved_at timestamptz := clock_timestamp();
begin
 if caller is null or not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision not between 0 and 100
    or private.valid_studio_draft(p_document) is distinct from true or p_document->>'id' is distinct from p_id::text then
  raise exception 'Invalid draft' using errcode='22023';
 end if;
 -- Serialize all saves by a caller for quota checks and by ID for cross-owner collision.
 perform pg_advisory_xact_lock(hashtextextended('studio-owner:'||caller::text,0));
 perform pg_advisory_xact_lock(hashtextextended('studio-draft:'||p_id::text,1));
 if not private.is_blog_admin() then raise exception 'Blog administrator required' using errcode='42501'; end if;
 select * into current_draft from private.studio_drafts where id=p_id for update;
 if found then
  if current_draft.owner_id<>caller then raise exception 'Draft not available' using errcode='42501'; end if;
  select * into previous_request from private.studio_draft_revisions where draft_id=p_id and request_id=p_request_id;
  if found then
   if previous_request.document is distinct from p_document or previous_request.revision<>p_expected_revision+1 then
     raise exception 'Request key already used' using errcode='22023';
   end if;
   return jsonb_build_object('id',p_id,'revision',previous_request.revision,'updated_at',previous_request.created_at);
  end if;
  if current_draft.revision<>p_expected_revision then raise exception 'Draft revision conflict' using errcode='40001'; end if;
 else
  if p_expected_revision<>0 then raise exception 'Draft revision conflict' using errcode='40001'; end if;
  if (select count(*) from private.studio_drafts where owner_id=caller)>=20 then raise exception 'Draft limit reached' using errcode='22023'; end if;
 end if;
 next_revision := p_expected_revision+1;
 if next_revision>100 or (select coalesce(sum(octet_length(r.document::text)),0)
   from private.studio_drafts d join private.studio_draft_revisions r on r.draft_id=d.id where d.owner_id=caller)
   +octet_length(p_document::text)>20971520 then
   raise exception 'Draft history limit reached' using errcode='22023';
 end if;
 -- Reserve nonempty slugs within the working-copy store; cross-projection checks belong to publish.
 if p_expected_revision=0 then
  insert into private.studio_drafts(id,owner_id,revision,document,created_at,updated_at)
    values(p_id,caller,next_revision,p_document,saved_at,saved_at);
 else
  update private.studio_drafts set revision=next_revision,document=p_document,updated_at=saved_at where id=p_id and owner_id=caller;
 end if;
 insert into private.studio_draft_revisions(draft_id,revision,request_id,document,created_at)
  values(p_id,next_revision,p_request_id,p_document,saved_at);
 return jsonb_build_object('id',p_id,'revision',next_revision,'updated_at',saved_at);
end; $$;

create function public.list_studio_drafts() returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.list_studio_drafts(); $$;
create function public.get_studio_draft(p_id uuid,p_revision integer default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.get_studio_draft(p_id,p_revision); $$;
create function public.list_studio_revisions(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select blog_internal.list_studio_revisions(p_id); $$;
create function public.save_studio_draft(p_id uuid,p_expected_revision integer,p_request_id uuid,p_document jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select blog_internal.save_studio_draft(p_id,p_expected_revision,p_request_id,p_document); $$;

revoke all on function blog_internal.list_studio_drafts(),blog_internal.get_studio_draft(uuid,integer),
 blog_internal.list_studio_revisions(uuid),blog_internal.save_studio_draft(uuid,integer,uuid,jsonb),
 public.list_studio_drafts(),public.get_studio_draft(uuid,integer),public.list_studio_revisions(uuid),
 public.save_studio_draft(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function blog_internal.list_studio_drafts(),blog_internal.get_studio_draft(uuid,integer),
 blog_internal.list_studio_revisions(uuid),blog_internal.save_studio_draft(uuid,integer,uuid,jsonb),
 public.list_studio_drafts(),public.get_studio_draft(uuid,integer),public.list_studio_revisions(uuid),
 public.save_studio_draft(uuid,integer,uuid,jsonb) to authenticated;
