import { describe, expect, it, vi } from "vitest";
import { moderateCanvas } from "../../../src/lib/moderation/moderationEngine";
import { evaluateModerationPolicy, ACTIVE_LOCAL_IMAGE_POLICY } from "../../../src/lib/moderation/policyEngine";
import {
  type DetectorFinding, type ModerationDetector, type ModerationPolicy,
} from "../../../src/lib/moderation/types";
import { createAdultDetector } from "../../../src/lib/moderation/detectors/adultDetector";

const canvas = () => {
  const surface = document.createElement("canvas");
  surface.width = 224;
  surface.height = 224;
  return surface;
};

function detector(
  category: ModerationDetector["category"],
  outcome: "allow" | "block" | "throw",
): ModerationDetector {
  return {
    id: "fake-" + category,
    category,
    classify: vi.fn(async () => {
      if (outcome === "throw") throw new Error("Model unavailable");
      return outcome;
    }),
  };
}

describe("local moderation policy", () => {
  it("enables only the existing adult category in production", () => {
    expect(ACTIVE_LOCAL_IMAGE_POLICY.requiredCategories).toEqual(["adult"]);
    expect(ACTIVE_LOCAL_IMAGE_POLICY.version).toBe("adult-only-v1");
  });

  it("allows only when all mandatory checks are clear", () => {
    const policy: ModerationPolicy = {
      version: "future-test-v1",
      requiredCategories: ["adult", "graphic_violence"],
    };
    const safe: DetectorFinding[] = [
      { category: "adult", detectorId: "test-a", status: "clear" },
      { category: "graphic_violence", detectorId: "test-v", status: "clear" },
    ];
    expect(evaluateModerationPolicy(policy, safe).verdict).toBe("allow");
    expect(evaluateModerationPolicy(policy, safe.slice(0, 1)).verdict).toBe("unverified");
    expect(evaluateModerationPolicy(policy, [
      safe[0], { ...safe[1], status: "unverified" },
    ]).verdict).toBe("unverified");
  });

  it("blocks an explicit flag even if another required check is unavailable", () => {
    const policy: ModerationPolicy = {
      version: "future-test-v1",
      requiredCategories: ["adult", "self_harm"],
    };
    expect(evaluateModerationPolicy(policy, [
      { category: "adult", detectorId: "a", status: "flagged" },
      { category: "self_harm", detectorId: "s", status: "unverified" },
    ]).verdict).toBe("block");
  });

  it("does not allow duplicate categories, unknown outcomes or invalid policy", () => {
    expect(evaluateModerationPolicy(ACTIVE_LOCAL_IMAGE_POLICY, [
      { category: "adult", detectorId: "a", status: "clear" },
      { category: "adult", detectorId: "b", status: "clear" },
    ]).verdict).toBe("unverified");
    expect(evaluateModerationPolicy(ACTIVE_LOCAL_IMAGE_POLICY, [
      { category: "adult", detectorId: "a", status: "approved" as DetectorFinding["status"] },
    ]).verdict).toBe("unverified");
    expect(evaluateModerationPolicy({
      version: "bad", requiredCategories: ["adult", "adult"],
    }, [
      { category: "adult", detectorId: "a", status: "clear" },
    ]).verdict).toBe("unverified");
  });
});

describe("moderation engine", () => {
  it("returns structured allow and block results with provenance", async () => {
    const allowed = await moderateCanvas(canvas(), [detector("adult", "allow")]);
    expect(allowed).toEqual({
      verdict: "allow", policyVersion: "adult-only-v1",
      findings: [{ category: "adult", detectorId: "fake-adult", status: "clear" }],
    });
    const blocked = await moderateCanvas(canvas(), [detector("adult", "block")]);
    expect(blocked.verdict).toBe("block");
    expect(blocked.findings[0].status).toBe("flagged");
  });

  it("fails closed for missing, duplicate, invalid or throwing detectors", async () => {
    expect((await moderateCanvas(canvas(), [])).verdict).toBe("unverified");
    expect((await moderateCanvas(canvas(), [
      detector("adult", "allow"), detector("adult", "allow"),
    ])).toMatchObject({ verdict: "unverified" });
    expect((await moderateCanvas(canvas(), [detector("adult", "throw")])).verdict)
      .toBe("unverified");
    const invalid = detector("adult", "allow");
    invalid.classify = vi.fn(async () => "bogus" as "allow");
    expect((await moderateCanvas(canvas(), [invalid])).verdict).toBe("unverified");
    const empty = document.createElement("canvas");
    empty.width = 0;
    expect((await moderateCanvas(empty, [detector("adult", "allow")])).verdict)
      .toBe("unverified");
  });

  it("does not run a future category until policy explicitly requires it", async () => {
    const future = detector("graphic_violence", "block");
    const result = await moderateCanvas(canvas(), [detector("adult", "allow"), future]);
    expect(result.verdict).toBe("allow");
    expect(future.classify).not.toHaveBeenCalled();
  });

  it("requires future detectors when explicitly configured", async () => {
    const policy: ModerationPolicy = {
      version: "future-test-v1",
      requiredCategories: ["adult", "graphic_violence"],
    };
    const result = await moderateCanvas(canvas(), [detector("adult", "allow")], policy);
    expect(result.verdict).toBe("unverified");
    expect(result.findings.map((finding) => finding.status)).toEqual(["clear", "unverified"]);
  });

  it("aborts without continuing to another detector", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(moderateCanvas(canvas(), [detector("adult", "allow")],
      ACTIVE_LOCAL_IMAGE_POLICY, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("converts malformed model predictions into unverified, not allow", async () => {
    const model = { classify: vi.fn(async () => [
      { className: "Neutral", probability: 1 },
    ]) };
    const result = await moderateCanvas(canvas(), [createAdultDetector(model)]);
    expect(result.verdict).toBe("unverified");
    expect(model.classify).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 5);
  });
});
