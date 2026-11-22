import { expect, test, type Page } from "@playwright/test";

// Runs only against a build configured with https://mock.supabase.co.
// These tests exercise the actual compiled PKCE client with local mock
// responses. They never contact Google or create real Supabase users.
const supabaseOrigin = "https://mock.supabase.co";
const appOrigin = "http://127.0.0.1:4173";
const storageKey = "sergei-portfolio-supabase-auth";
const returnPathKey = "sergei-portfolio:auth-return-path";

function fakeSession() {
  return {
    access_token: "test.header.signature",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.test",
      created_at: "2026-01-01T00:00:00.000Z",
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: { full_name: "Fixture User" },
    },
  };
}

async function installCachedSession(page: Page) {
  // Seed on this origin without repeating it on each navigation/reload.
  await page.goto("/");
  await page.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: storageKey, session: fakeSession() },
  );
}

test("a saved Google session opens both tools and survives a reload", async ({ page }) => {
  await installCachedSession(page);
  await page.goto("/tools/photo-compressor/");
  await expect(page.locator("#photo-files")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.reload();
  await expect(page.locator("#photo-files")).toHaveCount(1);
  await page.goto("/tools/file-converter/");
  await expect(page.locator("#converter-files")).toHaveCount(1);
});

test("logout removes the cached session, re-locks both tools, and persists on reload", async ({ page }) => {
  await installCachedSession(page);
  await page.route(`${supabaseOrigin}/auth/v1/logout**`, async (route) => {
    await route.fulfill({ status: 204, body: "", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/tools/photo-compressor/");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("#photo-files")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.goto("/tools/file-converter/");
  await expect(page.locator("#converter-files")).toHaveCount(0);
});

for (const [tool, name] of [
  ["/tools/photo-compressor/", "Photo Compressor"],
  ["/tools/file-converter/", "File Converter"],
] as const) {
  test(`Google OAuth begins with PKCE and retains return path for ${name}`, async ({ page }) => {
    let authorizeUrl = "";
    await page.route(`${supabaseOrigin}/auth/v1/authorize**`, async (route) => {
      authorizeUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Mock Google consent</title><p>Mock OAuth only</p>",
      });
    });
    await page.goto(tool);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/mock\\.supabase\\.co\\/auth\\/v1\\/authorize/);
    const url = new URL(authorizeUrl);
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe(appOrigin + "/auth/callback/");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    await page.goto(tool);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), returnPathKey)).toBe(tool);
  });
}

test("mocked OAuth callback saves session and returns to the selected tool", async ({ page }) => {
  const callback = appOrigin + "/auth/callback/?code=fake-oauth-code";
  await page.route(`${supabaseOrigin}/auth/v1/authorize**`, async (route) => {
    await route.fulfill({ status: 302, headers: { location: callback }, body: "" });
  });
  let exchanged = false;
  await page.route(`${supabaseOrigin}/auth/v1/token**`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const payload = route.request().postDataJSON();
    expect(payload.auth_code).toBe("fake-oauth-code");
    expect(typeof payload.code_verifier).toBe("string");
    expect(payload.code_verifier.length).toBeGreaterThan(20);
    exchanged = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(fakeSession()),
    });
  });
  await page.goto("/tools/file-converter/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\\/tools\\/file-converter\\/$/, { timeout: 15000 });
  await expect(page.locator("#converter-files")).toHaveCount(1);
  expect(exchanged).toBe(true);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), returnPathKey)).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("an OAuth callback without a code shows a safe error", async ({ page }) => {
  await page.goto("/auth/callback/");
  await expect(page.getByRole("status")).toContainText("Google did not return an authorization code.");
  await expect(page.getByRole("link", { name: "Return to portfolio" })).toHaveAttribute("href", "/");
});

test("OAuth access denied never opens the protected tools", async ({ page }) => {
  await page.goto("/auth/callback/?error=access_denied&error_description=private-token-secret");
  await expect(page.getByRole("status")).toContainText("Google sign-in was cancelled or denied.");
  await expect(page.getByRole("status")).not.toContainText("private-token-secret");
  await page.goto("/tools/photo-compressor/");
  await expect(page.locator("#photo-files")).toHaveCount(0);
});
