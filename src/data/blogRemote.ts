import { articlePath, type BlogBlock, type BlogPost, type BlogSummary, validatePosts } from "./blog";
import { validSupabaseSettings } from "../lib/supabase";

export const isLiveBlogEnabled = (): boolean => import.meta.env?.VITE_ENABLE_LIVE_BLOG === "true";
const SELECT = "slug,title,description,author_name,status,published_at,featured,reading_minutes,cover_image,cover_alt,cover_width,cover_height,blog_categories(name),blog_post_tags(blog_tags(name))";
const PAGE_SIZE = 50;
const MAX_POSTS = 500;
type Row = Record<string, unknown>;

function invalid(): never { throw new Error("Invalid published article data"); }
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Row;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return invalid();
  return value;
}
function integer(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) return invalid();
  return value;
}
export function blogSlugForPath(path: string): string | null {
  const match = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  return match && match[1].length <= 160 ? match[1] : null;
}

function parseBlocks(value: unknown): BlogBlock[] {
  if (!Array.isArray(value) || !value.length || value.length > 2000) return invalid();
  return value.map((item): BlogBlock => {
    const block = row(item);
    switch (block.type) {
      case "heading": case "paragraph": case "quote":
        return { type: block.type, text: text(block.text, 1000000) };
      case "code":
        return { type: "code", text: text(block.text, 1000000), ...(block.language == null ? {} : { language: text(block.language, 100) }) };
      case "list":
        if (!Array.isArray(block.items) || !block.items.length || block.items.length > 2000) return invalid();
        return { type: "list", items: block.items.map((item) => text(item, 1000000)) };
      default: return invalid();
    }
  });
}

// Reject non-public records even if a proxy responds incorrectly. Do not
// parse/render unpublished content, and never read using an admin session.
export function decodeSummary(value: unknown, now = Date.now()): BlogSummary | null {
  const item = row(value);
  if (item.status !== "published") return null;
  const publishedAt = text(item.published_at, 100);
  if (!Number.isFinite(Date.parse(publishedAt))) return invalid();
  if (Date.parse(publishedAt) > now) return null;
  const slug = text(item.slug, 160);
  articlePath(slug);
  const category = text(row(item.blog_categories).name, 100);
  if (!Array.isArray(item.blog_post_tags) || item.blog_post_tags.length > 1000) return invalid();
  const tags = [...new Set(item.blog_post_tags.map((link) => text(row(row(link).blog_tags).name, 100)))].sort();
  if (typeof item.featured !== "boolean") return invalid();
  const summary: BlogSummary = {
    slug, title: text(item.title, 240), description: text(item.description, 2000),
    author: text(item.author_name, 160), category, tags, publishedAt,
    readingMinutes: integer(item.reading_minutes, 1440), featured: item.featured,
  };
  if ([item.cover_image, item.cover_alt, item.cover_width, item.cover_height].some((v) => v != null)) {
    const src = text(item.cover_image, 2000);
    if (!/^\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(src) || src.split("/").includes("..")) return invalid();
    summary.cover = { src, alt: text(item.cover_alt, 500), width: integer(item.cover_width, 20000), height: integer(item.cover_height, 20000) };
  }
  return summary;
}
export function decodeArticle(value: unknown, now = Date.now()): BlogPost | null {
  const summary = decodeSummary(value, now);
  if (!summary) return null;
  const post = { ...summary, blocks: parseBlocks(row(value).content) };
  validatePosts([post]);
  return post;
}

type PublicSettings = { url: string; key: string };
function settings(): PublicSettings {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  // Deliberately reject JWT/service-role/secret keys. Only the newer
  // publishable key is supported by this anonymous reader.
  if (!validSupabaseSettings(url, key) || typeof key !== "string" || !key.startsWith("sb_publishable_")) throw new Error("Blog is not configured");
  return { url, key };
}
async function read(config: PublicSettings, params: URLSearchParams, signal?: AbortSignal): Promise<unknown[]> {
  if (!validSupabaseSettings(config.url, config.key) || !config.key.startsWith("sb_publishable_")) throw new Error("Blog is not configured");
  const endpoint = new URL("/rest/v1/blog_posts", config.url);
  endpoint.search = params.toString();
  const response = await fetch(endpoint, {
    headers: { apikey: config.key, Accept: "application/json" },
    credentials: "omit", cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok) throw new Error("Blog data unavailable");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return invalid();
  return data;
}
function query(select: string, now: number): URLSearchParams {
  return new URLSearchParams({ select, status: "eq.published", published_at: "lte." + new Date(now).toISOString(), order: "published_at.desc,slug.asc" });
}
export async function loadBlogCatalogue(signal?: AbortSignal, config = settings()): Promise<BlogSummary[]> {
  const result: BlogSummary[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (let offset = 0; offset <= MAX_POSTS; offset += PAGE_SIZE) {
    const params = query(SELECT, now);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const data = await read(config, params, signal);
    if (data.length > PAGE_SIZE || (offset === MAX_POSTS && data.length > 0)) throw new Error("Blog catalogue limit exceeded");
    for (const entry of data) {
      const post = decodeSummary(entry, now);
      if (!post) continue;
      if (seen.has(post.slug)) return invalid();
      seen.add(post.slug);
      result.push(post);
    }
    if (data.length < PAGE_SIZE) return result;
  }
  return result;
}
export async function loadBlogArticle(slug: string, signal?: AbortSignal, config = settings()): Promise<BlogPost | null> {
  articlePath(slug);
  if (slug.length > 160) return null;
  const now = Date.now();
  const params = query(SELECT + ",content", now);
  params.set("slug", "eq." + slug);
  params.set("limit", "2");
  const data = await read(config, params, signal);
  if (data.length > 1) return invalid();
  if (!data.length) return null;
  const post = decodeArticle(data[0], now);
  if (post && post.slug !== slug) return invalid();
  return post;
}
