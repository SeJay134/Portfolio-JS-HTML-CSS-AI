-- Candidate: Phase 3E.2B. Private helpers only; text publication remains unchanged.
create table private.studio_publication_media (
 draft_id uuid not null,
 generation integer not null,
 source_revision integer not null,
 asset_id uuid not null,
 primary key(draft_id,generation,asset_id),
 foreign key(draft_id,generation) references private.studio_publication_events(draft_id,generation) on delete restrict,
 foreign key(draft_id,source_revision,asset_id) references private.studio_revision_media(draft_id,revision,asset_id) on delete restrict
);
create index studio_publication_media_asset_idx on private.studio_publication_media(asset_id);
alter table private.studio_publication_media enable row level security;
revoke all on private.studio_publication_media from public,anon,authenticated,studio_media_worker,service_role;

-- Not a public RPC. Resolve only a reference from the exact saved revision.
create function private.studio_public_image(p_draft uuid,p_revision integer,p_image jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a private.studio_media_assets%rowtype;
begin
 if private.valid_studio_image(p_image) is distinct from true
    or (p_image->>'alt') !~ '[^[:space:]]' then
   raise exception 'Invalid publication image' using errcode='22023';
 end if;
 select m.* into a from private.studio_revision_media r
 join private.studio_drafts d on d.id=r.draft_id
 join private.studio_media_assets m on m.id=r.asset_id and m.owner_id=d.owner_id
 where r.draft_id=p_draft and r.revision=p_revision and r.asset_id=(p_image->>'assetId')::uuid
 and m.state='verified';
 if not found then raise exception 'Publication image unavailable' using errcode='22023'; end if;
 return jsonb_build_object('src','/blog/media/'||a.id::text||'.jpg',
 'alt',p_image->>'alt','caption',p_image->>'caption','width',a.width,'height',a.height);
end; $$;

create function private.prepare_studio_publication_media(p_draft uuid,p_revision integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb; b jsonb; img jsonb; images jsonb; cover jsonb; blocks jsonb:='[]'::jsonb;
begin
 select document into doc from private.studio_draft_revisions where draft_id=p_draft and revision=p_revision;
 if doc is null or private.valid_studio_draft(doc) is distinct from true then
   raise exception 'Publication revision unavailable' using errcode='22023';
 end if;
 if doc->'version'='2'::jsonb and doc->'cover'<>'null'::jsonb then
   cover:=private.studio_public_image(p_draft,p_revision,doc->'cover');
   -- The existing cover schema has no caption field. Reject rather than lose it.
   if cover->>'caption'<>'' then raise exception 'Cover caption not supported' using errcode='22023'; end if;
 end if;
 for b in select value from jsonb_array_elements(doc->'blocks') loop
   if b->>'kind' not in ('image','gallery') then continue; end if;
   images:='[]'::jsonb;
   for img in select value from jsonb_array_elements(b->'images') loop
     images:=images||jsonb_build_array(private.studio_public_image(p_draft,p_revision,img));
   end loop;
   if b->>'kind'='image' then
     blocks:=blocks||jsonb_build_array(jsonb_build_object('type','image','version',1,'image',images->0));
   else
     blocks:=blocks||jsonb_build_array(jsonb_build_object('type','gallery','version',1,'images',images));
   end if;
 end loop;
 return jsonb_build_object('cover',cover,'blocks',blocks);
end; $$;

-- Future publication transaction calls this only after writing the projection
-- and its event, before commit. It is not invoked by the existing text RPC.
create function private.bind_studio_publication_media(p_draft uuid,p_generation integer) returns void
language plpgsql volatile security invoker set search_path='' as $$
declare s private.studio_publications%rowtype; p public.blog_posts%rowtype;
 manifest jsonb; projected jsonb; cover jsonb;
begin
 select * into s from private.studio_publications where draft_id=p_draft for update;
 if not found or s.generation is distinct from p_generation then
   raise exception 'Publication generation unavailable' using errcode='22023';
 end if;
 select * into p from public.blog_posts where id=s.post_id for update;
 if p.status is distinct from 'published' or not exists(
   select 1 from private.studio_publication_events e where e.draft_id=p_draft
    and e.generation=p_generation and e.action='publish' and e.source_revision=s.source_revision)
 then raise exception 'Publication generation unavailable' using errcode='22023'; end if;
 manifest:=private.prepare_studio_publication_media(p_draft,s.source_revision);
 cover:=manifest->'cover';
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into projected
 from jsonb_array_elements(p.content) with ordinality as x(value,ord)
 where value->>'type' in ('image','gallery');
 if projected is distinct from manifest->'blocks' or
    (p.cover_image,p.cover_alt,p.cover_width,p.cover_height) is distinct from
    (cover->>'src',cover->>'alt',(cover->>'width')::integer,(cover->>'height')::integer)
 then raise exception 'Publication media projection mismatch' using errcode='22023'; end if;
 insert into private.studio_publication_media(draft_id,generation,source_revision,asset_id)
 select p_draft,p_generation,s.source_revision,r.asset_id
 from private.studio_revision_media r where r.draft_id=p_draft and r.revision=s.source_revision
 on conflict do nothing;
end; $$;

-- Eligibility is re-evaluated against the live publication generation and
-- visible post state. This is not a storage authorization policy or RPC.
create function private.active_studio_publication_media(p_asset uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.studio_publication_media r
 join private.studio_publications s on s.draft_id=r.draft_id and s.generation=r.generation and s.source_revision=r.source_revision
 join public.blog_posts p on p.id=s.post_id
 join private.studio_media_assets a on a.id=r.asset_id and a.state='verified'
 where r.asset_id=p_asset and p.status='published' and p.published_at<=now());
$$;
revoke all on function private.studio_public_image(uuid,integer,jsonb),
 private.prepare_studio_publication_media(uuid,integer),private.bind_studio_publication_media(uuid,integer),
 private.active_studio_publication_media(uuid) from public,anon,authenticated,studio_media_worker,service_role;
