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
