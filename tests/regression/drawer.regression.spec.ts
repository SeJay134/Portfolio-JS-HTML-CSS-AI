import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/ready", (route) =>
    route.fulfill({ json: { status: "ready" } }),
  );
});

test("drawer closes by Escape, restores trigger focus, and traps Tab while open", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const dialog = page.getByRole("dialog", { name: "Explore the portfolio" });

  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(dialog).toBeVisible();

  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

test("section selection closes the drawer, preserves the anchor, focuses the section, and updates active state", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const dialog = page.getByRole("dialog", { name: "Explore the portfolio" });

  await menu.click();
  await dialog.getByRole("link", { name: /Projects/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/#Projects$/);
  await expect(page.locator("#Projects")).toBeInViewport();
  await expect(page.locator("#Projects")).toBeFocused();

  await menu.click();
  await expect(page.locator("#Projects")).toBeInViewport();
  await expect(
    dialog.getByRole("link", { name: /Projects/ }),
  ).toHaveAttribute("aria-current", "location");
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(menu).toBeFocused();

  await page.evaluate(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    });
  });
  await expect
    .poll(() =>
      page
        .locator('#navigation-drawer a[aria-current="location"]')
        .getAttribute("href"),
    )
    .toBe("#Connect");

  await menu.click();
  await expect(
    dialog.locator('a[aria-current="location"]'),
  ).toHaveAttribute("href", "#Connect");
  await page.keyboard.press("Escape");
});

test("backdrop closes the drawer, resize keeps it usable, and menu owns the modal layer", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const dialog = page.getByRole("dialog", { name: "Explore the portfolio" });

  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await page.getByLabel("Your question").fill("Keep this draft");
  await menu.click();
  await expect(
    page.getByRole("dialog", { name: "Ask about Sergei" }),
  ).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeVisible();

  const box = await dialog.boundingBox();
  if (!box) throw new Error("Drawer bounding box unavailable");
  await page.mouse.click(Math.min(page.viewportSize()!.width - 2, box.x + box.width + 12), 120);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(menu).toBeFocused();

  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("Keep this draft");
});

test("drawer passes automated accessibility checks and reduced motion removes its animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Explore the portfolio" });

  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await expect(dialog.locator(".drawer-panel")).toHaveCSS(
    "animation-name",
    "none",
  );
});
