import { describe, expect, it, vi } from "vitest";
import { blogSlugForPath, decodeArticle, decodeSummary, loadBlogArticle, loadBlogCatalogue } from "../../../src/data/blogRemote";
const fixture = {
  slug: "fixture", title: "Fixture", description: "Description", author_name: "Test author", status: "published",
  published_at: "2026-01-01T00:00:00Z", featured: false, reading_minutes: 2,
  cover_image: null, cover_alt: null, cover_width: null, cover_height: null,
  blog_categories: { name: "Data" }, blog_post_tags: [{ blog_tags: { name: "SQL" } }],
  content: [{ type: "paragraph", text: "<script>escaped text</script>" }],
};
const config = { url: "https://mock.supabase.co", key: "sb_publishable_fixture" };
describe("anonymous blog reader", () => {
  it("maps public taxonomy and validated article blocks", () => {
    expect(decodeArticle(fixture)).toMatchObject({ author: "Test author", category: "Data", tags: ["SQL"], blocks: fixture.content });
    expect(decodeSummary(fixture)).not.toHaveProperty("blocks");
  });
  it.each(["draft", "archived", "other"])("rejects %s before decoding secret fields", (status) => {
    expect(decodeArticle({ status, content: "private" })).toBeNull();
  });
  it("rejects future content", () => expect(decodeArticle({ ...fixture, published_at: "2099-01-01" })).toBeNull());
  it("rejects invalid or unsafe content", () => {
    expect(() => decodeArticle({ ...fixture, slug: "../private" })).toThrow();
    expect(() => decodeArticle({ ...fixture, content: [{ type: "html", text: "unsafe" }] })).toThrow();
    expect(() => decodeArticle({ ...fixture, cover_image: "//evil.example", cover_alt: "x", cover_width: 1, cover_height: 1 })).toThrow();
  });
  it.each(["/blog/fixture", "/blog/fixture/"])("accepts exact slug path %s", (path) => expect(blogSlugForPath(path)).toBe("fixture"));
  it.each(["/blog/", "/blog/../private", "/blog/a/b", "//evil.example/blog/fixture/", "/blog/a?next=x", "/blog/%2e%2e/"])("rejects path %s", (path) => expect(blogSlugForPath(path)).toBeNull());
  it("reads only anonymous published metadata with no credentials or cache", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([fixture, { status: "draft" }])));
    expect(await loadBlogCatalogue(undefined, config)).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/rest/v1/blog_posts");
    expect(parsed.searchParams.get("status")).toBe("eq.published");
    expect(parsed.searchParams.get("select")).not.toContain(",content");
    expect(init?.credentials).toBe("omit");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(new Headers(init?.headers).get("apikey")).toBe(config.key);
  });
  it("paginates catalogue and rejects duplicates", async () => {
    const page = Array.from({length: 50}, (_, i) => ({...fixture, slug: "fixture-" + i}));
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(page))).mockResolvedValueOnce(new Response(JSON.stringify([fixture])));
    expect(await loadBlogCatalogue(undefined, config)).toHaveLength(51);
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("offset")).toBe("50");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify([fixture, fixture])));
    await expect(loadBlogCatalogue(undefined, config)).rejects.toThrow();
  });
  it("fetches exact article by slug and distinguishes missing from failure", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([fixture]))).mockResolvedValueOnce(new Response("[]")).mockResolvedValueOnce(new Response("private backend details", {status: 500}));
    expect((await loadBlogArticle("fixture", undefined, config))?.slug).toBe("fixture");
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("slug")).toBe("eq.fixture");
    expect(await loadBlogArticle("fixture", undefined, config)).toBeNull();
    await expect(loadBlogArticle("fixture", undefined, config)).rejects.toThrow("Blog data unavailable");
  });
  it("never sends a secret key", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(loadBlogCatalogue(undefined, {...config, key: "sb_secret_fixture"})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
