/**
 * Backward-compatible local image-safety facade shared by Photo Compressor
 * and File Converter. Real moderation logic lives in ./moderation/.
 *
 * PR A enables adult-only screening; declaring other category types does NOT
 * mean those categories are detected. This cannot enforce rules on uploads.
 */
import { createAdultDetector } from "./moderation/detectors/adultDetector";
import { prepareImageForModeration } from "./moderation/imagePreprocessor";
import { moderateCanvas } from "./moderation/moderationEngine";
import { ACTIVE_LOCAL_IMAGE_POLICY } from "./moderation/policyEngine";
import { SafetyCheckError, type ModerationDecision } from "./moderation/types";
import type { SafetyModel } from "./moderation/detectors/adultDetector";

export {
  containsAdultContent,
  loadSafetyModel,
  type SafetyModel,
  type SafetyPrediction,
} from "./moderation/detectors/adultDetector";
export {
  MAX_BATCH_FILES,
  MAX_IMAGE_PIXELS,
  MAX_INPUT_IMAGE_BYTES,
} from "./moderation/imagePreprocessor";
export { SafetyCheckError } from "./moderation/types";
export type { ModerationDecision } from "./moderation/types";

/** Structured decision API for future callers and isolated unit tests. */
export async function moderateImage(
  file: File,
  model: SafetyModel,
  signal?: AbortSignal,
): Promise<ModerationDecision> {
  const canvas = await prepareImageForModeration(file, signal);
  return moderateCanvas(
    canvas,
    [createAdultDetector(model)],
    ACTIVE_LOCAL_IMAGE_POLICY,
    signal,
  );
}

/** Existing fail-closed boolean API, used by both shipped browser tools. */
export async function screenImage(
  file: File,
  model: SafetyModel,
  signal?: AbortSignal,
): Promise<boolean> {
  const decision = await moderateImage(file, model, signal);
  if (decision.verdict === "unverified") throw new SafetyCheckError();
  return decision.verdict === "block";
}
