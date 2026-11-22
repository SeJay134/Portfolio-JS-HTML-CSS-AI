import { ACTIVE_LOCAL_IMAGE_POLICY, evaluateModerationPolicy } from "./policyEngine";
import {
  ensureNotCancelled,
  type DetectorFinding,
  type ModerationDecision,
  type ModerationDetector,
  type ModerationPolicy,
} from "./types";

/**
 * Runs only policy-required detectors, sequentially and locally.
 * Missing, duplicate, failed or malformed detectors become "unverified".
 * The caller must never process an "unverified" result.
 */
export async function moderateCanvas(
  canvas: HTMLCanvasElement,
  detectors: readonly ModerationDetector[],
  policy: ModerationPolicy = ACTIVE_LOCAL_IMAGE_POLICY,
  signal?: AbortSignal,
): Promise<ModerationDecision> {
  ensureNotCancelled(signal);
  if (!policy || !Array.isArray(policy.requiredCategories) ||
      policy.requiredCategories.length === 0 || !Array.isArray(detectors)) {
    return evaluateModerationPolicy(policy, []);
  }

  const findings: DetectorFinding[] = [];
  for (const category of policy.requiredCategories) {
    ensureNotCancelled(signal);
    const matches = detectors.filter((detector) => detector?.category === category);
    if (!canvas || canvas.width < 1 || canvas.height < 1 ||
        matches.length !== 1 || !matches[0].id ||
        typeof matches[0].id !== "string" || !matches[0].id.trim()) {
      findings.push({ category, detectorId: "missing-or-invalid-detector", status: "unverified" });
      continue;
    }

    const detector = matches[0];
    try {
      const result = await detector.classify(canvas, signal);
      ensureNotCancelled(signal);
      findings.push({
        category,
        detectorId: detector.id,
        status: result === "block" ? "flagged" :
          result === "allow" ? "clear" : "unverified",
      });
    } catch {
      ensureNotCancelled(signal);
      findings.push({ category, detectorId: detector.id, status: "unverified" });
    }
  }
  ensureNotCancelled(signal);
  return evaluateModerationPolicy(policy, findings);
}
