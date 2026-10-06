import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 429, body: "Rate limit" }),
  );
});

test("hero links reach projects and contact with the AI API unavailable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore my work", exact: true }).click();
  await expect(page).toHaveURL(/#Projects$/);
  await expect(page.locator(".project-card")).toHaveCount(4);
  await expect(page.locator("#Projects h2")).toBeInViewport();
  await page.getByRole("link", { name: "Get in touch", exact: true }).click();
  await expect(page).toHaveURL(/#Connect$/);
  await expect(page.getByLabel("Your name")).toBeInViewport();
});

test("keyboard filters preserve the URL and support reload, back, and forward", async ({ page }) => {
  await page.goto("/?ref=portfolio#Projects");
  const filters = page.getByRole("group", { name: "Filter projects" });
  const ai = filters.getByRole("button", { name: /^AI/ });
  await ai.focus();
  await page.keyboard.press("Enter");
  await expect(ai).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#Projects [role=status]")).toHaveText("1 projects shown");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page).toHaveURL(/\?ref=portfolio&category=AI#Projects$/);
  await page.reload();
  await expect(ai).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Portfolio website & AI prototype" })).toBeVisible();

  const all = filters.getByRole("button", { name: /^All/ });
  await all.click();
  await expect(page).toHaveURL(/\?ref=portfolio#Projects$/);
  await expect(page.locator(".project-card")).toHaveCount(4);

  await page.goBack();
  await expect(page).toHaveURL(/\?ref=portfolio&category=AI#Projects$/);
  await expect(ai).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(page).toHaveURL(/\?ref=portfolio#Projects$/);
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: /^Data/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await filters.getByRole("button", { name: /^Web/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await filters.getByRole("button", { name: /^All/ }).click();
  await expect(page).toHaveURL(/\?ref=portfolio#Projects$/);
  await expect(page.locator(".project-card")).toHaveCount(4);
});

test("unknown categories and failed preview images keep cards and details usable", async ({ page }) => {
  await page.route("**/images/chocolate.webp", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Missing preview",
    }),
  );
  await page.goto("/?category=unknown#Projects");
  await expect(page.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".project-card")).toHaveCount(4);
  const card = page.locator(".project-card").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".image-fallback")).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.locator(".image-fallback")).toContainText(
    "Preview unavailable",
  );
  const summary = card.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await expect(card.locator("details p")).toBeVisible();
  await expect(card.getByRole("link", { name: "Source code" })).toHaveAttribute("href", "https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python");
  await expect(card.getByRole("link", { name: "Live demo" })).toHaveAttribute("href", "https://sergei-chocolate-sales-dashboard.streamlit.app/");
});


test("project image previews reserve space and expose accessible loading metadata", async ({ page }) => {
  await page.goto("/#Projects");
  const preview = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Chocolate sales dashboard" }) })
    .locator("img");

  await expect(preview).toHaveAttribute("src", "/images/chocolate.webp");
  await expect(preview).toHaveAttribute("loading", "lazy");
  await expect(preview).toHaveAttribute("decoding", "async");
  await expect(preview).toHaveAttribute("width", "800");
  await expect(preview).toHaveAttribute("height", "500");
  await expect(preview).toHaveAttribute(
    "alt",
    "Chocolate sales dashboard with filters and sales visualizations.",
  );
  await expect(preview.locator("xpath=..")).toHaveCSS(
    "aspect-ratio",
    "16 / 10",
  );
});


test("skills link to filtered case studies while experience and contact stay consolidated", async ({ page }) => {
  await page.goto("/#Skills");

  await expect(page.locator("#Experience .timeline article")).toHaveCount(3);
  await expect(page.locator("#Connect .contact-form")).toHaveCount(1);
  await expect(page.locator("#leave_message")).toHaveCount(1);
  await expect(page.locator("#messages")).toHaveClass(/legacy-anchor/);

  const dataCaseStudies = page.getByRole("link", {
    name: "See Data case studies",
  });
  await expect(dataCaseStudies).toHaveAttribute(
    "href",
    "?category=Data#Projects",
  );
  await dataCaseStudies.click();

  await expect(page).toHaveURL(/\?category=Data#Projects$/);
  await expect(
    page.getByRole("button", { name: /^Data/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".project-card")).toHaveCount(2);
});
