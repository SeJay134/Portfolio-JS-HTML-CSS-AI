import type { BlogBlock, BlogPost } from "./blog";
import { decodeRichParagraph, safeBlogHref, type RichRun } from "./blogRichText";

export const STUDIO_SCHEMA_VERSION = 1;
export const MAX_DRAFTS = 20;
export const MAX_BLOCKS = 100;
export const MAX_DRAFT_BYTES = 1048576;
export const MAX_TEXT = 10000;
export type StudioImage = { assetId: string; alt: string; caption: string };
export type BlockKind = "heading" | "paragraph" | "quote" | "list" | "code" | "image" | "gallery";
export type StudioBlock = { id: string; kind: BlockKind; text: string; language: string; runs: RichRun[]; images?: StudioImage[] };
export type StudioDraft = {
  id: string; version: 1 | 2; title: string; description: string; slug: string; category: string;
  tags: string; author: string; seoTitle: string; seoDescription: string; blocks: StudioBlock[]; cover?: StudioImage | null;
};

export function newBlock(id: string, kind: BlockKind = "paragraph"): StudioBlock {
  return { id, kind, text: "", language: "", runs: [{ text: "" }] };
}
export function newDraft(id: string, blockId: string): StudioDraft {
  return { id, version: STUDIO_SCHEMA_VERSION, title: "", description: "", slug: "", category: "",
    tags: "", author: "", seoTitle: "", seoDescription: "", blocks: [newBlock(blockId)] };
}
export function slugFromTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160).replace(/-+$/g, "");
}
export function fitsDraft(draft: StudioDraft): boolean {
  return new TextEncoder().encode(JSON.stringify(draft)).byteLength <= MAX_DRAFT_BYTES;
}
export function moveBlock(blocks: StudioBlock[], index: number, direction: -1 | 1): StudioBlock[] {
  const next = index + direction;
  if (index < 0 || index >= blocks.length || next < 0 || next >= blocks.length) return blocks;
  const result = [...blocks];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function mediaReferenceCount(draft: StudioDraft): number {
  return (draft.cover ? 1 : 0) + draft.blocks.reduce((n, block) => n + (block.images?.length ?? 0), 0);
}
export type StudioPreview = BlogPost & { privateMedia?: { cover: StudioImage | null; blocks: Record<number, StudioImage[]> } };
export function previewPost(draft: StudioDraft): StudioPreview {
  if (![1,2].includes(draft.version) || !fitsDraft(draft) || draft.blocks.length > MAX_BLOCKS) throw new Error("Draft exceeds supported limits.");
  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error("Use lowercase letters, numbers and hyphens in the URL slug.");
  const blocks: BlogBlock[] = [];
  const privateBlocks: Record<number, StudioImage[]> = {};
  for (const block of draft.blocks) {
    if (block.kind === "image" || block.kind === "gallery") {
      if (draft.version !== 2 || !block.images?.length) throw new Error("Invalid media block.");
      privateBlocks[blocks.length] = block.images;
      blocks.push({ type: "quote", text: "" });
    } else if (block.kind === "paragraph") {
      if (block.runs.some(run => run.href !== undefined && !safeBlogHref(run.href))) throw new Error("Use an http/https or internal path for links.");
      const runs = block.runs.filter(run => run.text.length > 0);
      if (!runs.some(run => run.text.trim())) continue;
      if (runs.some(run => run.bold || run.italic || run.href)) blocks.push(decodeRichParagraph({ type: "rich-paragraph", version: 1, runs }));
      else blocks.push({ type: "paragraph", text: runs.map(run => run.text).join("") });
    } else if (block.kind === "list") {
      const items = block.text.split("\n").map(item => item.trim()).filter(Boolean);
      if (items.length > 2000) throw new Error("List has too many items.");
      if (items.length) blocks.push({ type: "list", items });
    } else if (block.kind === "heading" || block.kind === "quote" || block.kind === "code") {
      if (!block.text.trim()) continue;
      if (block.kind === "code") blocks.push({ type: "code", text: block.text, ...(block.language.trim() ? { language: block.language.trim() } : {}) });
      else blocks.push({ type: block.kind, text: block.text });
    } else throw new Error("Unsupported content block.");
  }
  const words = blocks.map(block => block.type === "list" ? block.items.join(" ") :
    block.type === "rich-paragraph" ? block.runs.map(run => run.text).join("") : block.text).join(" ").trim().split(/\s+/u).filter(Boolean).length;
  return { slug: draft.slug || slugFromTitle(draft.title) || "local-preview",
    title: draft.title.trim() || "Untitled draft", description: draft.description, author: draft.author.trim() || "Author",
    category: draft.category.trim() || "Uncategorized", tags: [...new Set(draft.tags.split(",").map(tag => tag.trim()).filter(Boolean))],
    publishedAt: "1970-01-01T00:00:00.000Z", readingMinutes: Math.max(1, Math.ceil(words / 200)), blocks,
    ...(draft.version === 2 ? { privateMedia: { cover: draft.cover ?? null, blocks: privateBlocks } } : {}) };
}
