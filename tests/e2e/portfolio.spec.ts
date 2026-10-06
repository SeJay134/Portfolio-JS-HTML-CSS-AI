import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/ready", (route) =>
    route.fulfill({ json: { status: "ready" } }),
  );
});

test("contact prepares a draft and does not publish or send a message", async ({
  page,
}) => {
  await page.goto("/#Connect");
  await page.getByLabel("Your name").fill("Test visitor");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByLabel("What would you like to talk about?")
    .fill("<script>alert(1)</script>");
  await page.getByRole("button", { name: "Prepare email" }).click();
  await expect(
    page.getByRole("link", { name: /Open email app/ }),
  ).toHaveAttribute("href", /mailto:.*%3Cscript%3E/);
  await expect(page.locator(".draft-result")).toContainText("review and send");
});

test("chat handles server errors, retry, safe text, and clearing", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/chat", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 429, json: { error: "rate limit" } })
      : route.fulfill({
          json: { reply: "<img src=x onerror=alert(1)>", sources: [] },
        });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await page.getByLabel("Your question").fill("Tell me about projects");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByLabel("Your question")).toHaveValue(
    "Tell me about projects",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".assistant p")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".chat-history img")).toHaveCount(0);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.locator(".message")).toHaveCount(0);
});

test("light, dark, and chat have no automated WCAG AA violations", async ({
  page,
}) => {
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await expect(page.getByLabel("Your question")).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("stopping a slow chat request preserves the draft and prevents duplicate submissions", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/chat", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route
      .fulfill({ json: { reply: "Late response", sources: [] } })
      .catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await page.getByLabel("Your question").fill("A slow question");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Your question")).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Request stopped");
  await expect(page.getByLabel("Your question")).toHaveValue("A slow question");
  expect(requests).toBe(1);
  await expect(page.locator(".message.assistant")).toHaveCount(0);
});

test("prerendered portfolio and contact work without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  await expect(
    page.getByRole("heading", { name: "Chocolate sales dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "patrushev.s.job@gmail.com" }).first(),
  ).toHaveAttribute("href", "mailto:patrushev.s.job@gmail.com");
  await context.close();
});

test("3D remains optional and removes its canvas when disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "3D effects off" }).click();
  // A renderer may decline to initialize on unsupported GPUs; either path keeps content usable.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const enabled = page.getByRole("button", { name: "3D effects on" });
  if (await enabled.isVisible()) await enabled.click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Explore the portfolio" }),
  ).toBeVisible();
});

test("contact validates input, invalidates stale drafts, and never posts visitor data", async ({
  page,
}) => {
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") submissions.push(request.url());
  });
  await page.goto("/#Connect");
  const name = page.getByLabel("Your name");
  const email = page.getByLabel("Email", { exact: true });
  const message = page.getByLabel("What would you like to talk about?");
  const prepare = page.getByRole("button", { name: "Prepare email" });
  await name.fill("Alex");
  await email.fill("invalid-email");
  await message.fill("Hello");
  await prepare.click();
  await expect(page.getByRole("link", { name: /Open email app/ })).toHaveCount(
    0,
  );
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a valid email address.",
  );
  await email.fill("alex@example.com");
  await name.fill("   ");
  await message.fill("   ");
  await prepare.click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(message).toHaveAttribute("aria-invalid", "true");
  await name.fill("Alex");
  await message.fill("A private inquiry & follow-up");
  await prepare.click();
  await expect(
    page.getByRole("link", { name: /Open email app/ }),
  ).toBeVisible();
  await message.fill("An updated inquiry");
  await expect(page.getByRole("link", { name: /Open email app/ })).toHaveCount(
    0,
  );
  await prepare.click();
  await expect(
    page.getByRole("link", { name: /Open email app/ }),
  ).toHaveAttribute("href", /An%20updated%20inquiry/);
  expect(submissions).toEqual([]);
  expect(new URL(page.url()).search).toBe("");
});


test("contact fields remain usable when a mobile viewport is shortened for the software keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#Connect");

  const message = page.getByLabel("What would you like to talk about?");
  await message.focus();
  await page.setViewportSize({ width: 390, height: 520 });
  await message.scrollIntoViewIfNeeded();

  await expect(message).toBeFocused();
  await expect(message).toBeInViewport();
  await expect(page.getByRole("button", { name: "Prepare email" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
