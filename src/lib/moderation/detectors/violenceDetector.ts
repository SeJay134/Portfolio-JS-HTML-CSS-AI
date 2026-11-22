import { ensureNotCancelled, SafetyCheckError, type ModerationDetector } from "../types";

/**
 * Binary violence classifier adapter for future model evaluation.
 * No suitable validated on-device general-violence model has been bundled.
 * Must NEVER be added to the active production policy based only on this API.
 */
export interface ViolencePredictor {
  probabilityOfViolence(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<number>;
}

export function createExperimentalViolenceDetector(
  predictor: ViolencePredictor,
  threshold = 0.5,
): ModerationDetector {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new SafetyCheckError("Invalid experimental violence threshold.");
  }
  return {
    id: "unvalidated-binary-violence-candidate",
    category: "graphic_violence",
    async classify(canvas, signal) {
      ensureNotCancelled(signal);
      const score = await predictor.probabilityOfViolence(canvas, signal);
      ensureNotCancelled(signal);
      if (!Number.isFinite(score) || score < 0 || score > 1) {
        throw new SafetyCheckError("Invalid experimental violence model score.");
      }
      return score >= threshold ? "block" : "allow";
    },
  };
}
