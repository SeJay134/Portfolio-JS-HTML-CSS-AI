import React, { lazy, Suspense, useEffect, useState } from "react";
import { BlogArticle } from "./BlogContent";
import { fitsDraft, MAX_BLOCKS, MAX_DRAFTS, MAX_TEXT, moveBlock, newBlock, newDraft, previewPost, slugFromTitle,
  type BlockKind, type StudioBlock, type StudioDraft, mediaReferenceCount } from "../data/blogStudio";
import { safeBlogHref, type RichRun } from "../data/blogRichText";
import { useStudioDrafts } from "../hooks/useStudioDrafts";
import type { RevisionSummary } from "../data/blogDraftRepository";

import { DraftMediaPicker, ImageFields, PrivateArticleImage } from "./DraftMediaControls";
import { localMediaUploadEnabled } from "../lib/studioMediaUpload";

const StudioPhotoPanel = lazy(() => import("./StudioPhotoPanel").then(module => ({ default: module.StudioPhotoPanel })));

const kinds: { value: BlockKind; label: string }[] = [
  { value: "paragraph", label: "Paragraph" }, { value: "heading", label: "Heading" },
  { value: "quote", label: "Quote" }, { value: "list", label: "Bullet list" }, { value: "code", label: "Code" },
];
const uid = () => crypto.randomUUID();

function BlockEditor({ block, index, count, onChange, onMove, onRemove }: {
  block: StudioBlock; index: number; count: number; onChange: (block: StudioBlock) => void;
  onMove: (direction: -1 | 1) => void; onRemove: () => void;
}) {
  const label = "Block " + (index + 1);
  const changeRun = (i: number, changes: Partial<RichRun>) =>
    onChange({ ...block, runs: block.runs.map((run, j) => j === i ? { ...run, ...changes } : run) });
  return <fieldset className="studio-block">
    <legend>{label} · {kinds.find(kind => kind.value === block.kind)?.label ?? (block.kind === "image" ? "Image" : "Gallery")}</legend>
    <div className="studio-actions">
      <button type="button" onClick={() => onMove(-1)} disabled={!index} aria-label={label + " move up"}>↑ Up</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={label + " move down"}>↓ Down</button>
      <button type="button" onClick={onRemove} aria-label={label + " remove"}>Remove</button>
    </div>
    {block.kind === "image" || block.kind === "gallery" ? <>
      {(block.images ?? []).map((image,i)=><div key={image.assetId}>
        <ImageFields image={image} label={label+" photo "+(i+1)} onChange={next=>onChange({...block,images:block.images!.map((a,j)=>i===j?next:a)})}/>
        {block.kind==="gallery"&&<div className="studio-actions">
          <button type="button" disabled={i===0} onClick={()=>{const next=[...block.images!];[next[i-1],next[i]]=[next[i],next[i-1]];onChange({...block,images:next});}}>Photo up</button>
          <button type="button" disabled={i===block.images!.length-1} onClick={()=>{const next=[...block.images!];[next[i+1],next[i]]=[next[i],next[i+1]];onChange({...block,images:next});}}>Photo down</button>
          <button type="button" onClick={()=>{const next=block.images!.filter((_,j)=>j!==i);onChange({...block,kind:next.length===1?"image":"gallery",images:next});}}>Remove photo</button>
        </div>}
      </div>)}
    </> : block.kind === "paragraph" ? <>
      {block.runs.map((run, i) => {
        const name = label + " text part " + (i + 1);
        return <div className="studio-run" key={i}>
          <div className="studio-actions" aria-label={name + " formatting"}>
            <button type="button" aria-pressed={!!run.bold} aria-label={name + " bold"} onClick={() => changeRun(i, { bold: !run.bold })}><strong>B</strong> Bold</button>
            <button type="button" aria-pressed={!!run.italic} aria-label={name + " italic"} onClick={() => changeRun(i, { italic: !run.italic })}><em>I</em> Italic</button>
            {block.runs.length > 1 && <button type="button" aria-label={name + " remove"} onClick={() => onChange({ ...block, runs: block.runs.filter((_, j) => j !== i) })}>Remove part</button>}
          </div>
          <label>{name}<textarea rows={3} maxLength={MAX_TEXT} value={run.text} onChange={event => changeRun(i, { text: event.target.value })} /></label>
          <label>Link for {name.toLowerCase()} (optional)<input type="text" inputMode="url" maxLength={2048} value={run.href ?? ""} aria-invalid={!!run.href && !safeBlogHref(run.href)} onChange={event => changeRun(i, { href: event.target.value || undefined })} placeholder="https://example.com" /></label>
          {!!run.href && !safeBlogHref(run.href) && <p className="studio-error">Use an http/https URL or an internal path.</p>}
        </div>;
      })}
      <button type="button" disabled={block.runs.length >= 50} onClick={() => onChange({ ...block, runs: [...block.runs, { text: "" }] })}>+ Add text part</button>
      <p className="studio-hint">Parts are joined in order; include spaces between them. Format each part separately.</p>
    </> : <>
      {block.kind === "code" && <label>Code language<input maxLength={100} value={block.language} onChange={event => onChange({ ...block, language: event.target.value })} /></label>}
      <label>{label} content{block.kind === "list" ? " (one item per line)" : ""}<textarea rows={block.kind === "heading" ? 2 : 5} maxLength={MAX_TEXT} value={block.text} onChange={event => onChange({ ...block, text: event.target.value })}/></label>
    </>}
  </fieldset>;
}

export function BlogStudioWorkspace({ persistent = false }: { persistent?: boolean }) {
  const store = useStudioDrafts(persistent);
  const { drafts, setDrafts, dirty } = store;
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<BlockKind>("paragraph");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");
  const draft = drafts.find(item => item.id === selected);
  const [history, setHistory] = useState<{ id: string; rows: RevisionSummary[] } | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const currentFailure = draft && store.failures[draft.id];
  const currentSaved = draft && store.saved[draft.id];
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function addDraft() {
    if (drafts.length >= MAX_DRAFTS || store.loading || store.loadError || store.denied || store.busy) return;
    const next = newDraft(uid(), uid());
    setDrafts(items => [...items, next]); setSelected(next.id); setMode("edit"); setSearch(""); setError(""); setHistory(null); setHistoryError("");
  }
  function update(changes: Partial<StudioDraft>) {
    if (!draft || store.busy) return;
    const next = { ...draft, ...changes };
    if (mediaReferenceCount(next)>20) { setError("A draft can contain at most 20 photo references."); return; }
    if (!fitsDraft(next)) { setError("This draft exceeds the 1 MiB local limit. Remove some content."); return; }
    setDrafts(items => items.map(item => item.id === next.id ? next : item)); store.edited(next.id); setError("");
  }
  function removeDraft() {
    if (!draft || !window.confirm("Discard this unsaved local draft? This cannot be undone.")) return;
    if (!store.discardLocal(draft)) { setError("This draft may already be saved. Reload to confirm its state."); return; }
    const next = drafts.filter(item => item.id !== draft.id);
    setSelected(next[0]?.id ?? null); setMode("edit"); setError(""); setHistory(null);
  }
  async function showHistory() {
    if (!draft || historyLoading) return;
    setHistoryLoading(true); setHistoryError("");
    try { setHistory({ id: draft.id, rows: await store.history(draft.id) }); }
    catch { setHistoryError("Revision history unavailable. Try again."); }
    finally { setHistoryLoading(false); }
  }
  if (store.denied) return <p role="alert">Administrator access is no longer available. Reload to check access.</p>;
  if (store.loading) return <p role="status">Loading private drafts…</p>;
  if (store.loadError) return <section><p role="alert">{store.loadError}</p><button type="button" onClick={store.retryLoad}>Retry loading drafts</button></section>;
  let preview: ReturnType<typeof previewPost> | undefined;
  let previewError = "";
  if (draft && mode === "preview") {
    try { preview = previewPost(draft); } catch (reason) { previewError = reason instanceof Error ? reason.message : "Invalid draft."; }
  }
  const matches = drafts.filter(item => (item.title + " " + item.category + " " + item.tags).toLowerCase().includes(search.toLowerCase().trim()));
  return <section className="studio-workspace" aria-label="Article workspace">
    <div className="studio-banner"><div><p className="eyebrow">{persistent ? "Phase 3B / Private drafts" : "Phase 3A / Local workspace"}</p><h2>Administrator access confirmed</h2>
      <p>{persistent ? "Saved drafts are private. Unsaved edits may be lost on reload or access recheck (including window focus). Wait for Saved before leaving. Publishing is not enabled." : "Drafts are temporary and held in memory only. Reloading, leaving, or an access recheck (including window focus) can discard them. No saving or publishing yet."}</p></div>
      <span className="studio-state" role="status">{persistent ? (store.busy ? "Saving or loading…" : dirty ? "Unsaved changes" : drafts.length ? "All drafts saved" : "No saved drafts") : (drafts.length ? "Unsaved local drafts" : "No local drafts")}</span>
    </div>
    <div className="studio-grid">
      <aside className="studio-panel studio-library" aria-label="Draft library">
        <div className="studio-panel-heading"><h3>Articles</h3><button className="button primary" type="button" onClick={addDraft} disabled={drafts.length >= MAX_DRAFTS || !!store.busy}>+ New draft</button></div>
        <label>Search drafts<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, category, tags" /></label>
        <p className="studio-hint">{matches.length} of {drafts.length} {persistent ? "private" : "local"} drafts</p>
        {matches.length ? <ul className="studio-draft-list">{matches.map(item => <li key={item.id}><button type="button" aria-current={selected === item.id ? "true" : undefined} onClick={() => { setSelected(item.id); setMode("edit"); setError(""); setHistory(null); setHistoryError(""); }}><strong>{item.title || "Untitled draft"}</strong><span>Draft · {item.category || "Uncategorized"}{persistent && (store.isDirty(item) ? " · Unsaved" : " · Saved")}</span></button></li>)}</ul> : <p>No matching local drafts.</p>}
      </aside>
      <section className="studio-panel studio-canvas" aria-label="Article editor">
        {!draft ? <div className="studio-empty"><h3>Start writing</h3><p>Create a draft to compose text, format blocks and preview an article.</p><button className="button secondary" type="button" onClick={addDraft}>Create first draft</button></div> : <>
          <div className="studio-panel-heading"><h3>{mode === "edit" ? "Compose" : "Article preview"}</h3><div className="studio-actions" aria-label="Editor view">
            <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Edit</button>
            <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button>
          </div></div>
          {error && <p role="alert" className="studio-error">{error}</p>}
          {persistent && <div className="studio-save-panel">
            <div className="studio-actions"><button type="button" disabled={!!store.busy || !store.isDirty(draft) && !currentFailure || currentFailure?.kind === "conflict"} onClick={() => { void store.save(draft, true); setHistory(null); }}>Save draft</button>
              <label className="studio-autosave"><input type="checkbox" checked={store.auto} onChange={event => store.setAuto(event.target.checked)}/> Autosave</label></div>
            <p className="studio-hint">{currentSaved ? "Saved revision " + currentSaved.revision + " / 100" : "Not saved yet"} · {store.auto ? "15-second idle autosave" : "Manual saving"}</p>
            {currentFailure && <p role="alert" className="studio-error">{currentFailure.message}</p>}
            {(currentSaved || currentFailure?.kind === "conflict" || currentFailure?.kind === "unavailable") && <button type="button" disabled={!!store.busy} onClick={() => { if (window.confirm("Reload latest saved draft and discard unsaved edits?")) { void store.reload(draft); setHistory(null); } }}>Reload saved version</button>}
          </div>}
          {mode === "preview" ? <div className="studio-preview">
            {previewError ? <p role="alert" className="studio-error">{previewError}</p> : preview && <BlogArticle post={preview} posts={[]} preview privatePreview={preview.privateMedia ? {
              cover:preview.privateMedia.cover?<PrivateArticleImage key={preview.privateMedia.cover.assetId} image={preview.privateMedia.cover}/>:undefined,
              blocks:Object.fromEntries(Object.entries(preview.privateMedia.blocks).map(([index,images])=>[index,<div className="studio-article-gallery">{images.map(image=><PrivateArticleImage key={image.assetId} image={image}/>)}</div>]))
            }:undefined} />}
          </div> : <fieldset className="studio-edit-fields" disabled={!!store.busy}>
            <label>Article title<input className="studio-title-input" maxLength={240} value={draft.title} onChange={event => update({ title: event.target.value })} placeholder="Give your article a title"/></label>
            <label>Summary<textarea rows={3} maxLength={2000} value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="A short introduction"/></label>
            {persistent && localMediaUploadEnabled() && <DraftMediaPicker key={draft.id} draft={draft} remaining={20-mediaReferenceCount(draft)}
              onChange={cover=>update({version:2,cover})}
              onAdd={block=>update({version:2,cover:draft.cover??null,blocks:[...draft.blocks,block]})}/>}
            {draft.blocks.map((block, index) => <BlockEditor key={block.id} block={block} index={index} count={draft.blocks.length}
              onChange={next => update({ blocks: draft.blocks.map(item => item.id === next.id ? next : item) })}
              onMove={direction => update({ blocks: moveBlock(draft.blocks, index, direction) })}
              onRemove={() => update({ blocks: draft.blocks.filter(item => item.id !== block.id) })}/>)}
            <div className="studio-add"><label>Block type<select value={kind} onChange={event => setKind(event.target.value as BlockKind)}>{kinds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <button type="button" disabled={draft.blocks.length >= MAX_BLOCKS} onClick={() => update({ blocks: [...draft.blocks, newBlock(uid(), kind)] })}>+ Add block</button></div>
          </fieldset>}
        </>}
      </section>
      <aside className="studio-panel studio-settings" aria-label="Article settings"><h3>Article settings</h3>
        {!draft ? <p>Choose a local draft to edit its details.</p> : <>
          <fieldset className="studio-edit-fields" disabled={!!store.busy}><p className="studio-hint">Status: Draft · Not published</p>
          <label>URL slug<input maxLength={160} value={draft.slug} onChange={event => update({ slug: event.target.value })} placeholder={slugFromTitle(draft.title) || "article-slug"}/></label>
          <button type="button" onClick={() => update({ slug: slugFromTitle(draft.title) })}>Generate slug from title</button>
          <label>Category<input maxLength={100} value={draft.category} onChange={event => update({ category: event.target.value })}/></label>
          <label>Tags (comma separated)<input maxLength={2000} value={draft.tags} onChange={event => update({ tags: event.target.value })}/></label>
          <label>Public byline<input maxLength={160} value={draft.author} onChange={event => update({ author: event.target.value })}/></label>
          <label>SEO title<input maxLength={240} value={draft.seoTitle} onChange={event => update({ seoTitle: event.target.value })}/></label>
          <label>SEO description<textarea rows={3} maxLength={500} value={draft.seoDescription} onChange={event => update({ seoDescription: event.target.value })}/></label>
          </fieldset>
          {persistent && currentSaved && <section className="studio-history" aria-label="Revision history"><h4>Revision history</h4>
            <button type="button" disabled={historyLoading || !!store.busy} onClick={() => void showHistory()}>Load revision history</button>
            {historyError && <p role="alert">{historyError}</p>}
            {history?.id === draft.id && <ul>{history.rows.map(item => <li key={item.revision}><span>Revision {item.revision} · {new Date(item.created_at).toLocaleString()}</span><button type="button" disabled={!!store.busy || !!currentFailure || item.revision === currentSaved.revision} onClick={() => { if (window.confirm("Load this revision as unsaved edits? Save to create a new revision.")) { void store.restore(draft, item.revision); setMode("edit"); } }}>Restore revision {item.revision}</button></li>)}</ul>}
          </section>}
          <div className="studio-next"><strong>Coming next</strong><p>{persistent ? "Publishing and saved draft deletion are not enabled. Local media references are available only in isolated staging. History has a temporary storage cap." : "Database saving, categories, photos and publishing are not enabled in this phase."}</p></div>
          {!currentSaved && <button type="button" className="studio-discard" disabled={!!store.busy || !!currentFailure && currentFailure.kind !== "invalid"} onClick={removeDraft}>Discard draft</button>}
        </>}
      </aside>
    </div>
    {import.meta.env.VITE_ENABLE_BLOG_PHOTOS === "true" && <Suspense fallback={<p role="status">Loading photo preparation…</p>}><StudioPhotoPanel /></Suspense>}
  </section>;
}
