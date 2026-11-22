import { expect, test } from "@playwright/test";

test("corrupt files do not block good photos, stale downloads are cleared, and theme persists", async ({ page }) => {
  test.setTimeout(120000); // Includes first-use local TensorFlow model initialization.
  await page.goto("/tools/photo-compressor/");
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    canvas.getContext("2d")!.fillRect(0, 0, 32, 32);
    return canvas.toDataURL("image/png");
  });
  await page.locator("#photo-files").setInputFiles([
    { name: "corrupt.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a JPEG") },
    { name: "valid.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") },
  ]);
  await page.getByRole("checkbox", { name: /I confirm I have the right/ }).check();
  await page.getByRole("button", { name: "Compress photos" }).click();
  const downloadLink = page.getByRole("link", { name: "Download ZIP" });
  await expect(downloadLink).toBeVisible({ timeout: 90000 });
  await expect(page.getByText("Completed: 0 blocked, 1 other skipped file(s).")).toBeVisible();
  await page.getByText("1 skipped file(s)", { exact: true }).click();
  await expect(page.getByText(/corrupt.jpg: Could not verify image safety/)).toBeVisible();
  await page.getByLabel("Max size per photo (KB)").fill("280");
  await expect(downloadLink).toHaveCount(0);
  await page.getByLabel("Color theme").selectOption("dark");
  await page.getByRole("link", { name: /Back to portfolio/ }).first().click();
  await expect(page).toHaveURL(/\/#Projects$/);
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
});
