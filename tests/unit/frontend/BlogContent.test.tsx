import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogArticle, BlogCatalogue } from "../../../src/components/BlogContent";
import { articleForPath, articlePath, filterPosts, publishedPosts, validatePosts, type BlogPost } from "../../../src/data/blog";

const fixture: BlogPost = {
  slug: "fixture-ai", title: "Fixture AI article", description: "Example about retrieval",
  author: "Test author", category: "AI", tags: ["RAG"], publishedAt: "2026-01-02",
  readingMinutes: 3, featured: true,
  blocks: [{ type: "heading", text: "Introduction" }, { type: "paragraph", text: "Fixture only." }, { type: "code", text: "<script>alert(1)</script>", language: "html" }],
};
const second: BlogPost = { ...fixture, slug: "fixture-data", title: "Fixture data article", category: "Data", tags: ["SQL"], publishedAt: "2026-01-03", featured: false };

describe("published article catalogue", () => {
  it("does not ship sample articles", () => {
    expect(publishedPosts).toHaveLength(0);
    render(<BlogCatalogue posts={publishedPosts} />);
    expect(screen.getByRole("heading", { name: "No articles published yet." })).toBeVisible();
  });
  it("filters and sorts published posts and resolves only exact known article paths", () => {
    expect(filterPosts([fixture, second]).map((post) => post.slug)).toEqual([second.slug, fixture.slug]);
    expect(filterPosts([fixture, second], "retrieval RAG", "AI")).toEqual([fixture]);
    expect(articlePath(fixture.slug)).toBe("/blog/fixture-ai/");
    expect(articleForPath("/blog/fixture-ai", [fixture])).toBe(fixture);
    expect(articleForPath("/blog/unknown/", [fixture])).toBeUndefined();
    expect(articleForPath("//example.com/blog/fixture-ai/", [fixture])).toBeUndefined();
    expect(() => articlePath("../secret")).toThrow();
    expect(() => validatePosts([fixture, fixture])).toThrow();
    expect(() => validatePosts([fixture, second])).not.toThrow();
  });
  it("displays featured once, filters by search and category, clears empty results", async () => {
    const user = userEvent.setup();
    render(<BlogCatalogue posts={[fixture, second]} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Read article: Fixture AI article" })).toHaveAttribute("href", "/blog/fixture-ai/");
    await user.type(screen.getByRole("searchbox"), "RAG");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.selectOptions(screen.getByLabel("Category"), "Data");
    expect(screen.getByRole("heading", { name: "No matching articles." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
  it("renders article content, accessible contents navigation and related posts with escaped text", () => {
    const related = { ...second, category: "AI" };
    render(<BlogArticle post={fixture} posts={[fixture, related]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(fixture.title);
    expect(within(screen.getByRole("navigation", { name: "Table of contents" })).getByRole("link")).toHaveAttribute("href", "#section-1");
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Related articles" })).toBeVisible();
    const html = renderToString(<BlogArticle post={fixture} posts={[fixture]} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
