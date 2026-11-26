import React, { useEffect, useRef, useState } from "react";
import { changePublication, DraftError, getPublication, type PublicationAction, type PublicationRequest, type PublicationState } from "../data/blogDraftRepository";
import { mediaReferenceCount, type StudioDraft } from "../data/blogStudio";

type Props = { draft: StudioDraft; revision: number; dirty: boolean; blocked: boolean; onDenied: () => void };
const messages = {
  denied: "Administrator access is no longer available.",
  conflict: "The saved revision or publication changed. Reload the saved version and refresh publication status.",
  invalid: "Publication rejected. Check article fields, slug, media and revision limits.",
  unavailable: "Publication outcome is uncertain. Retry the exact request before starting another action.",
};
export function StudioPublicationPanel({ draft, revision, dirty, blocked, onDenied }: Props) {
  const [state, setState] = useState<PublicationState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PublicationRequest | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const id = draft.id;
  function failure(reason: unknown, mutation: boolean) {
    const kind = reason instanceof DraftError ? reason.kind : "unavailable";
    if (kind === "denied") { onDenied(); return; }
    setError(mutation ? messages[kind] : "Publication status unavailable. Refresh to try again.");
    if (kind !== "unavailable") setPending(null);
    if (!mutation || kind === "conflict") setState(null);
  }
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    locked.current = true;
    setBusy(true); setState(null); setPending(null); setError(""); setNotice("");
    void getPublication(id, c.signal).then(result => {
      if (!c.signal.aborted) setState(result);
    }).catch(reason => {
      if (!c.signal.aborted) {
        if (reason instanceof DraftError && reason.kind === "denied") onDenied();
        else setError("Publication status unavailable. Refresh to try again.");
      }
    }).finally(() => {
      if (!c.signal.aborted) { locked.current = false; setBusy(false); }
    });
    return () => { c.abort(); };
  }, [id, onDenied]);
  async function refresh() {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || locked.current || pending) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const latest = await getPublication(id, signal);
      if (!signal.aborted) setState(latest);
    } catch (reason) { if (!signal.aborted) failure(reason, false); }
    finally { if (!signal.aborted) { locked.current = false; setBusy(false); } }
  }
  const hasMedia = mediaReferenceCount(draft) > 0;
  const canPublish = !!state && !dirty && !blocked && !busy && !pending && !hasMedia &&
    state.generation < 198 && state.source_revision !== null ? state.source_revision <= revision : !!state && !dirty && !blocked && !busy && !pending && !hasMedia && state.generation < 198;
  const canRemove = !!state && !blocked && !busy && !pending && state.generation > 0 && state.generation < 200;
  async function perform(action: PublicationAction, retry = false) {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || locked.current || !state || blocked) return;
    let request = pending;
    if (!retry) {
      if (request || (action === "publish" ? !canPublish : !canRemove)) return;
      if (action === "unpublish" && state.status !== "published" || action === "archive" && state.status === "archived") return;
      const verb = action === "publish" ? "Publish saved revision " + revision : action === "unpublish" ? "Unpublish this article" : "Archive this article";
      if (!window.confirm(verb + "? This changes the public blog.")) return;
      request = { draftId: id, revision, generation: state.generation, key: crypto.randomUUID(), action };
    }
    if (!request || request.action !== action) return;
    locked.current = true; setBusy(true); setError(""); setNotice(""); setPending(request);
    try {
      await changePublication(request, signal);
      if (signal.aborted) return;
      setPending(null);
      // A retry receipt can describe an older event. Always read live state.
      setState(null);
      setNotice("Publication request confirmed.");
      try {
        const latest = await getPublication(id, signal);
        if (!signal.aborted) setState(latest);
      } catch (reason) { if (!signal.aborted) failure(reason, false); }
    } catch (reason) { if (!signal.aborted) failure(reason, true); }
    finally { if (!signal.aborted) { locked.current = false; setBusy(false); } }
  }
  return <section className="studio-publication" aria-label="Publication controls">
    <h4>Publication</h4>
    {busy && <p role="status">Checking publication…</p>}
    {state && <>
      <p className="studio-hint">Status: {state.status === "published" ? "Published" : state.status === "archived" ? "Archived" : "Draft"}</p>
      <p className="studio-hint">Generation {state.generation} / 200{state.source_revision !== null && " · Published source revision " + state.source_revision}</p>
      {state.status === "published" && state.slug && <a href={"/blog/" + state.slug + "/"}>View published article</a>}
      {state.status === "published" && state.source_revision !== revision && <p className="studio-hint">Saved revision differs from the public version.</p>}
      {dirty && <p className="studio-hint">Save edits before publishing. Unpublish and archive affect the public version only.</p>}
      {hasMedia && <p className="studio-hint">Photo publication is not enabled in this rollout.</p>}
      {state.generation >= 198 && <p className="studio-hint">Publication limit reached. Remaining generations are reserved for removal.</p>}
      <button type="button" disabled={!canPublish} onClick={() => void perform("publish")}>{state.generation === 0 ? "Publish" : "Republish"}</button>
      {state.status === "published" && <button type="button" disabled={!canRemove} onClick={() => void perform("unpublish")}>Unpublish</button>}
      {state.generation > 0 && state.status !== "archived" && <button type="button" disabled={!canRemove} onClick={() => void perform("archive")}>Archive</button>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="studio-error">{error}</p>}
    {pending && !busy && <button type="button" disabled={blocked} onClick={() => void perform(pending.action, true)}>Retry publication request</button>}
    <button type="button" disabled={busy || !!pending} onClick={() => void refresh()}>Refresh publication status</button>
  </section>;
}
