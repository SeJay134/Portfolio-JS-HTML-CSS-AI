import { test, expect } from "@playwright/test";

test("portfolio stays public while the account menu appears", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#Projects")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("photo compressor requires Google login with auth enabled", async ({ page }) => {
  await page.goto("/tools/photo-compressor/");
  await expect(page.getByRole("heading", { level: 1, name: "Photo Compressor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("#photo-files")).toHaveCount(0);
});

test("file converter requires Google login with auth enabled", async ({ page }) => {
  await page.goto("/tools/file-converter/");
  await expect(page.getByRole("heading", { level: 1, name: "File Converter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("#converter-files")).toHaveCount(0);
});

test("OAuth callback is a dedicated route and reports errors safely", async ({ page }) => {
  await page.goto("/auth/callback/?error=access_denied");
  await expect(page.getByRole("heading", { level: 1, name: "Google sign-in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Google sign-in was cancelled or denied.");
  await expect(page.getByRole("link", { name: "Return to portfolio" })).toHaveAttribute("href", "/");
});
