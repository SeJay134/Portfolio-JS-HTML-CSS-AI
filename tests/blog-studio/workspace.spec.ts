import { expect, test, type Page } from "@playwright/test";

const origin = "https://mock.supabase.co";
const storageKey = "sergei-portfolio-supabase-auth";
async function session(page: Page, allowed: boolean) {
  await page.route(origin + "/**", async route => {
    const req = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*" };
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (new URL(req.url()).pathname === "/rest/v1/rpc/resolve_blog_admin") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(allowed), headers }); return;
    }
    await route.fulfill({ status: 403, contentType: "application/json", body: "{}", headers });
  });
  await page.goto("/");
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    access_token: "test.header.signature", refresh_token: "test-refresh-token", token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
      email: "fixture@example.test", created_at: "2026-01-01T00:00:00.000Z",
      app_metadata: { provider: "google", providers: ["google"] }, user_metadata: { full_name: "Fixture User" } },
  })), storageKey);
}
test("denies anonymous and non-admin users even with editor enabled", async ({ page }) => {
  await page.goto("/admin/blog/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New draft" })).toHaveCount(0);
  await session(page, false);
  await page.goto("/admin/blog/");
  await expect(page.getByRole("alert")).toContainText("Administrator access is not available");
  await expect(page.getByRole("button", { name: "+ New draft" })).toHaveCount(0);
});
test("authorized user composes and previews without storage or network writes", async ({ page }) => {
  await session(page, true);
  const writes: string[] = [];
  page.on("request", req => { if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method()) && !req.url().endsWith("/rest/v1/rpc/resolve_blog_admin")) writes.push(req.url()); });
  await page.goto("/admin/blog/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await page.getByRole("button", { name: "+ New draft" }).click();
  await page.getByLabel("Article title").fill("Fixture local article");
  await page.getByLabel("Block 1 text part 1", { exact: true }).fill("Private fixture text");
  await page.getByRole("button", { name: "Block 1 text part 1 bold" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("article").getByRole("heading", { name: "Fixture local article" })).toBeVisible();
  await expect(page.locator(".studio-preview strong")).toHaveText("Private fixture text");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("Private fixture text");
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Color theme").selectOption("dark");
  await expect(page.getByLabel("Article title")).toHaveValue("Fixture local article");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("article")).toBeVisible();
});
