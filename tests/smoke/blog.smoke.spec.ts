import { expect, test } from "@playwright/test";

test("public blog opens from the drawer and uses the shared navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: /Blog/ }).click();
  await expect(page).toHaveURL(/\/blog\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Blog & Insights." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No articles published yet." })).toBeVisible();
  await page.getByLabel("Color theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Blog/ })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
});

test("blog is prerendered, canonical and public without JavaScript", async ({ browser, request }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  try {
    const response = await page.goto("/blog/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://sergei-luna.vercel.app/blog/");
    await expect(page.getByRole("link", { name: "Back to portfolio" })).toHaveAttribute("href", "/");
    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("https://sergei-luna.vercel.app/blog/");
  } finally { await page.close(); }
});

test("blog fits a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/blog/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
