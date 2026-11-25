import { getSupabase } from "../lib/supabase";
import { fitsDraft, MAX_BLOCKS, MAX_DRAFTS, MAX_TEXT, type StudioDraft, type StudioBlock, type BlockKind, type StudioImage, mediaReferenceCount } from "./blogStudio";
import { safeBlogHref, type RichRun } from "./blogRichText";

export const draftPersistenceEnabled = () => import.meta.env.VITE_ENABLE_BLOG_DRAFTS === "true";
export type DraftSummary = { id: string; revision: number; title: string; category: string; slug: string; updated_at: string };
export type SavedDraft = { id: string; revision: number; updated_at: string; document: StudioDraft };
export type SaveReceipt = Omit<SavedDraft, "document">;
export type SaveRequest = { document: StudioDraft; expected: number; key: string };
export type RevisionSummary = { revision: number; created_at: string };
export class DraftError extends Error {
  constructor(public kind: "denied" | "conflict" | "invalid" | "unavailable", message: string) { super(message); }
}
const invalid = (): never => { throw new DraftError("invalid", "Invalid draft data or limits exceeded."); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function exact(obj: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(k => !Object.hasOwn(obj, k)) || Object.keys(obj).some(k => !required.includes(k) && !optional.includes(k))) invalid();
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) return invalid();
  return value;
}
function id(value: unknown): string {
  const s = text(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return invalid();
  return s;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) return invalid();
  return value;
}
function date(value: unknown): string {
  const s = text(value, 100);
  if (!Number.isFinite(Date.parse(s))) return invalid();
  return s;
}
function slug(value: unknown): string {
  const s = text(value, 160);
  if (s && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return invalid();
  return s;
}
function validDraftHref(value: unknown): value is string {
  return safeBlogHref(value) && (value.startsWith("/") || /^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#].*)?$/i.test(value));
}
function image(value: unknown): StudioImage {
  const row=object(value); exact(row,["assetId","alt","caption"]);
  return {assetId:id(row.assetId),alt:text(row.alt,500),caption:text(row.caption,1000)};
}
export function decodeDraft(value: unknown): StudioDraft {
  const d = object(value);
  exact(d, ["id","version","title","description","slug","category","tags","author","seoTitle","seoDescription","blocks",...(d.version===2?["cover"]:[])]);
  if ((d.version !== 1 && d.version !== 2) || !Array.isArray(d.blocks) || d.blocks.length > MAX_BLOCKS) return invalid();
  const ids = new Set<string>();
  const blocks = d.blocks.map((value): StudioBlock => {
    const b = object(value);
    const media=b.kind==="image"||b.kind==="gallery";
    if(media&&d.version!==2)return invalid();
    exact(b, ["id","kind","text","language","runs",...(media?["images"]:[])]);
    const blockId = id(b.id);
    if (ids.has(blockId) || !["heading","paragraph","quote","list","code","image","gallery"].includes(String(b.kind)) ||
      typeof b.kind !== "string" || !Array.isArray(b.runs) || !b.runs.length || b.runs.length > 50) return invalid();
    ids.add(blockId);
    const body = text(b.text, MAX_TEXT);
    if (b.kind === "list" && body.split("\n").length > 2000) return invalid();
    const runs = b.runs.map((value): RichRun => {
      const run = object(value);
      exact(run, ["text"], ["bold","italic","href"]);
      if ((run.bold !== undefined && typeof run.bold !== "boolean") ||
          (run.italic !== undefined && typeof run.italic !== "boolean") ||
          (run.href !== undefined && !validDraftHref(run.href))) return invalid();
      return { text: text(run.text, MAX_TEXT), ...(typeof run.bold === "boolean" ? { bold: run.bold } : {}),
        ...(typeof run.italic === "boolean" ? { italic: run.italic } : {}), ...(typeof run.href === "string" ? { href: run.href } : {}) };
    });
    const result: StudioBlock={ id: blockId, kind: b.kind as BlockKind, text: body, language: text(b.language, 100), runs };
    if(media){
      if(body!==""||result.language!==""||runs.length!==1||runs[0].text!==""||Object.keys(runs[0]).length!==1||
        !Array.isArray(b.images)||(b.kind==="image"?b.images.length!==1:b.images.length<2||b.images.length>8))return invalid();
      const images=b.images.map(image);
      if(new Set(images.map(i=>i.assetId)).size!==images.length)return invalid();
      result.images=images;
    }
    return result;
  });
  const doc: StudioDraft = { id: id(d.id), version: d.version, title: text(d.title, 240), description: text(d.description, 2000),
    slug: slug(d.slug), category: text(d.category, 100), tags: text(d.tags, 2000), author: text(d.author, 160),
    seoTitle: text(d.seoTitle, 240), seoDescription: text(d.seoDescription, 500), blocks,
    ...(d.version===2?{cover:d.cover===null?null:image(d.cover)}:{}) };
  if (!fitsDraft(doc) || mediaReferenceCount(doc)>20) return invalid();
  return doc;
}
function receipt(value: unknown): SaveReceipt {
  const r = object(value);
  return { id: id(r.id), revision: revision(r.revision), updated_at: date(r.updated_at) };
}
export function decodeSavedDraft(value: unknown, expectedId: string, expectedRevision?: number): SavedDraft {
  const r = object(value);
  const saved = { ...receipt(r), document: decodeDraft(r.document) };
  if (saved.id !== expectedId || saved.document.id !== expectedId ||
      (expectedRevision !== undefined && saved.revision !== expectedRevision)) return invalid();
  return saved;
}
async function rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  if (!draftPersistenceEnabled() || signal.aborted) throw new DraftError("unavailable", "Draft service unavailable.");
  const client = getSupabase();
  if (!client) throw new DraftError("unavailable", "Draft service unavailable.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(cancel, 12000);
  try {
    const { data, error, status } = await client.rpc(name, args).abortSignal(controller.signal);
    if (signal.aborted || controller.signal.aborted) throw new DraftError("unavailable", "Request interrupted. Retry to confirm the save.");
    if (error) {
      if (status === 401 || status === 403 || error.code === "42501") throw new DraftError("denied", "Administrator access is no longer available.");
      if (error.code === "40001") throw new DraftError("conflict", "Another save changed this draft. Reload the saved version or keep your unsaved edits.");
      if (error.code === "23505") throw new DraftError("invalid", "This URL slug is already reserved.");
      if (error.code === "22023" || error.code === "23514") throw new DraftError("invalid", "Draft validation or storage limit reached. Check fields, or stop and review revision limits.");
      throw new DraftError("unavailable", "Draft service unavailable. Retry to confirm the save.");
    }
    return data;
  } catch (error) {
    if (error instanceof DraftError) throw error;
    throw new DraftError("unavailable", "Draft service unavailable. Retry to confirm the save.");
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
export async function listDrafts(signal: AbortSignal): Promise<DraftSummary[]> {
  const rows = await rpc("list_studio_drafts", {}, signal);
  if (!Array.isArray(rows) || rows.length > MAX_DRAFTS) return invalid();
  const seen = new Set<string>();
  return rows.map(value => {
    const r = object(value);
    const summary = { ...receipt(r), title: text(r.title, 240), category: text(r.category, 100), slug: slug(r.slug) };
    if (seen.has(summary.id)) return invalid();
    seen.add(summary.id);
    return summary;
  });
}
export async function getDraft(draftId: string, signal: AbortSignal, rev?: number): Promise<SavedDraft> {
  const value = await rpc("get_studio_draft", { p_id: id(draftId), ...(rev !== undefined ? { p_revision: revision(rev) } : {}) }, signal);
  return decodeSavedDraft(value, draftId, rev);
}
export async function saveDraft(request: SaveRequest, signal: AbortSignal): Promise<SaveReceipt> {
  const doc = decodeDraft(request.document);
  if (!Number.isInteger(request.expected) || request.expected < 0 || request.expected >= 100) return invalid();
  const raw=await rpc("save_studio_draft", { p_id: doc.id, p_expected_revision: request.expected,
    p_request_id: id(request.key), p_document: doc }, signal);
  try {
    const result=receipt(raw);
    if(result.id!==doc.id||result.revision!==request.expected+1)return invalid();
    return result;
  } catch {
    throw new DraftError("unavailable","Save receipt not confirmed. Retry the same request.");
  }
}
export async function listRevisions(draftId: string, signal: AbortSignal): Promise<RevisionSummary[]> {
  const rows = await rpc("list_studio_revisions", { p_id: id(draftId) }, signal);
  if (!Array.isArray(rows) || rows.length > 100) return invalid();
  const seen = new Set<number>();
  return rows.map(value => {
    const r = object(value), rev = revision(r.revision);
    if (seen.has(rev)) return invalid();
    seen.add(rev);
    return { revision: rev, created_at: date(r.created_at) };
  });
}
