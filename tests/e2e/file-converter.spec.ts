import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import {
  badPdf, corruptedDocx, fakePng, sampleCsv, sampleDocx, samplePdf,
  sampleTxt, sampleXlsx,
} from "../fixtures/converterFiles";

const route = "/tools/file-converter/";
const payload = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
async function pngBytes(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "orange";
    ctx.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}
async function downloadBytes(page: Page, label: string): Promise<{ bytes: Buffer; name: string }> {
  const link = page.getByRole("link", { name: label });
  await expect(link).toBeVisible({ timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  return { bytes: await readFile(await download.path()), name: download.suggestedFilename() };
}

test("portfolio navigation and two dynamic dropdowns serve the dedicated tool and keep compressor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore the portfolio" })
    .getByRole("link", { name: /File Converter/ }).click();
  await expect(page).toHaveURL(/\/tools\/file-converter\/$/);
  await page.reload();
  await expect(page.getByLabel("From format")).toHaveValue("png");
  await expect(page.getByLabel("Convert to")).toHaveValue("jpg");
  await page.getByLabel("From format").selectOption("pdf");
  await expect(page.getByLabel("Convert to")).toHaveValue("txt");
  await expect(page.getByLabel("Convert to").locator("option")).toHaveCount(2);
  await page.getByLabel("From format").selectOption("xlsx");
  await expect(page.getByLabel("Convert to").locator("option")).toHaveCount(3);
  await page.getByRole("link", { name: "Use Photo Compressor" }).click();
  await expect(page).toHaveURL(/\/tools\/photo-compressor\/$/);
  await expect(page.getByRole("heading", { name: /Make your photos/ })).toBeVisible();
});

test("invalid file signature, misleading extension, legacy Office and bad archive are rejected", async ({ page }) => {
  await page.goto(route);
  await page.locator("#converter-files").setInputFiles([
    payload("looks-like.png", "image/png", fakePng()),
    payload("legacy.doc", "application/msword", Buffer.from("old document")),
  ]);
  await expect(page.getByText("0 selected")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Invalid file format. Choose another file.");
  await expect(page.getByRole("button", { name: "Convert files" })).toBeDisabled();
  await page.getByLabel("From format").selectOption("docx");
  await page.locator("#converter-files").setInputFiles(payload("damaged.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", corruptedDocx()));
  await expect(page.getByRole("alert")).toContainText("Invalid file format");
  await page.getByLabel("From format").selectOption("pdf");
  await page.locator("#converter-files").setInputFiles(payload("damaged.pdf", "application/pdf", badPdf()));
  // Basic PDF signature is accepted first, but malformed contents are rejected at conversion.
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Convert files" }).click();
  await expect(page.getByText(/No files could be converted/)).toBeVisible();
});

test("drag and drop adds multiple real PNG files and produces actual JPG ZIP without POSTs", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto(route);
  const png = await pngBytes(page);
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "first.png", { type: "image/png" }));
    transfer.items.add(new File([bytes], "second.png", { type: "image/png" }));
    const dropzone = document.querySelector(".converter-dropzone")!;
    dropzone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, png.toString("base64"));
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Convert files" }).click();
  const { bytes, name } = await downloadBytes(page, "Download ZIP");
  expect(name).toBe("converted-files.zip");
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(2);
  const firstDataStart = 30 + bytes.readUInt16LE(26);
  expect(bytes.subarray(firstDataStart, firstDataStart + 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(posts).toEqual([]);
});

test("image to PDF produces a real PDF, not a renamed image", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("Convert to").selectOption("pdf");
  await page.locator("#converter-files").setInputFiles(payload("photo.png", "image/png", await pngBytes(page)));
  await page.getByRole("button", { name: "Convert files" }).click();
  const { bytes, name } = await downloadBytes(page, "Download PDF");
  expect(name).toBe("photo.pdf");
  expect(bytes.subarray(0, 8).toString()).toBe("%PDF-1.4");
  expect(bytes.toString("latin1")).toContain("/Subtype /Image");
  expect(bytes.subarray(-6).toString().trim()).toBe("%%EOF");
  const pdf = bytes.toString("latin1");
  const xref = pdf.match(/startxref\n(\d+)\n%%EOF/);
  expect(xref).not.toBeNull();
  expect(pdf.slice(Number(xref![1]), Number(xref![1]) + 4)).toBe("xref");
});

test("Word DOCX to text preserves paragraphs, including UTF-8, and TXT to DOCX is valid OOXML", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("From format").selectOption("docx");
  await page.locator("#converter-files").setInputFiles(payload("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sampleDocx()));
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Convert files" }).click();
  const first = await downloadBytes(page, "Download TXT");
  expect(first.name).toBe("notes.txt");
  expect(first.bytes.toString()).toContain("Hello Word fixture");
  expect(first.bytes.toString()).toContain("Привет!");
  await page.getByLabel("From format").selectOption("txt");
  await page.locator("#converter-files").setInputFiles(payload("message.txt", "text/plain", sampleTxt()));
  await page.getByRole("button", { name: "Convert files" }).click();
  const next = await downloadBytes(page, "Download DOCX");
  expect(next.name).toBe("message.docx");
  expect(next.bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(next.bytes.toString()).toContain("word/document.xml");
  expect(next.bytes.toString()).toContain("Привет, мир!");
  // Parse the generated Word archive independently through the DOCX import path.
  await page.getByLabel("From format").selectOption("docx");
  await page.locator("#converter-files").setInputFiles(
    payload("roundtrip.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", next.bytes),
  );
  await page.getByRole("button", { name: "Convert files" }).click();
  const back = await downloadBytes(page, "Download TXT");
  expect(back.bytes.toString()).toContain("Привет, мир!");
});

test("Excel to CSV handles shared strings and neutralizes formula injection; CSV to XLSX stays text", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("From format").selectOption("xlsx");
  await page.locator("#converter-files").setInputFiles(payload("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sampleXlsx()));
  await page.getByRole("button", { name: "Convert files" }).click();
  const out = await downloadBytes(page, "Download CSV");
  expect(out.bytes.toString()).toContain("Name,Value");
  expect(out.bytes.toString()).toContain("Apple,23");
  expect(out.bytes.toString()).toContain("'=HYPERLINK");
  await page.getByLabel("From format").selectOption("csv");
  await page.locator("#converter-files").setInputFiles(payload("numbers.csv", "text/csv", sampleCsv()));
  await page.getByRole("button", { name: "Convert files" }).click();
  const workbook = await downloadBytes(page, "Download XLSX");
  expect(workbook.bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(workbook.bytes.toString()).toContain("xl/worksheets/sheet1.xml");
  expect(workbook.bytes.toString()).toContain("Apple, green");
  expect(workbook.bytes.toString()).not.toContain("<f>");
  // Re-import the downloaded XLSX and verify that comma and quote cells survive.
  await page.getByLabel("From format").selectOption("xlsx");
  await page.locator("#converter-files").setInputFiles(
    payload("roundtrip.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", workbook.bytes),
  );
  await page.getByRole("button", { name: "Convert files" }).click();
  const back = await downloadBytes(page, "Download CSV");
  expect(back.bytes.toString()).toContain('"Apple, green",25');
  expect(back.bytes.toString()).toContain('"Quote ""text""",10');
});

test("PDF text extraction works for valid text-based PDFs and does not pretend to do OCR", async ({ page }) => {
  await page.goto(route);
  await page.getByLabel("From format").selectOption("pdf");
  await page.locator("#converter-files").setInputFiles(payload("text.pdf", "application/pdf", samplePdf()));
  await page.getByRole("button", { name: "Convert files" }).click();
  const out = await downloadBytes(page, "Download TXT");
  expect(out.name).toBe("text.txt");
  expect(out.bytes.toString()).toContain("Hello PDF fixture");
  await page.getByLabel("Convert to").selectOption("docx");
  await page.getByRole("button", { name: "Convert files" }).click();
  const word = await downloadBytes(page, "Download DOCX");
  expect(word.name).toBe("text.docx");
  expect(word.bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(word.bytes.toString()).toContain("Hello PDF fixture");
});

test("changing formats/files invalidates downloads, theme is accessible and mobile fits", async ({ page }) => {
  await page.goto(route);
  await page.locator("#converter-files").setInputFiles(payload("picture.png", "image/png", await pngBytes(page)));
  await page.getByRole("button", { name: "Convert files" }).click();
  const old = page.getByRole("link", { name: "Download JPG" });
  await expect(old).toBeVisible();
  await page.getByLabel("Convert to").selectOption("pdf");
  await expect(old).toHaveCount(0);
  await page.getByLabel("From format").selectOption("csv");
  await expect(page.getByText("0 selected")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Explore the portfolio" })
    .getByRole("link", { name: /File Converter/ })).toHaveAttribute("aria-current", "page");
});
