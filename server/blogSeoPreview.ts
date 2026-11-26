import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBlogSeoHandler } from "../src/data/blogSeo";
import { assertSeoPreviewIsolation } from "../scripts/seo-preview-isolation.mjs";

type Environment = Record<string, string | undefined>;
type Options = { env: Environment; reader?: typeof fetch; clock?: () => number; readShell?: () => Promise<string> };

// Extract only local Vite-generated CSS hrefs, never scripts or arbitrary HTML.
export function styleLinks(shell: string): string {
  const links = new Set<string>();
  for (const tag of shell.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']stylesheet["']/i.test(tag[0])) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (!href || !/^\/assets\/[A-Za-z0-9_-]+\.css$/.test(href)) throw new Error("Invalid build stylesheet");
    links.add(href);
  }
  if (!links.size || links.size > 16) throw new Error("Missing build stylesheets");
  return Array.from(links, href => '<link rel="stylesheet" href="' + href + '">').join("");
}
const headers = () => new Headers({
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Type": "text/plain; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
});
function fail(status: 404 | 405 | 503, head = false) {
  const h = headers();
  if (status === 405) h.set("Allow", "GET, HEAD");
  if (status === 503) h.set("Retry-After", "60");
  return new Response(head ? null : status === 404 ? "Not found" : status === 405 ? "Method not allowed" : "Blog temporarily unavailable", { status, headers: h });
}
const routeOk = (route: string) => route === "/sitemap.xml" || route === "/blog/" || route === "/blog" ||
  route === "/blog/sitemap.xml" || route === "/blog/rss.xml" || /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(route) && route.length <= 167;

export function createSeoPreviewHandler({ env, reader, clock, readShell = () => readFile(resolve(process.cwd(), "dist/blog-article/index.html"), "utf8") }: Options) {
  return async (request: Request): Promise<Response> => {
    const head = request.method === "HEAD";
    if (env.VERCEL_ENV !== "preview" || env.BLOG_SEO_PREVIEW !== "true") return fail(404, head);
    if (request.method !== "GET" && !head) return fail(405);
    const url = new URL(request.url);
    const routes = url.searchParams.getAll("route");
    if (routes.length !== 1 || Array.from(url.searchParams.keys()).some(key => key !== "route") || !routeOk(routes[0])) return fail(404, head);
    const origin = env.BLOG_SEO_SUPABASE_URL ?? "";
    const key = env.BLOG_SEO_SUPABASE_PUBLISHABLE_KEY ?? "";
    try {
      assertSeoPreviewIsolation(env);
      const upstream = new URL(origin);
      if (upstream.protocol !== "https:" || !upstream.hostname.endsWith(".supabase.co") || upstream.port ||
          upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash ||
          !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return fail(503, head);
      const result = await createBlogSeoHandler({ url: origin, key }, reader, clock)(routes[0]);
      const h = headers();
      const revision = env.VERCEL_GIT_COMMIT_SHA;
      if (revision && /^[a-f0-9]{40}$/.test(revision)) h.set("X-Blog-Preview-Revision", revision);
      for (const name of ["content-type", "retry-after"]) {
        const value = result.headers.get(name);
        if (value) h.set(name, value);
      }
      let body = await result.text();
      if (h.get("Content-Type")?.startsWith("text/html")) {
        const links = styleLinks(await readShell());
        body = body.replace('<meta name="robots" content="noindex,nofollow">', "").replace("</head>", () => links + '<meta name="robots" content="noindex,nofollow"></head>');
      }
      return new Response(head ? null : body, { status: result.status, headers: h });
    } catch { return fail(503, head); }
  };
}
