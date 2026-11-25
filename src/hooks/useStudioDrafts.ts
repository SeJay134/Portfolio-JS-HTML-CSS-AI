import { useCallback, useEffect, useRef, useState } from "react";
import { DraftError, getDraft, listDrafts, listRevisions, saveDraft, type SaveRequest, type SavedDraft, type RevisionSummary } from "../data/blogDraftRepository";
import type { StudioDraft } from "../data/blogStudio";

// Every request is scoped to the mounted, authorized workspace. No browser storage.
export const AUTOSAVE_MS = 15000;
type Failure = { kind: DraftError["kind"]; message: string };
const failure = (reason: unknown): Failure => reason instanceof DraftError
  ? { kind: reason.kind, message: reason.message } : { kind: "unavailable", message: "Draft service unavailable." };

export function useStudioDrafts(enabled: boolean) {
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [saved, setSaved] = useState<Record<string, SavedDraft>>({});
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState("");
  const [denied, setDenied] = useState(false);
  const [failures, setFailures] = useState<Record<string, Failure>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const lifecycle = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pending = useRef(new Map<string, SaveRequest>());
  const deny = useCallback(() => {
    lifecycle.current?.abort();
    pending.current.clear();
    setDrafts([]); setSaved({}); setFailures({}); setBusy(null); setDenied(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    lifecycle.current = controller;
    const requests = pending.current;
    setLoading(true); setLoadError("");
    void (async () => {
      try {
        const summaries = await listDrafts(controller.signal);
        const loaded: SavedDraft[] = [];
        // Sequential reads, at most 20 documents; the server limits total history.
        for (const item of summaries) {
          if (controller.signal.aborted) return;
          loaded.push(await getDraft(item.id, controller.signal));
        }
        if (controller.signal.aborted) return;
        setDrafts(loaded.map(item => item.document));
        setSaved(Object.fromEntries(loaded.map(item => [item.id, item])));
      } catch (reason) {
        if (controller.signal.aborted) return;
        const problem = failure(reason);
        if (problem.kind === "denied") deny();
        else setLoadError(problem.message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); requests.clear(); };
  }, [enabled, attempt, deny]);

  const isDirty = (doc: StudioDraft) => !saved[doc.id] || JSON.stringify(doc) !== JSON.stringify(saved[doc.id].document);
  const dirty = enabled ? drafts.some(isDirty) : drafts.length > 0;
  const save = useCallback(async (doc: StudioDraft, manual = false) => {
    const signal = lifecycle.current?.signal;
    if (!enabled || !signal || signal.aborted || lock.current || loading || loadError || denied) return;
    const previous = failures[doc.id];
    if (previous?.kind === "conflict" || (!manual && previous)) return;
    if (saved[doc.id] && JSON.stringify(doc) === JSON.stringify(saved[doc.id].document) && !pending.current.has(doc.id)) return;
    lock.current = true; setBusy(doc.id);
    const request = pending.current.get(doc.id) ?? { document: doc, expected: saved[doc.id]?.revision ?? 0, key: crypto.randomUUID() };
    pending.current.set(doc.id, request);
    try {
      const receipt = await saveDraft(request, signal);
      if (signal.aborted) return;
      pending.current.delete(doc.id);
      setSaved(items => ({ ...items, [doc.id]: { ...receipt, document: request.document } }));
      setFailures(items => { const next = { ...items }; delete next[doc.id]; return next; });
    } catch (reason) {
      if (signal.aborted) return;
      const problem = failure(reason);
      if (problem.kind === "denied") { deny(); return; }
      // Preserve exact uncertain request for safe idempotent retry. Determinate
      // validation/conflict errors did not commit and may be corrected.
      if (problem.kind !== "unavailable") pending.current.delete(doc.id);
      setFailures(items => ({ ...items, [doc.id]: problem }));
    } finally {
      lock.current = false;
      if (!signal.aborted) setBusy(null);
    }
  }, [enabled, loading, loadError, denied, failures, saved, deny]);

  useEffect(() => {
    if (!enabled || !auto || loading || loadError || denied || busy) return;
    const next = drafts.find(doc => !failures[doc.id] && (!saved[doc.id] || JSON.stringify(doc) !== JSON.stringify(saved[doc.id].document)));
    if (!next) return;
    const timer = window.setTimeout(() => { void save(next); }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, auto, loading, loadError, denied, busy, drafts, failures, saved, save]);

  async function reload(doc: StudioDraft) {
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted || lock.current || !saved[doc.id] && !failures[doc.id]) return;
    lock.current = true; setBusy(doc.id);
    try {
      const latest = await getDraft(doc.id, signal);
      if (signal.aborted) return;
      pending.current.delete(doc.id);
      setSaved(items => ({ ...items, [doc.id]: latest }));
      setDrafts(items => items.map(item => item.id === doc.id ? latest.document : item));
      setFailures(items => { const next = { ...items }; delete next[doc.id]; return next; });
    } catch (reason) {
      if (signal.aborted) return;
      const problem = failure(reason);
      if (problem.kind === "denied") deny();
      else setFailures(items => ({ ...items, [doc.id]: problem }));
    } finally { lock.current = false; if (!signal.aborted) setBusy(null); }
  }
  async function history(draftId: string): Promise<RevisionSummary[]> {
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted) return [];
    try { const result = await listRevisions(draftId, signal); return signal.aborted ? [] : result; }
    catch (reason) { if (!signal.aborted && failure(reason).kind === "denied") deny(); throw reason; }
  }
  async function restore(doc: StudioDraft, rev: number) {
    const signal = lifecycle.current?.signal;
    if (!signal || signal.aborted || lock.current || failures[doc.id] || pending.current.has(doc.id)) return;
    lock.current = true; setBusy(doc.id);
    try {
      const historical = await getDraft(doc.id, signal, rev);
      if (!signal.aborted) setDrafts(items => items.map(item => item.id === doc.id ? historical.document : item));
    } catch (reason) {
      if (signal.aborted) return;
      const problem = failure(reason);
      if (problem.kind === "denied") deny();
      else setFailures(items => ({ ...items, [doc.id]: problem }));
    } finally { lock.current = false; if (!signal.aborted) setBusy(null); }
  }
  function discardLocal(doc: StudioDraft) {
    if (saved[doc.id] || pending.current.has(doc.id) || lock.current || failures[doc.id]?.kind === "conflict") return false;
    setDrafts(items => items.filter(item => item.id !== doc.id));
    setFailures(items => { const next = { ...items }; delete next[doc.id]; return next; });
    return true;
  }
  function edited(docId: string) {
    // A corrected deterministic validation error may be retried automatically.
    // Network uncertainty and conflicts need explicit user action.
    setFailures(items => {
      if (items[docId]?.kind !== "invalid") return items;
      const next = { ...items }; delete next[docId]; return next;
    });
  }
  return { drafts, setDrafts, saved, loading, loadError, denied, dirty, isDirty, failures, busy, auto, setAuto,
    save, reload, history, restore, discardLocal, edited, retryLoad: () => setAttempt(value => value + 1) };
}
