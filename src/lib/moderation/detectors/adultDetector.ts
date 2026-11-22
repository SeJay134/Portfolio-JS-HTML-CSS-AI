import {
  ensureNotCancelled, SafetyCheckError, type ModerationDetector,
} from "../types";

const CATEGORY_NAMES = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"] as const;
type Category = (typeof CATEGORY_NAMES)[number];

export type SafetyPrediction = { className: string; probability: number };
export type SafetyModel = {
  classify(source: HTMLCanvasElement, topK?: number): Promise<SafetyPrediction[]>;
};

/** Preserve original NSFWJS thresholds and validate the entire distribution. */
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
  return porn >= 0.2 || hentai >= 0.2 || sexy >= 0.6 ||
    porn + hentai + sexy >= 0.6;
}

let safetyModelPromise: Promise<SafetyModel> | undefined;

/**
 * Lazy-loaded bundled MobileNetV2: no user image is posted to a service.
 * Failed initializations are retriable but never authorize a bypass.
 */
export function loadSafetyModel(): Promise<SafetyModel> {
  if (!safetyModelPromise) {
    safetyModelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const [{ load }, { MobileNetV2Model }] = await Promise.all([
        import("nsfwjs/core"),
        import("nsfwjs/models/mobilenet_v2"),
      ]);
      return await load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
    })().catch(() => {
      safetyModelPromise = undefined;
      throw new SafetyCheckError(
        "The on-device safety filter is unavailable. No photos were processed.",
      );
    });
  }
  return safetyModelPromise;
}

export function createAdultDetector(model: SafetyModel): ModerationDetector {
  return {
    id: "nsfwjs-mobilenetv2",
    category: "adult",
    async classify(canvas, signal) {
      ensureNotCancelled(signal);
      const predictions = await model.classify(canvas, 5);
      ensureNotCancelled(signal);
      return containsAdultContent(predictions) ? "block" : "allow";
    },
  };
}
