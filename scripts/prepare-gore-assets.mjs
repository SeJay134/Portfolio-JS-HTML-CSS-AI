/**
 * Explicit opt-in download of pinned research model + WASM-only browser
 * runtime. Downloads occur on the developer/CI machine, NOT in the browser.
 * At inference time all assets are served from this portfolio's origin.
 *
 * Generated binary assets are ignored by Git and never committed.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const DIR = resolve("public/experimental-gore");
const MODEL_URL =
  "https://huggingface.co/OwenElliott/image-safety-classifier-xs/resolve/main/onnx/image-safety-classifier-xs.onnx";
const MODEL_SHA256 =
  "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689";
const NPM_TARBALL =
  "https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.24.3.tgz";
const NPM_SHA512 =
  "41dDq7fxtTm0XzGE7N0d6m8FcOY8EWtUA65GkOixJPB/G7DGzBmiDAnVVXHznRw9bgUZpb+4/1lQK/PNxGpbrQ==";
const RUNTIME_ASSETS = [
  "ort.wasm.min.js",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

async function fetchBytes(url, maxBytes) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error("Failed to fetch: " + new URL(url).host + " " + response.status);
  const advertised = Number(response.headers.get("content-length"));
  if (advertised > maxBytes) throw new Error("Download exceeded size limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty download.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error("Download exceeded size limit.");
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function tarEntries(tgz) {
  const tar = gunzipSync(tgz, { maxOutputLength: 220_000_000 });
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const readAscii = (start, size) =>
      header.subarray(start, start + size).toString("utf8").split("\0")[0];
    const name = readAscii(0, 100);
    const prefix = readAscii(345, 155);
    const path = prefix ? prefix + "/" + name : name;
    const size = Number.parseInt(readAscii(124, 12).trim(), 8);
    const kind = readAscii(156, 1);
    if (!Number.isSafeInteger(size) || size < 0 || size > 150_000_000) {
      throw new Error("Unsafe NPM archive entry size.");
    }
    const start = offset + 512;
    const end = start + size;
    if (end > tar.length) throw new Error("Truncated NPM archive.");
    if (kind === "0" || kind === "") files.set(path, tar.subarray(start, end));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

function digest(algorithm, buffer, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

await mkdir(DIR, { recursive: true });
console.log("Preparing local-only experimental gore model assets...");
const model = await fetchBytes(MODEL_URL, 18_000_000);
if (digest("sha256", model, "hex") !== MODEL_SHA256) {
  throw new Error("Gore model SHA-256 mismatch. Do not use this model.");
}

const npmArchive = await fetchBytes(NPM_TARBALL, 100_000_000);
if (digest("sha512", npmArchive, "base64") !== NPM_SHA512) {
  throw new Error("ONNX Runtime package integrity mismatch. Do not use this package.");
}
const entries = tarEntries(npmArchive);
for (const file of RUNTIME_ASSETS) {
  const source = entries.get("package/dist/" + file);
  if (!source || source.length === 0) {
    throw new Error("Missing WASM-only ONNX Runtime asset: " + file);
  }
}
await writeFile(resolve(DIR, "image-safety-classifier-xs.onnx"), model);
for (const file of RUNTIME_ASSETS) {
  await writeFile(resolve(DIR, file), entries.get("package/dist/" + file));
}
const manifest = {
  model: "OwenElliott/image-safety-classifier-xs",
  modelSha256: MODEL_SHA256,
  modelBytes: model.byteLength,
  runtime: "onnxruntime-web@1.24.3",
  assetHashes: Object.fromEntries(RUNTIME_ASSETS.map((name) =>
    [name, digest("sha256", entries.get("package/dist/" + name), "hex")])),
  purpose: "Non-production research; not a calibrated safety filter",
};
await writeFile(resolve(DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
console.log("Assets are same-origin and Git-ignored. No visitor images are downloaded or uploaded.");
