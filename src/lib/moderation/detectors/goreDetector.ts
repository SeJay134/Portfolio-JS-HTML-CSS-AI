import {
  ensureNotCancelled, SafetyCheckError, type ModerationDetector,
} from "../types";

/**
 * Experimental gore (NSFL) candidate. NSFL is NOT a reliable detector for
 * generic non-graphic violence, abuse, consent, or criminality.
 */
export type GoreProbabilities = readonly number[]; // [NSFL, NSFW, SFW]

export interface GorePredictor {
  predict(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<GoreProbabilities>;
}

export const GORE_CANDIDATE_THRESHOLD = 0.5; // research only, NOT calibrated

export function validateGoreProbabilities(values: GoreProbabilities): number {
  if (!Array.isArray(values) || values.length !== 3 ||
      values.some((value) => typeof value !== "number" ||
        !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new SafetyCheckError("The experimental gore model produced invalid scores.");
  }
  const total = values[0] + values[1] + values[2];
  if (Math.abs(total - 1) > 0.05) {
    throw new SafetyCheckError("The experimental gore model produced invalid scores.");
  }
  return values[0]; // class 0 is NSFL (gore), not general violence
}

export function createGoreCandidateDetector(
  predictor: GorePredictor,
  threshold = GORE_CANDIDATE_THRESHOLD,
): ModerationDetector {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new SafetyCheckError("Invalid experimental gore threshold.");
  }
  return {
    id: "owen-safety-xs-nsfl-experimental",
    category: "gore",
    async classify(canvas, signal) {
      ensureNotCancelled(signal);
      const scores = await predictor.predict(canvas, signal);
      ensureNotCancelled(signal);
      return validateGoreProbabilities(scores) >= threshold ? "block" : "allow";
    },
  };
}
