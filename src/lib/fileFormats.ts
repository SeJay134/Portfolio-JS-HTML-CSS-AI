import { crc32 } from "./photoCompressor";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_FILES = 120;
export const INVALID_FILE_MESSAGE = "Invalid file format. Choose another file.";

export const FORMAT_LABELS = {
  png: "PNG image", jpg: "JPEG image", webp: "WebP image",
  pdf: "PDF document", docx: "Word (.docx)", xlsx: "Excel (.xlsx)",
  csv: "CSV spreadsheet", txt: "Plain text (.txt)",
} as const;
export type FileFormat = keyof typeof FORMAT_LABELS;
export const INPUT_FORMATS = Object.keys(FORMAT_LABELS) as FileFormat[];
export const OUTPUT_FORMATS: Record<FileFormat, FileFormat[]> = {
  png: ["jpg", "webp", "pdf"],
  jpg: ["png", "webp", "pdf"],
  webp: ["png", "jpg", "pdf"],
  pdf: ["txt"],
  docx: ["txt", "pdf"],
  xlsx: ["csv", "txt", "pdf"],
  csv: ["xlsx", "txt", "pdf"],
  txt: ["docx", "pdf"],
};

export function formatFromName(name: string): FileFormat | null {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return null;
  if (extension === "jpeg") return "jpg";
  return Object.hasOwn(FORMAT_LABELS, extension) ? extension as FileFormat : null;
}

export function isSupportedPair(from: FileFormat, to: FileFormat): boolean {
  return OUTPUT_FORMATS[from].includes(to);
}

export function uniqueOutputName(original: string, format: FileFormat, used: Set<string>): string {
  const base = original
    .replace(/[\\/]/g, "_")
    .split("")
    .map((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? "_" : char)
    .join("")
    .replace(/\.[^.]+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 90) || "converted";
  let name = base + "." + format;
  let count = 2;
  while (used.has(name.toLowerCase())) name = base + "-" + count++ + "." + format;
  used.add(name.toLowerCase());
  return name;
}

export function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
export const asBlob = (value: string, type = "text/plain;charset=utf-8") =>
  new Blob([value], { type });

export function readUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.includes(0)) throw new Error(INVALID_FILE_MESSAGE);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new Error(INVALID_FILE_MESSAGE);
  }
}

export async function detectFileFormat(file: File): Promise<FileFormat> {
  const format = formatFromName(file.name);
  if (!format || !file.size || file.size > MAX_FILE_BYTES) {
    throw new Error(INVALID_FILE_MESSAGE);
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = new TextDecoder("latin1").decode(bytes);
  let valid = true;
  switch (format) {
    case "png":
      valid = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
      break;
    case "jpg":
      valid = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      break;
    case "webp":
      valid = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
      break;
    case "pdf":
      valid = ascii.startsWith("%PDF-");
      break;
    case "docx":
    case "xlsx":
      valid = bytes[0] === 80 && bytes[1] === 75 &&
        bytes[2] === 3 && bytes[3] === 4;
      break;
    case "txt":
    case "csv":
      readUtf8(await file.arrayBuffer());
      break;
  }
  if (!valid) throw new Error(INVALID_FILE_MESSAGE);
  if (format === "docx" || format === "xlsx") {
    const member = format === "docx" ? "word/document.xml" : "xl/workbook.xml";
    if (!(await readZipMember(file, member))) throw new Error(INVALID_FILE_MESSAGE);
  }
  return format;
}

/** Read a bounded member from a normal ZIP/OOXML archive; never extract paths to disk. */
export async function readZipMember(file: Blob, wanted: string): Promise<Uint8Array | null> {
  if (file.size > MAX_FILE_BYTES) throw new Error(INVALID_FILE_MESSAGE);
  const data = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // The EOCD can contain a ZIP comment of up to 65535 bytes.
  let eocd = -1;
  for (let at = data.length - 22; at >= Math.max(0, data.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0 || view.getUint16(eocd + 4, true) !== 0 ||
      view.getUint16(eocd + 6, true) !== 0) throw new Error(INVALID_FILE_MESSAGE);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let at = view.getUint32(eocd + 16, true);
  if (at + directorySize > eocd || count > 1000) throw new Error(INVALID_FILE_MESSAGE);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || view.getUint32(at, true) !== 0x02014b50) {
      throw new Error(INVALID_FILE_MESSAGE);
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const checksum = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const expanded = view.getUint32(at + 24, true);
    const nameSize = view.getUint16(at + 28, true);
    const extraSize = view.getUint16(at + 30, true);
    const commentSize = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const next = at + 46 + nameSize + extraSize + commentSize;
    if (next > eocd) throw new Error(INVALID_FILE_MESSAGE);
    const name = decoder.decode(data.subarray(at + 46, at + 46 + nameSize));
    at = next;
    if (name !== wanted) continue;
    if (flags & 1 || (method !== 0 && method !== 8) || expanded > 8_000_000 ||
        packed > MAX_FILE_BYTES || (expanded > 1000 * Math.max(1, packed))) {
      throw new Error(INVALID_FILE_MESSAGE);
    }
    if (localOffset + 30 > data.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(INVALID_FILE_MESSAGE);
    }
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (start + packed > data.length) throw new Error(INVALID_FILE_MESSAGE);
    const member = data.slice(start, start + packed);
    let output: Uint8Array;
    if (method === 0) output = member;
    else {
      if (typeof DecompressionStream !== "function") {
        throw new Error("This browser cannot read compressed Word/Excel files.");
      }
      try {
        const stream = new Blob([member as BlobPart]).stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let used = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            used += value.byteLength;
            if (used > 8_000_000 || used > expanded) {
              await reader.cancel();
              throw new Error(INVALID_FILE_MESSAGE);
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        output = new Uint8Array(used);
        let cursor = 0;
        for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
      } catch {
        throw new Error(INVALID_FILE_MESSAGE);
      }
    }
    if (output.byteLength !== expanded || crc32(output) !== checksum) {
      throw new Error(INVALID_FILE_MESSAGE);
    }
    return output;
  }
  return null;
}

export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error(INVALID_FILE_MESSAGE);
  }
  return doc;
}
