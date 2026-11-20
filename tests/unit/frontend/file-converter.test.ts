import { describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  FORMAT_LABELS, formatFromName, INPUT_FORMATS, INVALID_FILE_MESSAGE,
  isSupportedPair, MAX_BATCH_FILES, OUTPUT_FORMATS, readZipMember,
  uniqueOutputName, xmlEscape,
} from "../../../src/lib/fileFormats";
import { parseCsv, rowsToCsv } from "../../../src/lib/documentTransforms";
import { corruptedDocx, sampleDocx } from "../../fixtures/converterFiles";

describe("file converter format policy", () => {
  it("has explicit and nonempty real conversion routes for every selectable type", () => {
    expect(INPUT_FORMATS).toHaveLength(8);
    for (const format of INPUT_FORMATS) {
      expect(FORMAT_LABELS[format].length).toBeGreaterThan(0);
      expect(OUTPUT_FORMATS[format].length).toBeGreaterThan(0);
      expect(OUTPUT_FORMATS[format]).not.toContain(format);
    }
    expect(isSupportedPair("png", "pdf")).toBe(true);
    expect(isSupportedPair("xlsx", "csv")).toBe(true);
    expect(isSupportedPair("pdf", "docx")).toBe(false);
    expect(isSupportedPair("pdf", "png")).toBe(false);
    expect(MAX_BATCH_FILES).toBe(120);
    expect(INVALID_FILE_MESSAGE).toBe("Invalid file format. Choose another file.");
  });

  it("rejects unsupported legacy extensions and normalizes JPEG", () => {
    expect(formatFromName("photo.JPEG")).toBe("jpg");
    expect(formatFromName("sheet.XLSX")).toBe("xlsx");
    expect(formatFromName("old.xls")).toBeNull();
    expect(formatFromName("old.doc")).toBeNull();
    expect(formatFromName("evil.svg")).toBeNull();
    expect(formatFromName("missing")).toBeNull();
  });

  it("generates safe, non-overlapping filenames", () => {
    const used = new Set<string>();
    expect(uniqueOutputName("../hi.png", "pdf", used)).toBe("_hi.pdf");
    expect(uniqueOutputName("hi.JPG", "pdf", used)).toBe("hi.pdf");
    expect(uniqueOutputName("hi.webp", "pdf", used)).toBe("hi-2.pdf");
    expect(xmlEscape('<"&')).toBe("&lt;&quot;&amp;");
  });
});

describe("CSV data safety", () => {
  it("understands quoted commas, double quotes and CRLF", () => {
    expect(parseCsv('Name,Amount\r\n"Apple, green",25\r\n"Quote ""text""",10\r\n'))
      .toEqual([["Name", "Amount"], ["Apple, green", "25"], ['Quote "text"', "10"]]);
    expect(() => parseCsv('"unterminated')).toThrow(INVALID_FILE_MESSAGE);
  });
  it("neutralizes spreadsheet formulas when exported as CSV", () => {
    expect(rowsToCsv([["=1+2", " +cmd", "safe", "-3", "@bad"]]))
      .toBe("'=1+2,' +cmd,safe,'-3,'@bad\r\n");
  });
});

describe("Office ZIP fixture integrity", () => {
  it("reads DEFLATE OOXML and rejects a CRC-corrupted archive", async () => {
    const originalBlob = globalThis.Blob;
    globalThis.Blob = NodeBlob as unknown as typeof Blob;
    try {
    const good = new NodeBlob([Uint8Array.from(sampleDocx())]) as unknown as Blob;
    const bad = new NodeBlob([Uint8Array.from(corruptedDocx())]) as unknown as Blob;
    const word = await readZipMember(good, "word/document.xml");
    expect(word).not.toBeNull();
    if (!word) throw new Error("Missing test ZIP member");
    expect(new TextDecoder().decode(word)).toContain("Hello Word fixture");
    await expect(readZipMember(bad, "word/document.xml")).rejects.toThrow(INVALID_FILE_MESSAGE);
    await expect(readZipMember(good, "not-found.xml")).resolves.toBeNull();
    } finally {
      globalThis.Blob = originalBlob;
    }
  });
});
