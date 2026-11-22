import { expect, test } from "@playwright/test";
import { sampleDocx, sampleTxt } from "../fixtures/converterFiles";

test("converter: mismatched content does not leak downloads, resets state, preserves theme", async ({ page }) => {
  await page.goto("/tools/file-converter/");
  await page.getByLabel("From format").selectOption("docx");
  await page.locator("#converter-files").setInputFiles([
    { name: "valid.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: sampleDocx() },
    { name: "fake.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("fake Office file") },
  ]);
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Invalid file format. Choose another file.");
  await page.getByRole("checkbox", { name: /I confirm I have the right/ }).check();
  await page.getByRole("button", { name: "Convert files" }).click();
  await expect(page.getByRole("link", { name: "Download TXT" })).toBeVisible();
  await page.getByLabel("From format").selectOption("txt");
  await expect(page.getByRole("link", { name: "Download TXT" })).toHaveCount(0);
  await page.locator("#converter-files").setInputFiles([
    { name: "note.txt", mimeType: "text/plain", buffer: sampleTxt() },
  ]);
  await page.getByRole("checkbox", { name: /I confirm I have the right/ }).check();
  await page.getByRole("button", { name: "Convert files" }).click();
  await expect(page.getByRole("link", { name: "Download DOCX" })).toBeVisible();
  await page.getByLabel("Color theme").selectOption("dark");
  await page.getByRole("link", { name: /Back to portfolio/ }).first().click();
  await expect(page).toHaveURL(/\/#Projects$/);
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
});
