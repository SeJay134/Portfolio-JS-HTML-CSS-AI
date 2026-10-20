import { test, expect } from "@playwright/test";

test("public chat launcher appears after hydration without React mismatch", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const prerenderedHtml = await response.text();

  // Prerender does not evaluate Vite's import.meta.env variables.
  expect(prerenderedHtml).toContain('id="Projects"');
  expect(prerenderedHtml).not.toContain('class="chat-launcher"');

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrating|react error #418|react error #423/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    hydrationErrors.push(error.message);
  });

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open portfolio assistant" }),
  ).toBeVisible();
  await expect(page.locator("#Projects")).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
