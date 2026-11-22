import {
  MODERATION_CATEGORIES,
  type DetectorFinding,
  type ModerationDecision,
  type ModerationPolicy,
} from "./types";

/**
 * The only enabled classifier in PR A remains NSFWJS adult screening.
 * Later PRs must explicitly add and validate each new mandatory detector.
 */
export const ACTIVE_LOCAL_IMAGE_POLICY: ModerationPolicy = Object.freeze({
  version: "adult-only-v1",
  requiredCategories: Object.freeze(["adult"] as const),
});

const validCategories = new Set<string>(MODERATION_CATEGORIES);
const validStatuses = new Set(["clear", "flagged", "unverified"]);

/**
 * Do not infer safety from missing, duplicate or malformed detector results.
 * A confirmed flag blocks even when another required check is unavailable.
 */
export function evaluateModerationPolicy(
  policy: ModerationPolicy,
  findings: readonly DetectorFinding[],
): ModerationDecision {
  const fallback = (): ModerationDecision => ({
    verdict: "unverified",
    policyVersion: typeof policy?.version === "string" ? policy.version : "unknown",
    findings: Array.isArray(findings) ? [...findings] : [],
  });

  if (!policy || typeof policy.version !== "string" || !policy.version.trim() ||
      !Array.isArray(policy.requiredCategories) || !policy.requiredCategories.length ||
      !Array.isArray(findings)) {
    return fallback();
  }
  const required = new Set(policy.requiredCategories);
  if (required.size !== policy.requiredCategories.length ||
      policy.requiredCategories.some((name) => !validCategories.has(name))) {
    return fallback();
  }

  const seen = new Set<string>();
  for (const item of findings) {
    if (!item || !required.has(item.category) || seen.has(item.category) ||
        typeof item.detectorId !== "string" || !item.detectorId.trim() ||
        !validStatuses.has(item.status)) {
      return fallback();
    }
    seen.add(item.category);
  }
  if (findings.some((item) => item.status === "flagged")) {
    return { verdict: "block", policyVersion: policy.version, findings: [...findings] };
  }
  if (seen.size !== required.size || findings.some((item) => item.status !== "clear")) {
    return fallback();
  }
  return { verdict: "allow", policyVersion: policy.version, findings: [...findings] };
}
