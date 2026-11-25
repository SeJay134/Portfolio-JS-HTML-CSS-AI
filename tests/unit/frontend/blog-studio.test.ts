import { describe, expect, it } from "vitest";
import { decodeRichParagraph, safeBlogHref } from "../../../src/data/blogRichText";
import { fitsDraft, moveBlock, newBlock, newDraft, previewPost, slugFromTitle } from "../../../src/data/blogStudio";
import { decodeArticle } from "../../../src/data/blogRemote";

describe("structured Studio content", () => {
  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.example", "/\\evil.example", "https://user:pass@example.com", "https://example.com/\n", " https://example.com", "file:///tmp/a", "https:evil.example"])("rejects unsafe link %s", value => {
    expect(safeBlogHref(value)).toBe(false);
    expect(() => decodeRichParagraph({ type: "rich-paragraph", version: 1, runs: [{ text: "x", href: value }] })).toThrow();
  });
  it.each(["/blog/example/", "https://example.com/path?q=1", "http://example.com"])("accepts safe link %s", value => {
    expect(safeBlogHref(value)).toBe(true);
  });
  it("rejects unsupported versions, malformed marks, extra keys and oversized runs", () => {
    const good = { type: "rich-paragraph", version: 1, runs: [{ text: "x", bold: true }] };
    expect(decodeRichParagraph(good)).toEqual(good);
    for (const bad of [{ ...good, version: 2 }, { ...good, html: "<img>" },
      { ...good, runs: [{ text: "x", bold: "true" }] }, { ...good, runs: [{ text: "x", html: "<script>" }] },
      { ...good, runs: [{ text: "x".repeat(10001) }] }, { ...good, runs: [] }]) {
      expect(() => decodeRichParagraph(bad)).toThrow();
    }
  });
  it("creates a preview with legacy and formatted blocks, without changing the draft", () => {
    const draft = newDraft("draft", "p");
    draft.title = "Café & Data";
    draft.tags = "AI, SQL, AI";
    draft.blocks[0].runs = [{ text: "A " }, { text: "bold link", bold: true, italic: true, href: "/blog/example/" }];
    draft.blocks.push({ ...newBlock("h", "heading"), text: "Heading" }, { ...newBlock("l", "list"), text: "One\n\nTwo" });
    const original = JSON.stringify(draft);
    const post = previewPost(draft);
    expect(post.slug).toBe("cafe-data");
    expect(post.tags).toEqual(["AI", "SQL"]);
    expect(post.blocks.map(block => block.type)).toEqual(["rich-paragraph", "heading", "list"]);
    expect(post.blocks[2]).toEqual({ type: "list", items: ["One", "Two"] });
    expect(JSON.stringify(draft)).toBe(original);
    expect(slugFromTitle("Привет")).toBe("");
  });
  it("keeps draft limits, ordering and invalid links fail closed", () => {
    const draft = newDraft("draft", "a");
    draft.blocks.push(newBlock("b"));
    expect(moveBlock(draft.blocks, 1, -1).map(block => block.id)).toEqual(["b", "a"]);
    expect(moveBlock(draft.blocks, 0, -1)).toBe(draft.blocks);
    draft.blocks[0].runs[0] = { text: "x", href: "javascript:alert(1)" };
    expect(() => previewPost(draft)).toThrow();
    draft.description = "Ж".repeat(600000);
    expect(fitsDraft(draft)).toBe(false);
    expect(() => previewPost(draft)).toThrow();
  });
  it("decodes the new public format without loosening the legacy reader", () => {
    const fixture = { slug: "fixture", title: "Title", description: "Summary", author_name: "Author",
      status: "published", published_at: "2026-01-01", featured: false, reading_minutes: 1,
      blog_categories: { name: "Data" }, blog_post_tags: [],
      content: [{ type: "rich-paragraph", version: 1, runs: [{ text: "<script>", bold: true }] }] };
    expect(decodeArticle(fixture)?.blocks).toEqual(fixture.content);
    expect(() => decodeArticle({ ...fixture, content: [{ ...fixture.content[0], version: 2 }] })).toThrow();
    expect(decodeArticle({ ...fixture, status: "draft" })).toBeNull();
  });
});
