/**
 * Privacy-first photo screening. NSFWJS ships its MobileNetV2 model in the
 * application bundle: no selected photo is posted to an external service.
 *
 * This is a best-effort policy filter, not age verification or a guarantee.
 */
import { isImageFile } from "./photoCompressor";

export const MAX_INPUT_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_BATCH_FILES = 300;

const CATEGORY_NAMES = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"] as const;
type Category = (typeof CATEGORY_NAMES)[number];

export type SafetyPrediction = { className: string; probability: number };
export type SafetyModel = {
  classify(source: HTMLCanvasElement, topK?: number): Promise<SafetyPrediction[]>;
};

export class SafetyCheckError extends Error {
  constructor(message = "Could not verify image safety. This photo was skipped.") {
    super(message);
    this.name = "SafetyCheckError";
  }
}

/** Verify the full output: missing/invalid predictions must never mean safe. */
export function containsAdultContent(predictions: readonly SafetyPrediction[]): boolean {
  if (!Array.isArray(predictions) || predictions.length !== CATEGORY_NAMES.length) {
    throw new SafetyCheckError();
  }
  const scores = new Map<Category, number>();
  for (const prediction of predictions) {
    const category = CATEGORY_NAMES.find((name) => name === prediction?.className);
    const probability = prediction?.probability;
    if (!category || typeof probability !== "number" ||
        !Number.isFinite(probability) || probability < 0 || probability > 1 ||
        scores.has(category)) {
      throw new SafetyCheckError();
    }
    scores.set(category, probability);
  }
  if (CATEGORY_NAMES.some((category) => !scores.has(category))) {
    throw new SafetyCheckError();
  }
  const total = [...scores.values()].reduce((sum, score) => sum + score, 0);
  if (Math.abs(total - 1) > 0.05) throw new SafetyCheckError();

  const porn = scores.get("Porn")!;
  const hentai = scores.get("Hentai")!;
  const sexy = scores.get("Sexy")!;
  // Intentionally conservative. False positives are possible and expected.
  return porn >= 0.2 || hentai >= 0.2 || sexy >= 0.6 ||
    porn + hentai + sexy >= 0.6;
}

let safetyModelPromise: Promise<SafetyModel> | undefined;

/**
 * Lazily load the bundled model only when compression is requested.
 * A load failure is not an authorization to skip screening.
 */
export function loadSafetyModel(): Promise<SafetyModel> {
  if (!safetyModelPromise) {
    safetyModelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      // Import only the small MobileNetV2 registry rather than all bundled models.
      const [{ load }, { MobileNetV2Model }] = await Promise.all([
        import("nsfwjs/core"),
        import("nsfwjs/models/mobilenet_v2"),
      ]);
      return await load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
    })().catch(() => {
      safetyModelPromise = undefined; // allow retry when the user tries again
      throw new SafetyCheckError(
        "The on-device safety filter is unavailable. No photos were processed.",
      );
    });
  }
  return safetyModelPromise;
}

function ensureNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

async function imageForScreening(file: File): Promise<{
  source: CanvasImageSource; width: number; height: number; cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap, width: bitmap.width, height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // iOS Safari may support HEIC through Image but not createImageBitmap.
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
      source: image, width: image.naturalWidth, height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Every selected image must pass screening before it can reach compression. */
export async function screenImage(
  file: File, model: SafetyModel, signal?: AbortSignal,
): Promise<boolean> {
  ensureNotCancelled(signal);
  if (!isImageFile(file) || file.size < 1 || file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new SafetyCheckError("Unsupported or oversized image. This photo was skipped.");
  }
  let decoded: Awaited<ReturnType<typeof imageForScreening>>;
  try {
    decoded = await imageForScreening(file);
  } catch {
    throw new SafetyCheckError();
  }
  try {
    ensureNotCancelled(signal);
    if (!decoded.width || !decoded.height ||
        !Number.isFinite(decoded.width * decoded.height) ||
        decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
      throw new SafetyCheckError("Image dimensions are unsupported. This photo was skipped.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new SafetyCheckError();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 224, 224);
    ctx.drawImage(decoded.source, 0, 0, 224, 224);

    let predictions: SafetyPrediction[];
    try {
      predictions = await model.classify(canvas, 5);
    } catch {
      throw new SafetyCheckError();
    }
    ensureNotCancelled(signal);
    return containsAdultContent(predictions);
  } finally {
    decoded.cleanup();
  }
}
