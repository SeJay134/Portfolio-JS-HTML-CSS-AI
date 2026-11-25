import React, { useEffect, useState } from "react";
import { BlogArticle } from "./BlogContent";
import { fitsDraft, MAX_BLOCKS, MAX_DRAFTS, MAX_TEXT, moveBlock, newBlock, newDraft, previewPost, slugFromTitle,
  type BlockKind, type StudioBlock, type StudioDraft } from "../data/blogStudio";
import { safeBlogHref, type RichRun } from "../data/blogRichText";

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
    <legend>{label} · {kinds.find(kind => kind.value === block.kind)?.label}</legend>
    <div className="studio-actions">
      <button type="button" onClick={() => onMove(-1)} disabled={!index} aria-label={label + " move up"}>↑ Up</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={label + " move down"}>↓ Down</button>
      <button type="button" onClick={onRemove} aria-label={label + " remove"}>Remove</button>
    </div>
    {block.kind === "paragraph" ? <>
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

export function BlogStudioWorkspace() {
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<BlockKind>("paragraph");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");
  const draft = drafts.find(item => item.id === selected);
  const dirty = drafts.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function addDraft() {
    if (drafts.length >= MAX_DRAFTS) return;
    const next = newDraft(uid(), uid());
    setDrafts(items => [...items, next]); setSelected(next.id); setMode("edit"); setSearch(""); setError("");
  }
  function update(changes: Partial<StudioDraft>) {
    if (!draft) return;
    const next = { ...draft, ...changes };
    if (!fitsDraft(next)) { setError("This draft exceeds the 1 MiB local limit. Remove some content."); return; }
    setDrafts(items => items.map(item => item.id === next.id ? next : item)); setError("");
  }
  function removeDraft() {
    if (!draft || !window.confirm("Discard this local draft? This cannot be undone.")) return;
    const next = drafts.filter(item => item.id !== draft.id);
    setDrafts(next); setSelected(next[0]?.id ?? null); setMode("edit"); setError("");
  }
  let preview: ReturnType<typeof previewPost> | undefined;
  let previewError = "";
  if (draft && mode === "preview") {
    try { preview = previewPost(draft); } catch (reason) { previewError = reason instanceof Error ? reason.message : "Invalid draft."; }
  }
  const matches = drafts.filter(item => (item.title + " " + item.category + " " + item.tags).toLowerCase().includes(search.toLowerCase().trim()));
  return <section className="studio-workspace" aria-label="Article workspace">
    <div className="studio-banner"><div><p className="eyebrow">Phase 3A / Local workspace</p><h2>Administrator access confirmed</h2>
      <p>Drafts are temporary and held in memory only. Reloading, leaving, or an access recheck (including window focus) can discard them. No saving or publishing yet.</p></div>
      <span className="studio-state" role="status">{drafts.length ? "Unsaved local drafts" : "No local drafts"}</span>
    </div>
    <div className="studio-grid">
      <aside className="studio-panel studio-library" aria-label="Draft library">
        <div className="studio-panel-heading"><h3>Articles</h3><button className="button primary" type="button" onClick={addDraft} disabled={drafts.length >= MAX_DRAFTS}>+ New draft</button></div>
        <label>Search drafts<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, category, tags" /></label>
        <p className="studio-hint">{matches.length} of {drafts.length} local drafts</p>
        {matches.length ? <ul className="studio-draft-list">{matches.map(item => <li key={item.id}><button type="button" aria-current={selected === item.id ? "true" : undefined} onClick={() => { setSelected(item.id); setMode("edit"); setError(""); }}><strong>{item.title || "Untitled draft"}</strong><span>Draft · {item.category || "Uncategorized"}</span></button></li>)}</ul> : <p>No matching local drafts.</p>}
      </aside>
      <section className="studio-panel studio-canvas" aria-label="Article editor">
        {!draft ? <div className="studio-empty"><h3>Start writing</h3><p>Create a draft to compose text, format blocks and preview an article.</p><button className="button secondary" type="button" onClick={addDraft}>Create first draft</button></div> : <>
          <div className="studio-panel-heading"><h3>{mode === "edit" ? "Compose" : "Article preview"}</h3><div className="studio-actions" aria-label="Editor view">
            <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Edit</button>
            <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button>
          </div></div>
          {error && <p role="alert" className="studio-error">{error}</p>}
          {mode === "preview" ? <div className="studio-preview">
            {previewError ? <p role="alert" className="studio-error">{previewError}</p> : preview && <BlogArticle post={preview} posts={[]} preview />}
          </div> : <>
            <label>Article title<input className="studio-title-input" maxLength={240} value={draft.title} onChange={event => update({ title: event.target.value })} placeholder="Give your article a title"/></label>
            <label>Summary<textarea rows={3} maxLength={2000} value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="A short introduction"/></label>
            {draft.blocks.map((block, index) => <BlockEditor key={block.id} block={block} index={index} count={draft.blocks.length}
              onChange={next => update({ blocks: draft.blocks.map(item => item.id === next.id ? next : item) })}
              onMove={direction => update({ blocks: moveBlock(draft.blocks, index, direction) })}
              onRemove={() => update({ blocks: draft.blocks.filter(item => item.id !== block.id) })}/>)}
            <div className="studio-add"><label>Block type<select value={kind} onChange={event => setKind(event.target.value as BlockKind)}>{kinds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <button type="button" disabled={draft.blocks.length >= MAX_BLOCKS} onClick={() => update({ blocks: [...draft.blocks, newBlock(uid(), kind)] })}>+ Add block</button></div>
          </>}
        </>}
      </section>
      <aside className="studio-panel studio-settings" aria-label="Article settings"><h3>Article settings</h3>
        {!draft ? <p>Choose a local draft to edit its details.</p> : <>
          <p className="studio-hint">Status: Draft · Not published</p>
          <label>URL slug<input maxLength={160} value={draft.slug} onChange={event => update({ slug: event.target.value })} placeholder={slugFromTitle(draft.title) || "article-slug"}/></label>
          <button type="button" onClick={() => update({ slug: slugFromTitle(draft.title) })}>Generate slug from title</button>
          <label>Category<input maxLength={100} value={draft.category} onChange={event => update({ category: event.target.value })}/></label>
          <label>Tags (comma separated)<input maxLength={2000} value={draft.tags} onChange={event => update({ tags: event.target.value })}/></label>
          <label>Public byline<input maxLength={160} value={draft.author} onChange={event => update({ author: event.target.value })}/></label>
          <label>SEO title<input maxLength={240} value={draft.seoTitle} onChange={event => update({ seoTitle: event.target.value })}/></label>
          <label>SEO description<textarea rows={3} maxLength={500} value={draft.seoDescription} onChange={event => update({ seoDescription: event.target.value })}/></label>
          <div className="studio-next"><strong>Coming next</strong><p>Database saving, categories, photos and publishing are not enabled in this phase.</p></div>
          <button type="button" className="studio-discard" onClick={removeDraft}>Discard draft</button>
        </>}
      </aside>
    </div>
  </section>;
}
