import { describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import {
  createZip,
  crc32,
  formatBytes,
  isImageFile,
  targetBytes,
  uniqueJpegName,
} from "../../../src/lib/photoCompressor";

describe("photo compressor validation", () => {
  it("accepts 300 KB as 300000 bytes and rejects invalid limits", () => {
    expect(targetBytes("300")).toBe(300000);
    expect(targetBytes("20")).toBe(20000);
    for (const value of ["", "0", "19", "5001", "1.4", "nope", "Infinity"]) {
      expect(() => targetBytes(value)).toThrow();
    }
  });

  it("filters non-images but accepts iPhone HEIC files without a MIME type", () => {
    expect(isImageFile({ name: "image.HEIC", type: "" })).toBe(true);
    expect(isImageFile({ name: "test.png", type: "image/png" })).toBe(true);
    expect(isImageFile({ name: "document.pdf", type: "application/pdf" })).toBe(false);
    expect(formatBytes(2500000)).toBe("2.5 MB");
    expect(formatBytes(300000)).toBe("300 KB");
  });

  it("preserves unique and safe JPEG names across identical originals", () => {
    const used = new Set<string>();
    expect(uniqueJpegName("photo.HEIC", used)).toBe("photo.jpg");
    expect(uniqueJpegName("photo.png", used)).toBe("photo-2.jpg");
    expect(uniqueJpegName("../photo.jpeg", used)).toBe("_photo.jpg");
    expect(uniqueJpegName("photo.PNG", used)).toBe("photo-3.jpg");
  });
});

describe("client-side ZIP archive", () => {
  it("matches a known CRC32 value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("stores JPGs with UTF-8 names, correct offsets and a central directory", async () => {
    const oldBlob = globalThis.Blob;
    globalThis.Blob = NodeBlob as unknown as typeof Blob;
    try {
      const zip = await createZip([
        { name: "photo.jpg", blob: new NodeBlob([Uint8Array.from([1, 2, 3])]) as unknown as Blob },
        { name: "épreuve.jpg", blob: new NodeBlob([Uint8Array.from([4, 5])]) as unknown as Blob },
      ]);
      const bytes = new Uint8Array(await zip.arrayBuffer());
      const view = new DataView(bytes.buffer);
      expect(view.getUint32(0, true)).toBe(0x04034b50);
      const end = bytes.byteLength - 22;
      expect(view.getUint32(end, true)).toBe(0x06054b50);
      expect(view.getUint16(end + 10, true)).toBe(2);
      const centralOffset = view.getUint32(end + 16, true);
      expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
      const filenameLength = view.getUint16(centralOffset + 28, true);
      expect(new TextDecoder().decode(bytes.slice(centralOffset + 46, centralOffset + 46 + filenameLength))).toBe("photo.jpg");
      expect(view.getUint32(centralOffset + 20, true)).toBe(3);
      expect(view.getUint32(centralOffset + 16, true)).toBe(crc32(Uint8Array.from([1, 2, 3])));
      expect(zip.type).toBe("application/zip");
    } finally {
      globalThis.Blob = oldBlob;
    }
  });

  it("rejects an empty archive", async () => {
    await expect(createZip([])).rejects.toThrow("No files");
  });
});
