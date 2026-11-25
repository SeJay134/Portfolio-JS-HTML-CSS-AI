import { loadSafetyModel, screenImage, MAX_BATCH_FILES, MAX_INPUT_IMAGE_BYTES } from "./contentSafety";
import { compressImage, isImageFile, uniqueJpegName, type CompressionResult } from "./photoCompressor";

export const MAX_BATCH_INPUT_BYTES = 1024 * 1024 * 1024;
export const MAX_BATCH_OUTPUT_BYTES = 100 * 1024 * 1024;
export type PhotoState = "queued" | "checking" | "compressing" | "ready" | "failed" | "blocked" | "cancelled";
export type ReadyPhoto = CompressionResult & { outputName: string };
export type PhotoItem = {
  id: string; name: string; sourceBytes: number; file: File | null; state: PhotoState;
  result?: ReadyPhoto; reason?: string;
};
export function selectStudioPhotos(files: readonly File[], makeId: () => string = () => crypto.randomUUID()) {
  const items: PhotoItem[] = [];
  let bytes = 0, rejected = 0;
  for (const file of files) {
    if (items.length >= MAX_BATCH_FILES || !isImageFile(file) || !file.size ||
        file.size > MAX_INPUT_IMAGE_BYTES || bytes + file.size > MAX_BATCH_INPUT_BYTES) { rejected++; continue; }
    bytes += file.size;
    items.push({ id: makeId(), name: file.name, sourceBytes: file.size, file, state: "queued" });
  }
  return { items, rejected };
}
export function canProcess(item: PhotoItem): boolean {
  return !!item.file && ["queued", "failed", "cancelled"].includes(item.state);
}
export async function processStudioPhotos(items: readonly PhotoItem[], ids: ReadonlySet<string>, limit: number,
  signal: AbortSignal, onUpdate: (id: string, changes: Partial<PhotoItem>) => void): Promise<void> {
  if (!Number.isInteger(limit) || limit < 20000 || limit > 5000000) throw new Error("Invalid photo target.");
  const candidates = items.filter(item => ids.has(item.id) && canProcess(item));
  if (!candidates.length || signal.aborted) return;
  const used = new Set(items.flatMap(item => item.result ? [item.result.outputName.toLowerCase()] : []));
  let outputBytes = items.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
  const update = (id: string, changes: Partial<PhotoItem>) => { if (!signal.aborted) onUpdate(id, changes); };
  let model: Awaited<ReturnType<typeof loadSafetyModel>>;
  try { model = await loadSafetyModel(); }
  catch { if (!signal.aborted) throw new Error("On-device safety filter unavailable. No photos were processed."); return; }
  for (const item of candidates) {
    if (signal.aborted) return;
    const file = item.file;
    if (!file) continue;
    if (outputBytes >= MAX_BATCH_OUTPUT_BYTES) {
      update(item.id, { state: "failed", reason: "Batch output limit reached. Remove ready files or use smaller batches." }); continue;
    }
    update(item.id, { state: "checking", reason: undefined });
    try {
      const blocked = await screenImage(file, model, signal);
      if (signal.aborted) return;
      // A malformed/non-boolean safety decision is not an approval.
      if (blocked === true) { update(item.id, { state: "blocked", file: null, reason: "Excluded by the adult-content filter." }); continue; }
      if (blocked !== false) throw new Error("Unverified image");
      update(item.id, { state: "compressing" });
      const result = await compressImage(file, limit, signal);
      if (signal.aborted) return;
      if (result.blob.type !== "image/jpeg" || result.blob.size < 1 || result.blob.size > limit ||
          !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.height < 1 ||
          Math.max(result.width, result.height) > 2200) throw new Error("Invalid compression output");
      if (outputBytes + result.blob.size > MAX_BATCH_OUTPUT_BYTES) {
        update(item.id, { state: "failed", reason: "Batch output limit reached. Remove ready files or use smaller batches." }); continue;
      }
      outputBytes += result.blob.size;
      update(item.id, { state: "ready", file: null, result: { ...result, sourceBytes: file.size, outputName: uniqueJpegName(file.name, used) } });
    } catch {
      if (signal.aborted) return;
      update(item.id, { state: "failed", reason: "Could not safely decode, screen or compress this photo." });
    }
  }
}
