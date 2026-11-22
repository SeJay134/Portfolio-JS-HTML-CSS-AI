import { isImageFile } from "../photoCompressor";
import { ensureNotCancelled, SafetyCheckError } from "./types";

export const MAX_INPUT_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_BATCH_FILES = 300;

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Safari may support HEIC through Image but not createImageBitmap.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new SafetyCheckError());
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * One decoded still frame, resized to the existing NSFWJS 224px input.
 * No image bytes are uploaded, stored or sent to a moderation API.
 * Animated media's later frames are NOT screened by this function.
 */
export async function prepareImageForModeration(
  file: File,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  ensureNotCancelled(signal);
  if (!isImageFile(file) || file.size < 1 || file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new SafetyCheckError("Unsupported or oversized image. This photo was skipped.");
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    ensureNotCancelled(signal);
    throw new SafetyCheckError();
  }
  try {
    ensureNotCancelled(signal);
    const pixels = decoded.width * decoded.height;
    if (!Number.isSafeInteger(pixels) || !decoded.width || !decoded.height ||
        pixels > MAX_IMAGE_PIXELS) {
      throw new SafetyCheckError("Image dimensions are unsupported. This photo was skipped.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new SafetyCheckError();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 224, 224);
    try {
      ctx.drawImage(decoded.source, 0, 0, 224, 224);
    } catch {
      throw new SafetyCheckError();
    }
    ensureNotCancelled(signal);
    return canvas;
  } finally {
    decoded.cleanup();
  }
}
