import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogArticle } from "../components/BlogContent";
import { articlePath, filterPosts, type BlogSummary } from "./blog";
import { decodeArticle, decodeSummary } from "./blogRemote";

// Isolated request-time rendering core. No Vercel route is activated here.
const SITE = "https://sergei-luna.vercel.app";
const SELECT = "slug,title,description,author_name,status,published_at,featured,reading_minutes,cover_image,cover_alt,cover_width,cover_height,blog_categories(name),blog_post_tags(blog_tags(name))";
const MAX_BYTES = 2_500_000;
const MAX_POSTS = 500;
const PAGE_SIZE = 50;
type Settings = { url: string; key: string };
type Reader = typeof fetch;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const xml = (value: string) => escape(Array.from(value).filter(char => {
  const point = char.codePointAt(0)!;
  return point === 9 || point === 10 || point === 13 || (point >= 32 && point <= 0xd7ff) ||
    (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff);
}).join(""));
const jsonScript = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const urlFor = (slug: string) => SITE + articlePath(slug);
const validSlug = (slug: string) => slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !["media", "readiness-probe"].includes(slug);
function endpoint(config: Settings) {
  const base = new URL(config.url);
  if (base.protocol !== "https:" || !base.hostname || base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key)) throw new Error("Unavailable");
  return new URL("/rest/v1/blog_posts", base);
}
async function rows(config: Settings, reader: Reader, params: URLSearchParams, signal: AbortSignal): Promise<unknown[]> {
  const target = endpoint(config);
  target.search = params.toString();
  const response = await reader(target, { headers: { apikey: config.key, Accept: "application/json" }, credentials: "omit", cache: "no-store", redirect: "error", signal });
  const stream = response.body;
  if (!response.ok || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !stream) {
    await stream?.cancel();
    throw new Error("Unavailable");
  }
  const r = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, body = "";
  try {
    for (;;) {
      if (signal.aborted) throw new Error("Unavailable");
      const chunk = await r.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error("Unavailable");
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    await r.cancel().catch(() => {});
    throw error;
  } finally { r.releaseLock(); }
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error("Unavailable");
  return parsed;
}
function query(select: string, now: number) {
  return new URLSearchParams({ select, status: "eq.published", published_at: "lte." + new Date(now).toISOString(), order: "published_at.desc,slug.asc" });
}
async function catalogue(config: Settings, reader: Reader, now: number, signal: AbortSignal) {
  const posts: BlogSummary[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset <= MAX_POSTS; offset += PAGE_SIZE) {
    const params = query(SELECT, now);
    params.set("limit", String(PAGE_SIZE)); params.set("offset", String(offset));
    const data = await rows(config, reader, params, signal);
    if (data.length > PAGE_SIZE || (offset === MAX_POSTS && data.length)) throw new Error("Unavailable");
    for (const raw of data) {
      const post = decodeSummary(raw, now);
      if (!post) continue;
      if (!validSlug(post.slug) || seen.has(post.slug)) throw new Error("Unavailable");
      seen.add(post.slug); posts.push(post);
    }
    if (data.length < PAGE_SIZE) return filterPosts(posts);
  }
  return filterPosts(posts);
}
function response(body: string, status: number, type = "text/html; charset=utf-8") {
  return new Response(body, { status, headers: { "Content-Type": type, "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": status === 200 ? "index, follow" : "noindex, nofollow",
    ...(status === 503 ? { "Retry-After": "60" } : {}) } });
}
function html(title: string, description: string, content: string, canonical?: string, extra = "") {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    escape(title) + '</title><meta name="description" content="' + escape(description) + '">' +
    (canonical ? '<link rel="canonical" href="' + escape(canonical) + '">' : '<meta name="robots" content="noindex,nofollow">') +
    extra + '</head><body><main><a href="/blog/">All articles</a>' + content + '</main></body></html>';
}
function errorPage(status: 404 | 503) {
  const title = status === 404 ? "Article not found" : "Blog temporarily unavailable";
  return response(html(title, title, "<h1>" + title + "</h1>"), status);
}
function seoText(value: unknown, fallback: string, max: number): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string" || value.length > max || !value.trim()) throw new Error("Unavailable");
  return value;
}
export function createBlogSeoHandler(config: Settings, reader: Reader = fetch, clock = Date.now) {
  return async function handle(path: string): Promise<Response> {
    const match = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
    const listing = path === "/blog/" || path === "/blog";
    const sitemap = path === "/blog/sitemap.xml";
    const rss = path === "/blog/rss.xml";
    if (!listing && !sitemap && !rss && (!match || !validSlug(match[1]))) return errorPage(404);
    try {
      const now = clock(), signal = AbortSignal.timeout(10000);
      if (listing || sitemap || rss) {
        const posts = await catalogue(config, reader, now, signal);
        if (sitemap) return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + SITE + '/blog/</loc></url>' +
          posts.map(post => "<url><loc>" + xml(urlFor(post.slug)) + "</loc></url>").join("") + "</urlset>", 200, "application/xml; charset=utf-8");
        if (rss) return response('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog &amp; Insights</title><link>' + SITE + '/blog/</link><description>Software, data and AI articles.</description>' +
          posts.map(post => "<item><title>" + xml(post.title) + "</title><link>" + xml(urlFor(post.slug)) + "</link><guid isPermaLink=\"true\">" + xml(urlFor(post.slug)) +
          "</guid><description>" + xml(post.description) + "</description><pubDate>" + new Date(post.publishedAt).toUTCString() + "</pubDate></item>").join("") + "</channel></rss>", 200, "application/rss+xml; charset=utf-8");
        const body = renderToStaticMarkup(<><h1>Blog &amp; Insights</h1><a href="/blog/rss.xml">RSS feed</a><ul>{posts.map(post => <li key={post.slug}><h2><a href={articlePath(post.slug)}>{post.title}</a></h2><p>{post.description}</p></li>)}</ul>{!posts.length && <p>No articles published yet.</p>}</>);
        return response(html("Blog & Insights — Sergei Patrushev", "Articles on software, data and AI.", body, SITE + "/blog/"), 200);
      }
      const slug = match![1], params = query(SELECT + ",content,seo_title,seo_description", now);
      params.set("slug", "eq." + slug); params.set("limit", "2");
      const data = await rows(config, reader, params, signal);
      if (data.length > 1) throw new Error("Unavailable");
      if (!data.length) return errorPage(404);
      const post = decodeArticle(data[0], now);
      if (!post) return errorPage(404);
      if (post.slug !== slug) throw new Error("Unavailable");
      const raw = data[0] as Record<string, unknown>;
      const title = seoText(raw.seo_title, post.title, 240) + " — Sergei Patrushev";
      const description = seoText(raw.seo_description, post.description, 500);
      const canonical = urlFor(post.slug);
      const image = SITE + (post.cover?.src ?? "/images/social-card.png");
      const tags = '<meta property="og:type" content="article"><meta property="og:url" content="' + escape(canonical) +
        '"><meta property="og:title" content="' + escape(title) + '"><meta property="og:description" content="' + escape(description) +
        '"><meta property="og:image" content="' + escape(image) + '"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + escape(title) +
        '"><meta name="twitter:description" content="' + escape(description) + '"><meta name="twitter:image" content="' + escape(image) + '">' +
        '<script type="application/ld+json">' + jsonScript({ "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title,
          description: post.description, datePublished: post.publishedAt, author: { "@type": "Person", name: post.author }, mainEntityOfPage: canonical,
          ...(post.cover ? { image } : {}) }) + '</script>';
      return response(html(title, description, renderToStaticMarkup(<BlogArticle post={post} posts={[]} />), canonical, tags), 200);
    } catch { return errorPage(503); }
  };
}
