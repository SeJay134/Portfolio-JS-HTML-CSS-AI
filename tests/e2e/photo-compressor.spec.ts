import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

async function tinyPng(page: import("@playwright/test").Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "steelblue";
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = "white";
    ctx.fillRect(20, 20, 55, 55);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

test("menu opens the separate tool page and supports returning to portfolio sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore the portfolio" })
    .getByRole("link", { name: /Photo Compressor/ }).click();
  await expect(page).toHaveURL(/\/tools\/photo-compressor\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Make your photos");
  await page.reload();
  await expect(page.getByLabel("Max size per photo (KB)")).toHaveValue("300");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore the portfolio" })
    .getByRole("link", { name: /Projects/ }).click();
  await expect(page).toHaveURL(/\/#Projects$/);
  await expect(page.locator("#Projects")).toBeInViewport();
});

test("100+ selected photos are compressed and downloaded in a valid ZIP without uploads", async ({ page }) => {
  test.setTimeout(120000);
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/tools/photo-compressor/");
  const source = await tinyPng(page);
  const inputs = Array.from({ length: 105 }, (_, index) => ({
    name: "photo-" + index + ".png",
    mimeType: "image/png",
    buffer: source,
  }));
  await page.locator("#photo-files").setInputFiles(inputs);
  await expect(page.getByText("105 selected")).toBeVisible();
  await page.getByLabel("Max size per photo (KB)").fill("25");
  await page.getByRole("button", { name: "Compress photos" }).click();
  const link = page.getByRole("link", { name: "Download ZIP" });
  await expect(link).toBeVisible({ timeout: 110000 });
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const data = await readFile(await download.path());
  const end = data.length - 22;
  expect(data.readUInt32LE(end)).toBe(0x06054b50);
  expect(data.readUInt16LE(end + 10)).toBe(105);
  // Every local entry is stored as an independent JPG below the selected limit.
  let offset = 0;
  for (let index = 0; index < 105; index++) {
    expect(data.readUInt32LE(offset)).toBe(0x04034b50);
    const size = data.readUInt32LE(offset + 18);
    const filenameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    expect(size).toBeLessThanOrEqual(25000);
    const start = offset + 30 + filenameLength + extraLength;
    expect(data.subarray(start, start + 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    offset = start + size;
  }
  expect(posts).toEqual([]);
});

test("invalid target, unsupported images, and theme changes work without breaking layout", async ({ page }) => {
  await page.goto("/tools/photo-compressor/");
  await page.locator("#photo-files").setInputFiles([
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
  ]);
  await expect(page.getByText("0 selected")).toBeVisible();
  await expect(page.getByText("1 unsupported file(s) were excluded.")).toBeVisible();
  const buffer = await tinyPng(page);
  await page.locator("#photo-files").setInputFiles([
    { name: "valid.png", mimeType: "image/png", buffer },
  ]);
  await page.getByLabel("Max size per photo (KB)").fill("0");
  await page.getByRole("button", { name: "Compress photos" }).click();
  await expect(page.getByText("Enter a whole number between 20 and 5000 KB.")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
