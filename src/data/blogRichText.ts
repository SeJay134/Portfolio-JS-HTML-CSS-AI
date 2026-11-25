// Versioned structured text. No HTML, embedded media, or executable URLs.
export type RichRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type RichParagraph = { type: "rich-paragraph"; version: 1; runs: readonly RichRun[] };

export function safeBlogHref(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 2048 ||
      /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      const url = new URL(value, "https://blog.invalid");
      return url.origin === "https://blog.invalid";
    }
    if (!/^https?:\/\//i.test(value)) return false;
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid formatted paragraph");
  return value as Record<string, unknown>;
}
export function decodeRichParagraph(value: unknown): RichParagraph {
  const block = record(value);
  if (Object.keys(block).some(key => !["type", "version", "runs"].includes(key)) ||
      block.type !== "rich-paragraph" || block.version !== 1 ||
      !Array.isArray(block.runs) || !block.runs.length || block.runs.length > 50) {
    throw new Error("Invalid formatted paragraph");
  }
  const runs = block.runs.map((value): RichRun => {
    const run = record(value);
    if (Object.keys(run).some(key => !["text", "bold", "italic", "href"].includes(key)) ||
        typeof run.text !== "string" || !run.text.length || run.text.length > 10000 ||
        (run.bold !== undefined && typeof run.bold !== "boolean") ||
        (run.italic !== undefined && typeof run.italic !== "boolean") ||
        (run.href !== undefined && !safeBlogHref(run.href))) throw new Error("Invalid formatted text or link");
    return { text: run.text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}),
      ...(typeof run.href === "string" ? { href: run.href } : {}) };
  });
  if (!runs.some(run => run.text.trim())) throw new Error("Empty formatted paragraph");
  return { type: "rich-paragraph", version: 1, runs };
}
