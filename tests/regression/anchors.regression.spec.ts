import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("legacy section hashes remain directly accessible below the sticky header", async ({
  page,
}) => {
  for (const hash of [
    "#About",
    "#Experience",
    "#Skills",
    "#Projects",
    "#Connect",
    "#leave_message",
    "#messages",
  ]) {
    await page.goto(`/${hash}`);
    await expect(page).toHaveURL(new RegExp(`${hash}$`));

    const isContactAlias =
      hash === "#leave_message" || hash === "#messages";
    const target = page.locator(hash);
    const section = isContactAlias ? page.locator("#Connect") : target;

    await expect(section).toBeInViewport();
    const positions = await target.evaluate((element) => {
      const header = document.querySelector<HTMLElement>(".site-header");
      return {
        targetTop: element.getBoundingClientRect().top,
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      };
    });
    expect(positions.targetTop).toBeGreaterThanOrEqual(
      positions.headerBottom - 1,
    );
  }
});

test("native anchor navigation keeps Back and Forward history intact", async ({
  page,
}) => {
  await page.goto("/#Projects");
  await expect(page.locator("#Projects")).toBeInViewport();

  await page
    .getByRole("link", { name: "Get in touch", exact: true })
    .click();
  await expect(page).toHaveURL(/#Connect$/);
  await expect(page.locator("#Connect")).toBeInViewport();

  await page.goBack();
  await expect(page).toHaveURL(/#Projects$/);
  await expect(page.locator("#Projects")).toBeInViewport();

  await page.goForward();
  await expect(page).toHaveURL(/#Connect$/);
  await expect(page.locator("#Connect")).toBeInViewport();
});

test("focusing contact fields does not reset scroll or apply imperative zoom hacks", async ({
  page,
}) => {
  await page.goto("/#Connect");
  const message = page.getByLabel("What would you like to talk about?");
  await message.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await message.focus();
  await expect(message).toBeFocused();
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBeGreaterThan(0);
  await expect(page).toHaveURL(/#Connect$/);

  expect(
    await page.evaluate(() => ({
      bodyZoom: document.body.style.zoom,
      rootZoom: document.documentElement.style.zoom,
      bodyOverflowX: document.body.style.overflowX,
      rootOverflowX: document.documentElement.style.overflowX,
    })),
  ).toEqual({
    bodyZoom: "",
    rootZoom: "",
    bodyOverflowX: "",
    rootOverflowX: "",
  });
});


test("legacy messages hash is a compatibility alias, not a public message list", async ({
  page,
}) => {
  await page.goto("/#messages");
  await expect(page.locator("#messages")).toHaveClass(/legacy-anchor/);
  await expect(page.locator("#Connect")).toBeInViewport();
  await expect(page.locator("#Connect .contact-form")).toHaveCount(1);
  await expect(page.locator("#Connect").getByText(/public messages/i)).toHaveCount(0);
});
