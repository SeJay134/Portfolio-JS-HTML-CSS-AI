/**
 * Local-only moderation contracts. A category appearing here does NOT mean
 * a detector for that category has been implemented or validated.
 */
export const MODERATION_CATEGORIES = [
  "adult", "graphic_violence", "self_harm", "threatening_text",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];
export type ModerationVerdict = "allow" | "block" | "unverified";
export type DetectorVerdict = "allow" | "block";
export type DetectorStatus = "clear" | "flagged" | "unverified";

export type DetectorFinding = {
  category: ModerationCategory;
  detectorId: string;
  status: DetectorStatus;
};

export type ModerationPolicy = Readonly<{
  version: string;
  requiredCategories: readonly ModerationCategory[];
}>;

export type ModerationDecision = Readonly<{
  verdict: ModerationVerdict;
  policyVersion: string;
  findings: readonly DetectorFinding[];
}>;

export interface ModerationDetector {
  readonly id: string;
  readonly category: ModerationCategory;
  /**
   * Process a pre-decoded local canvas. No network transfer is permitted.
   * Detectors must throw if they cannot classify reliably.
   */
  classify(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<DetectorVerdict>;
}

export class SafetyCheckError extends Error {
  constructor(message = "Could not verify image safety. This photo was skipped.") {
    super(message);
    this.name = "SafetyCheckError";
  }
}

export function ensureNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}
