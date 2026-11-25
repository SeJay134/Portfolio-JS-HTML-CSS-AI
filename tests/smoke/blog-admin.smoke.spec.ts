import { expect, test } from "@playwright/test";

test("Blog Studio shell is noindex and fail closed with rollout disabled", async ({ page }) => {
  await page.goto("/admin/blog/");
  await expect(page.getByRole("heading", { name: "Blog Studio" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Blog Studio is not available yet.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.getByText("Administrator access confirmed")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ New draft" })).toHaveCount(0);
});
