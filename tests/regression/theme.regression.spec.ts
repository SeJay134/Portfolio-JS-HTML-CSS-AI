import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("system theme follows OS changes while explicit choices persist", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Color theme")).toHaveValue("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Color theme").selectOption("dark");
  await page.reload();
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0c141d",
  );
  await page.getByLabel("Color theme").selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("blocked storage and malformed preferences fall back to the system theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Color theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("invalid saved values and other-tab changes cannot produce an invalid theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() =>
    localStorage.setItem("portfolio-theme", "invalid-value"),
  );
  await page.goto("/");
  await expect(page.getByLabel("Color theme")).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "portfolio-theme",
        newValue: "light",
      }),
    ),
  );
  await expect(page.getByLabel("Color theme")).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: null })),
  );
  await expect(page.getByLabel("Color theme")).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("saved theme is applied before hydration without an opposite-theme flash", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("portfolio-theme", "dark");
    (window as unknown as { themeFrames: string[] }).themeFrames = [];
    const record = () => {
      const theme = document.documentElement?.dataset.theme;
      if (theme)
        (window as unknown as { themeFrames: string[] }).themeFrames.push(
          theme,
        );
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await page.goto("/");
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
  const frames = await page.evaluate(
    () => (window as unknown as { themeFrames: string[] }).themeFrames,
  );
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.every((value) => value === "dark")).toBe(true);
});

test("both palettes pass automated contrast checks including contact error states", async ({
  page,
}) => {
  await page.goto("/#Connect");
  await page.getByLabel("Your name").fill("   ");
  await page.getByLabel("Email", { exact: true }).fill("alex@example.com");
  await page.getByLabel("What would you like to talk about?").fill("   ");
  await page.getByRole("button", { name: "Prepare email" }).click();
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/theme-${theme}-${page.viewportSize()!.width}.png`,
      fullPage: false,
    });
  }
});

test("system colors remain available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(12, 20, 29)",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(248, 249, 251)",
  );
  await context.close();
});
