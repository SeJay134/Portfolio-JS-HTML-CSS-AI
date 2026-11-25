import { expect, test, type Page } from "@playwright/test";

const fixture = {
  slug: "fixture", title: "Fixture published article", description: "A public article about retrieval",
  author_name: "Fixture author", status: "published", published_at: "2026-01-01T00:00:00Z",
  featured: false, reading_minutes: 2, cover_image: null, cover_alt: null, cover_width: null, cover_height: null,
  blog_categories: { name: "Data" }, blog_post_tags: [{ blog_tags: { name: "SQL" } }],
  content: [{ type: "paragraph", text: "Fixture article body" }],
};
async function mockApi(page: Page, fail = false, getPublished: () => Record<string, unknown> | null = () => fixture) {
  await page.route("https://mock.supabase.co/rest/v1/blog_posts?**", async route => {
    const request = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey,accept", "access-control-allow-methods": "GET,OPTIONS" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers }); return;
    }
    expect(request.method()).toBe("GET");
    expect(request.headers()["authorization"]).toBeUndefined();
    expect(request.headers()["cookie"]).toBeUndefined();
    expect(request.headers()["apikey"]).toBe("sb_publishable_test_only");
    const query = new URL(request.url()).searchParams;
    expect(query.get("status")).toBe("eq.published");
    expect(query.get("published_at")).toMatch(/^lte\./);
    const slug = query.get("slug");
    expect(query.get("select")?.includes(",content")).toBe(Boolean(slug));
    const published = getPublished();
    const rows = slug ? published && slug === `eq.${published.slug}` ? [published] : [] : [...(published ? [published] : []), { status: "draft", title: "Private fixture" }];
    await route.fulfill({ status: fail ? 503 : 200, headers, json: fail ? { message: "Private backend detail" } : rows });
  });
  // Vite preview has no Vercel rewrite engine. Test the built shell with the
  // original browser URL; real rewrites are checked separately in Preview.
  await page.route(/\/blog\/[a-z0-9-]+\/?$/, async route => {
    if (!route.request().isNavigationRequest()) { await route.continue(); return; }
    const shell = await page.request.get("/blog-article/index.html");
    expect(shell.ok()).toBe(true);
    await route.fulfill({ response: shell });
  });
}
test("live catalogue filters public data and opens article with trailing slash", async ({page}) => {
  await mockApi(page);
  await page.goto("/blog/");
  await expect(page.getByRole("link", { name: "Read article: Fixture published article" })).toBeVisible();
  await expect(page.getByText("Private fixture")).toHaveCount(0);
  await page.getByRole("searchbox").fill("SQL");
  await page.getByRole("link", { name: "Read article: Fixture published article" }).click();
  await expect(page).toHaveURL(/\/blog\/fixture\/$/);
  await expect(page.getByText("Fixture article body")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await page.reload();
  await expect(page.getByText("Fixture article body")).toBeVisible();
});
test("unknown slug is a missing state, not the catalogue", async ({page}) => {
  await mockApi(page);
  await page.goto("/blog/not-published/");
  await expect(page.getByRole("heading", {name:"Article not found."})).toBeVisible();
  await expect(page.getByText("Fixture article body")).toHaveCount(0);
});
test("API failure hides backend detail and supports retry", async ({page}) => {
  await mockApi(page, true);
  await page.goto("/blog/");
  await expect(page.getByRole("heading", {name:"Articles temporarily unavailable."})).toBeVisible();
  await expect(page.getByText("Private backend detail")).toHaveCount(0);
  await page.unroute("https://mock.supabase.co/rest/v1/blog_posts?**");
  await mockApi(page);
  await page.getByRole("button", {name:"Retry"}).click();
  await expect(page.getByRole("link", {name:"Read article: Fixture published article"})).toBeVisible();
});

// Mirror the Phase 3E.1 projection contract; gateway/RLS itself is tested
// separately against the real disposable Supabase API.
test("published rich snapshot renders and refresh hides withdrawn content", async ({page}) => {
  let snapshot: Record<string, unknown> | null = {
    ...fixture, title: "Published Studio revision", content: [
      { type: "heading", text: "Publication heading" },
      { type: "rich-paragraph", version: 1, runs: [
        { text: "Bold public text", bold: true }, { text: " and " },
        { text: "italic public text", italic: true }, { text: " " },
        { text: "Internal reference", href: "/blog/fixture/" },
        { text: " <script>literal text</script>" },
      ] },
      { type: "list", items: ["First item", "Second item"] },
      { type: "quote", text: "Public quotation" },
      { type: "code", language: "SQL", text: "select 1;" },
    ],
  };
  await mockApi(page, false, () => snapshot);
  await page.goto("/blog/fixture/");
  await expect(page.getByRole("heading", { name: "Published Studio revision" })).toBeVisible();
  const prose = page.locator(".blog-prose");
  await expect(prose.getByRole("heading", { name: "Publication heading" })).toBeVisible();
  await expect(prose.locator("strong")).toHaveText("Bold public text");
  await expect(prose.locator("em")).toHaveText("italic public text");
  await expect(prose.getByRole("link", { name: "Internal reference" })).toHaveAttribute("href", "/blog/fixture/");
  await expect(prose.locator(".blog-rich-paragraph")).toContainText("<script>literal text</script>");
  await expect(prose.locator("script")).toHaveCount(0);
  await expect(prose.getByRole("listitem")).toHaveText(["First item", "Second item"]);
  await expect(prose.locator("blockquote")).toHaveText("Public quotation");
  await expect(prose.locator("pre code")).toHaveText("select 1;");
  snapshot = { ...fixture, title: "Republished Studio revision", content: [{ type: "rich-paragraph", version: 1, runs: [{ text: "Updated public snapshot" }] }] };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Republished Studio revision" })).toBeVisible();
  await expect(prose).toContainText("Updated public snapshot");
  await expect(prose.getByText("Bold public text")).toHaveCount(0);
  snapshot = null;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Article not found." })).toBeVisible();
  await expect(page.getByText("Updated public snapshot")).toHaveCount(0);
  await page.goto("/blog/");
  await expect(page.getByRole("heading", { name: "No articles published yet." })).toBeVisible();
  await expect(page.getByText("Republished Studio revision")).toHaveCount(0);
});
