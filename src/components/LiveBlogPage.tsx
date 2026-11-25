import React, { useEffect, useState } from "react";
import { BlogPage } from "./BlogPage";
import { type BlogPost, type BlogSummary } from "../data/blog";
import { blogSlugForPath, loadBlogArticle, loadBlogCatalogue } from "../data/blogRemote";

type State = { kind: "loading" | "error" | "missing" } | { kind: "catalogue"; posts: BlogSummary[] } | { kind: "article"; post: BlogPost; posts: BlogSummary[] };
export function LiveBlogPage({ pathname }: { pathname: string }) {
  const slug = blogSlugForPath(pathname);
  const catalogue = pathname === "/blog/" || pathname === "/blog";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let articleLoaded = false;
    const timeout = window.setTimeout(() => { controller.abort(); if (active && !articleLoaded) setState({ kind: "error" }); }, 12000);
    async function load() {
      if (!catalogue && !slug) return { kind: "missing" } as const;
      if (catalogue) return { kind: "catalogue", posts: await loadBlogCatalogue(controller.signal) } as const;
      const post = await loadBlogArticle(slug!, controller.signal);
      if (!post) return { kind: "missing" } as const;
      // Render the article immediately; optional related metadata must not
      // delay or replace it if catalogue loading fails or times out.
      if (active && !controller.signal.aborted) {
        articleLoaded = true;
        setState({ kind: "article", post, posts: [] });
      }
      const posts = await loadBlogCatalogue(controller.signal).catch(() => []);
      return { kind: "article", post, posts } as const;
    }
    void load().then((next) => {
      if (active && !controller.signal.aborted) setState(next);
    }).catch(() => { if (active) setState({ kind: "error" }); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [slug, catalogue, attempt]);

  // Revalidate after returning to a cached tab/page. Never intentionally show
  // an old database article if the fresh request fails.
  useEffect(() => {
    const refresh = () => { setState({ kind: "loading" }); setAttempt((n) => n + 1); };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", onShow);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", onShow); };
  }, []);
  useEffect(() => {
    if (catalogue) return;
    document.title = state.kind === "article" ? state.post.title + " — Sergei Patrushev" : "Blog — Sergei Patrushev";
    // Dynamic article routes remain noindex until server-side SEO and
    // unpublication behavior are verified in a later publishing phase.
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); }
    robots.content = "noindex,nofollow";
  }, [catalogue, state]);

  if (state.kind === "catalogue") return <BlogPage posts={state.posts} />;
  if (state.kind === "article") return <BlogPage article={state.post} posts={state.posts} />;
  const notice = <section className="blog-empty">
    {state.kind === "loading" ? <p role="status">Loading published articles…</p> : state.kind === "missing" ? <>
      <h1>Article not found.</h1><p>This article is not currently published.</p>
    </> : <>
      {catalogue ? <h2>Articles temporarily unavailable.</h2> : <h1>Article temporarily unavailable.</h1>}
      <p role="alert">Please try again later.</p>
      <button type="button" className="button secondary" onClick={() => { setState({ kind: "loading" }); setAttempt((n) => n + 1); }}>Retry</button>
    </>}
  </section>;
  return <BlogPage posts={[]} notice={notice} articleRoute={!catalogue} />;
}
