export const DEFAULT_TARGET_KB = 300;
export const MIN_TARGET_KB = 20;
export const MAX_TARGET_KB = 5000;

export type ZipEntry = { name: string; blob: Blob };
export type CompressionResult = {
  name: string;
  blob: Blob;
  sourceBytes: number;
  width: number;
  height: number;
};

export function targetBytes(value: string): number {
  const kb = Number(value);
  if (!Number.isInteger(kb) || kb < MIN_TARGET_KB || kb > MAX_TARGET_KB) {
    throw new Error("Enter a whole number between 20 and 5000 KB.");
  }
  return kb * 1000;
}

export function isImageFile(file: Pick<File, "name" | "type">): boolean {
  return file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(file.name);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1_000_000
    ? (bytes / 1_000_000).toFixed(1) + " MB"
    : Math.round(bytes / 1000) + " KB";
}

export function uniqueJpegName(original: string, used: Set<string>): string {
  const safe = original
    .replace(/[\\/]/g, "_")
    .split("")
    .map((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? "_" : char)
    .join("")
    .replace(/\.[^.]+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100) || "image";
  let name = safe + ".jpg";
  let number = 2;
  while (used.has(name.toLowerCase())) {
    name = safe + "-" + number++ + ".jpg";
  }
  used.add(name.toLowerCase());
  return name;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

type Decoded = { image: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap, width: bitmap.width, height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some Safari versions decode HEIC via an <img> but not createImageBitmap.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This browser cannot decode the image."));
    });
    return {
      image, width: image.naturalWidth, height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function jpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/jpeg") {
        reject(new Error("JPEG encoding is unavailable in this browser."));
      } else resolve(blob);
    }, "image/jpeg", quality);
  });
}

export async function compressImage(
  file: File,
  limitBytes: number,
  signal?: AbortSignal,
): Promise<CompressionResult> {
  if (!isImageFile(file)) throw new Error("Not an image file.");
  if (!Number.isFinite(limitBytes) || limitBytes < 1000) {
    throw new Error("Invalid size limit.");
  }
  assertNotAborted(signal);
  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error("Invalid image dimensions.");
    const initialScale = Math.min(1, 2200 / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * initialScale));
    let height = Math.max(1, Math.round(decoded.height * initialScale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is not available.");
    for (let attempt = 0; attempt < 18; attempt++) {
      assertNotAborted(signal);
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.image, 0, 0, width, height);
      let best = await jpegBlob(canvas, 0.92);
      if (best.size <= limitBytes) {
        return { name: file.name, blob: best, sourceBytes: file.size, width, height };
      }
      let low = 0.2;
      let high = 0.92;
      for (let quality = 0; quality < 9; quality++) {
        assertNotAborted(signal);
        const midpoint = (low + high) / 2;
        const candidate = await jpegBlob(canvas, midpoint);
        if (candidate.size <= limitBytes) {
          best = candidate;
          low = midpoint;
        } else {
          high = midpoint;
        }
      }
      if (best.size <= limitBytes) {
        return { name: file.name, blob: best, sourceBytes: file.size, width, height };
      }
      if (width === 1 && height === 1) break;
      width = Math.max(1, Math.floor(width * 0.8));
      height = Math.max(1, Math.floor(height * 0.8));
    }
    throw new Error("Could not meet the selected file size.");
  } finally {
    decoded.close();
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error("No files to download.");
  if (entries.length > 65535) throw new Error("Too many files for a ZIP archive.");
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const filename = encoder.encode(entry.name);
    const size = entry.blob.size;
    if (filename.byteLength > 65535 || size > 0xffffffff || offset + 30 + filename.length + size > 0xffffffff) {
      throw new Error("ZIP exceeds the supported 4 GB limit.");
    }
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = header(30 + filename.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, size, true);
    local.view.setUint32(22, size, true);
    local.view.setUint16(26, filename.length, true);
    local.bytes.set(filename, 30);
    parts.push(local.bytes as BlobPart, entry.blob);
    const central = header(46 + filename.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, size, true);
    central.view.setUint32(24, size, true);
    central.view.setUint16(28, filename.length, true);
    central.view.setUint32(42, offset, true);
    central.bytes.set(filename, 46);
    directory.push(central.bytes);
    offset += local.bytes.length + size;
  }
  const directorySize = directory.reduce((total, bytes) => total + bytes.length, 0);
  if (offset + directorySize + 22 > 0xffffffff) {
    throw new Error("ZIP exceeds the supported 4 GB limit.");
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes] as BlobPart[], {
    type: "application/zip",
  });
}
