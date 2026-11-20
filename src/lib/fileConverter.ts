import { compressImage } from "./photoCompressor";
import {
  asBlob, type FileFormat, INVALID_FILE_MESSAGE, isSupportedPair,
  readUtf8,
} from "./fileFormats";
import { parseCsv, readExcelRows, readWordText, rowsToCsv, writeExcel, writeWord } from "./documentTransforms";

const PAGE_WIDTH = 960;
const PAGE_HEIGHT = 1358;

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}
function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.type !== mime) reject(new Error("This browser cannot encode " + mime + "."));
    else resolve(blob);
  }, mime, quality));
}
function pdfEscapeTitle(name: string) {
  return name.replace(/[^A-Za-z0-9 _.-]/g, "_").slice(0, 70);
}
type JpegPage = { bytes: Uint8Array; width: number; height: number };
/** Minimal valid image-based PDF. Text remains visually legible but is not selectable. */
async function createPdfPages(canvases: HTMLCanvasElement[], signal?: AbortSignal): Promise<Blob> {
  const images: JpegPage[] = [];
  for (const canvas of canvases) {
    aborted(signal);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets = [0];
  function add(value: string | Uint8Array) {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes); length += bytes.byteLength;
  }
  function object(number: number, contents: string) {
    offsets[number] = length;
    add(number + " 0 obj\n" + contents + "\nendobj\n");
  }
  add("%PDF-1.4\n%Local converter\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kidIds = images.map((_, i) => 3 + i * 3);
  object(2, "<< /Type /Pages /Count " + images.length + " /Kids [" +
    kidIds.map((id) => id + " 0 R").join(" ") + "] >>");
  for (let i = 0; i < images.length; i++) {
    aborted(signal);
    const { bytes, width, height } = images[i];
    const page = 3 + i * 3, content = page + 1, image = page + 2;
    object(page, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /XObject << /Im0 " + image + " 0 R >> >> /Contents " +
      content + " 0 R >>");
    const drawing = "q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n";
    object(content, "<< /Length " + encoder.encode(drawing).length +
      " >>\nstream\n" + drawing + "endstream");
    offsets[image] = length;
    add(image + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + width +
      " /Height " + height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 " +
      "/Filter /DCTDecode /Length " + bytes.length + " >>\nstream\n");
    add(bytes);
    add("\nendstream\nendobj\n");
  }
  const start = length;
  add("xref\n0 " + (3 + images.length * 3) + "\n0000000000 65535 f \n");
  for (let i = 1; i < 3 + images.length * 3; i++) {
    add(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  }
  add("trailer\n<< /Size " + (3 + images.length * 3) +
    " /Root 1 0 R >>\nstartxref\n" + start + "\n%%EOF\n");
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH; canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  return canvas;
}

async function renderTextPdf(text: string, title: string, signal?: AbortSignal): Promise<Blob> {
  if (!text.trim()) throw new Error("The document has no readable text.");
  if (text.length > 130_000) throw new Error("Document is too long for the PDF preview.");
  const canvases: HTMLCanvasElement[] = [];
  let canvas = makeCanvas();
  let context = canvas.getContext("2d")!;
  let y = 80;
  function newPage() {
    canvases.push(canvas);
    if (canvases.length >= 40) throw new Error("PDF would exceed the 40-page limit.");
    canvas = makeCanvas(); context = canvas.getContext("2d")!;
    setup(); y = 80;
  }
  function setup() {
    context.font = "24px Arial, sans-serif";
    context.fillStyle = "#202020";
    context.textBaseline = "top";
  }
  setup();
  const lines = [pdfEscapeTitle(title), "", ...text.replace(/\r\n?/g, "\n").split("\n")];
  for (const line of lines) {
    aborted(signal);
    if (!line.trim()) { y += 18; continue; }
    let rest = line;
    // Wrap by measured width, including very long words and CJK.
    while (rest.length) {
      let cut = rest.length;
      if (context.measureText(rest).width > PAGE_WIDTH - 140) {
        let low = 1, high = rest.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (context.measureText(rest.slice(0, mid)).width <= PAGE_WIDTH - 140) low = mid;
          else high = mid - 1;
        }
        cut = Math.max(1, low);
        const space = rest.lastIndexOf(" ", cut);
        if (space > cut / 2) cut = space;
      }
      if (y > PAGE_HEIGHT - 90) newPage();
      context.fillText(rest.slice(0, cut), 70, y);
      y += 33;
      rest = rest.slice(cut).trimStart();
    }
  }
  canvases.push(canvas);
  return createPdfPages(canvases, signal);
}

async function readImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const img = await createImageBitmap(file);
      return { image: img, width: img.width, height: img.height, cleanup: () => img.close() };
    } catch {
      // Safari can decode some images with HTMLImageElement but not createImageBitmap.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(INVALID_FILE_MESSAGE));
      img.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
  } catch (err) { URL.revokeObjectURL(url); throw err; }
}

async function transformImage(file: File, to: FileFormat, signal?: AbortSignal): Promise<Blob> {
  const decoded = await readImage(file);
  try {
    aborted(signal);
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 35_000_000) {
      throw new Error("Image dimensions are unsupported.");
    }
    if (to === "pdf") {
      const canvas = makeCanvas();
      const ctx = canvas.getContext("2d")!;
      const factor = Math.min((PAGE_WIDTH - 80) / decoded.width, (PAGE_HEIGHT - 80) / decoded.height);
      const width = decoded.width * factor, height = decoded.height * factor;
      ctx.drawImage(decoded.image, (PAGE_WIDTH - width) / 2, (PAGE_HEIGHT - height) / 2, width, height);
      return createPdfPages([canvas], signal);
    }
    const canvas = document.createElement("canvas");
    const factor = Math.min(1, 3200 / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * factor));
    canvas.height = Math.max(1, Math.round(decoded.height * factor));
    const ctx = canvas.getContext("2d")!;
    if (to === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, to === "jpg" ? "image/jpeg" : "image/" + to);
  } finally { decoded.cleanup(); }
}

function pdfLiteral(content: string): string {
  return content.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, code: string) => {
    const specials: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
    return Object.hasOwn(specials, code) ? specials[code] : String.fromCharCode(parseInt(code, 8));
  });
}

/** Best-effort only for PDFs containing standard text operators; no OCR or fonts decoding. */
export async function readPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = new TextDecoder("latin1").decode(bytes);
  if (!source.startsWith("%PDF-") || !source.includes("%%EOF")) throw new Error(INVALID_FILE_MESSAGE);
  const output: string[] = [];
  const streams = source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
  for (const match of streams) {
    const before = source.slice(Math.max(0, match.index - 400), match.index);
    let stream = match[1];
    if (/\/Filter\s*\/?(?:\[[^\]]*)?FlateDecode/.test(before)) {
      try {
        const data = Uint8Array.from(stream, ch => ch.charCodeAt(0));
        const decompressed = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
        stream = new TextDecoder("latin1").decode(await new Response(decompressed).arrayBuffer());
      } catch {
        throw new Error("This PDF uses unsupported compression.");
      }
    } else if (/\/Filter\s*\//.test(before)) {
      continue;
    }
    for (const body of stream.matchAll(/BT([\s\S]*?)ET/g)) {
      const text = Array.from(body[1].matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))
        .map(item => pdfLiteral(item[1])).join(" ");
      if (text.trim()) output.push(text);
    }
  }
  const answer = output.join("\n").trim();
  if (!answer) throw new Error("No readable PDF text found. Scanned or complex PDFs need OCR.");
  return answer;
}

export async function convertFile(
  file: File, from: FileFormat, to: FileFormat,
  signal?: AbortSignal,
): Promise<Blob> {
  aborted(signal);
  if (!isSupportedPair(from, to)) throw new Error("This conversion is not supported.");
  if (["png", "jpg", "webp"].includes(from)) {
    return transformImage(file, to, signal);
  }
  if (from === "pdf") {
    return asBlob(await readPdfText(file));
  }
  if (from === "docx") {
    const text = await readWordText(file);
    return to === "txt" ? asBlob(text) : renderTextPdf(text, file.name, signal);
  }
  if (from === "txt") {
    const text = readUtf8(await file.arrayBuffer());
    return to === "docx" ? writeWord(text) : renderTextPdf(text, file.name, signal);
  }
  if (from === "csv") {
    const rows = parseCsv(readUtf8(await file.arrayBuffer()));
    if (to === "xlsx") return writeExcel(rows);
    if (to === "txt") return asBlob(rows.map(x => x.join("\t")).join("\n"));
    return renderTextPdf(rows.map(x => x.join(" | ")).join("\n"), file.name, signal);
  }
  if (from === "xlsx") {
    const rows = await readExcelRows(file);
    if (to === "csv") return asBlob(rowsToCsv(rows), "text/csv;charset=utf-8");
    if (to === "txt") return asBlob(rows.map(x => x.join("\t")).join("\n"));
    return renderTextPdf(rows.map(x => x.join(" | ")).join("\n"), file.name, signal);
  }
  throw new Error(INVALID_FILE_MESSAGE);
}

/** Legacy photo compression path is kept separate and still exposed on its original URL. */
export async function compressToJpeg(file: File, limitBytes: number, signal?: AbortSignal): Promise<Blob> {
  return (await compressImage(file, limitBytes, signal)).blob;
}
