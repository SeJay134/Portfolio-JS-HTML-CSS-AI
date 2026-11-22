import { test, expect } from "@playwright/test";

test("critical portfolio shell is available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  await expect(page.locator("#Projects")).toBeVisible();
});

test("navigation and contact work without an API connection", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore the portfolio" })
    .getByRole("link", { name: /Contact/ }).click();
  await expect(page).toHaveURL(/#Connect$/);
  await expect(page.getByRole("button", { name: "Prepare email" })).toBeVisible();
});

test("photo compressor route is served directly and retains the portfolio shell", async ({ page }) => {
  await page.goto("/tools/photo-compressor/");
  await expect(page.getByRole("heading", { level: 1, name: /Make your photos/ })).toBeVisible();
  await expect(page.getByLabel("Max size per photo (KB)")).toHaveValue("300");
  await expect(page.getByRole("link", { name: "Sergei Patrushev, home" })).toHaveAttribute("href", "/");
});

test("file converter route opens directly and exposes from/to format selectors", async ({ page }) => {
  await page.goto("/tools/file-converter/");
  await expect(page.getByRole("heading", { level: 1, name: /Make files fit/ })).toBeVisible();
  await expect(page.getByLabel("From format")).toHaveValue("png");
  await expect(page.getByLabel("Convert to")).toHaveValue("jpg");
  await expect(page.getByRole("link", { name: "Sergei Patrushev, home" })).toHaveAttribute("href", "/");
});

test("public legal documents load directly without an account or JavaScript", async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  try {
    for (const [path, title, text] of [
      ["/privacy/", "Privacy Policy", "Google sign-in"],
      ["/terms/", "Terms of Service", "Photo Compressor"],
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator("main")).toContainText(text);
      await expect(page.getByRole("link", { name: "Portfolio", exact: true }).first()).toHaveAttribute("href", "/");
    }
  } finally {
    await page.close();
  }
});

test("portfolio and tool footers link to both public legal pages", async ({ page }) => {
  for (const path of ["/", "/tools/photo-compressor/", "/tools/file-converter/"]) {
    await page.goto(path);
    await expect(page.locator("footer").getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy/");
    await expect(page.locator("footer").getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms/");
  }
});
