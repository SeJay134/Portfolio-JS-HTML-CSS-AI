// Server-only public JPEG delivery core. No route, credentials, storage policy,
// token issuer or network client is configured by this module.
import { createHash } from "node:crypto";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp("^/blog/media/(" + UUID + ")\\.jpg$");
const OWNER_KEY = new RegExp("^" + UUID + "/" + UUID + "\\.jpg$");
const MAX_BYTES = 5000000;
const HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
});
const fail = (status, message, extra = {}) => ({
  status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra },
  body: Buffer.from(message),
});

function metadata(value, id) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 4 ||
      !["id", "key", "byte_size", "sha256"].every(k => Object.hasOwn(value, k)) ||
      value.id !== id || typeof value.key !== "string" ||
      value.key.length !== 77 || !OWNER_KEY.test(value.key) ||
      !value.key.endsWith("/" + id + ".jpg") ||
      !Number.isSafeInteger(value.byte_size) || value.byte_size < 4 || value.byte_size > MAX_BYTES ||
      typeof value.sha256 !== "string" || value.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(value.sha256))
    throw new Error("Invalid media metadata");
  // Snapshot fields so a mutable adapter cannot alter the comparison later.
  return { id, key: value.key, byte_size: value.byte_size, sha256: value.sha256 };
}

async function verifiedBytes(response, expected, signal) {
  if (!(response instanceof Response) || response.status !== 200 || response.redirected ||
      response.headers.get("content-type")?.trim().toLowerCase() !== "image/jpeg" ||
      response.headers.has("content-range") || !response.body)
    throw new Error("Invalid media response");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== expected.byte_size))
    throw new Error("Invalid content length");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let complete = false;
  // An adapter must also honor the signal while opening the upstream request.
  // Cancelling the reader fences a stalled body even if it ignores the signal.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new Error("Invalid media chunk");
      total += value.byteLength;
      if (total > expected.byte_size || total > MAX_BYTES) throw new Error("Oversize media");
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
  if (total !== expected.byte_size) throw new Error("Truncated media");
  const bytes = Buffer.concat(chunks, total);
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[total - 2] !== 255 || bytes[total - 1] !== 217 ||
      createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
    throw new Error("Media integrity mismatch");
  return bytes;
}

/**
 * Resolve MUST return null only when the asset has no currently published
 * reference; upstream failure must throw. Read MUST use a fixed verified
 * private bucket and a server-only scoped credential, reject redirects and
 * honor the abort signal. Neither adapter is implemented/activated here.
 * Request cookies, user tokens, headers and query parameters are not forwarded.
 */
export async function deliverPublicMedia({ method, path }, { resolve, read }) {
  const match = typeof path === "string" && path.length === 52 ? PATH.exec(path) : null;
  if (!match) return fail(404, "Media not found.");
  if (method !== "GET") return fail(405, "Method not allowed.", { Allow: "GET" });
  const id = match[1];
  const signal = AbortSignal.timeout(10000);
  try {
    const before = await resolve(id, signal);
    signal.throwIfAborted();
    if (before === null) return fail(404, "Media not found.");
    const asset = metadata(before, id);
    const response = await read({ ...asset }, signal);
    signal.throwIfAborted();
    const bytes = await verifiedBytes(response, asset, signal);
    const after = await resolve(id, signal);
    signal.throwIfAborted();
    if (after === null) return fail(404, "Media not found.");
    const current = metadata(after, id);
    if (current.key !== asset.key || current.byte_size !== asset.byte_size || current.sha256 !== asset.sha256)
      throw new Error("Media changed");
    return { status: 200, headers: { ...HEADERS, "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length) }, body: bytes };
  } catch {
    return fail(503, "Media temporarily unavailable.");
  }
}
