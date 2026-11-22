import { describe, expect, it, vi } from "vitest";
import {
  createGoreCandidateDetector, validateGoreProbabilities,
} from "../../../src/lib/moderation/detectors/goreDetector";
import { createExperimentalViolenceDetector } from "../../../src/lib/moderation/detectors/violenceDetector";
import { canvasToGoreTensor } from "../../../src/lib/moderation/detectors/localGoreCandidate";
import { benchmarkLocalDetector } from "../../../src/lib/moderation/benchmark";
import { moderateCanvas } from "../../../src/lib/moderation/moderationEngine";
import { ACTIVE_LOCAL_IMAGE_POLICY } from "../../../src/lib/moderation/policyEngine";
import type { ModerationPolicy } from "../../../src/lib/moderation/types";

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  return canvas;
}

describe("experimental, disabled-by-default gore candidate", () => {
  it("checks NSFL class 0, not NSFW class 1, with validated probabilities", async () => {
    expect(validateGoreProbabilities([0.7, 0.1, 0.2])).toBe(0.7);
    const block = createGoreCandidateDetector({ predict: async () => [0.9, 0.05, 0.05] });
    const allow = createGoreCandidateDetector({ predict: async () => [0.1, 0.85, 0.05] });
    expect(block.category).toBe("gore");
    expect(await block.classify(fakeCanvas())).toBe("block");
    expect(await allow.classify(fakeCanvas())).toBe("allow");
  });

  it("fails closed on malformed, incomplete, stale or unnormalized scores", async () => {
    for (const values of [[], [0.1], [0.1, 0.9],
      [0.1, 0.1, 0.1], [Number.NaN, 0, 1], [1.2, 0, -0.2]]) {
      const bad = createGoreCandidateDetector({ predict: async () => values });
      await expect(bad.classify(fakeCanvas())).rejects.toThrow();
      const policy: ModerationPolicy = { version: "research", requiredCategories: ["gore"] };
      expect((await moderateCanvas(fakeCanvas(), [bad], policy)).verdict).toBe("unverified");
    }
    expect(() => createGoreCandidateDetector({ predict: async () => [0, 0, 1] }, 1))
      .toThrow();
  });

  it("does not activate until the moderation policy explicitly requires gore", async () => {
    const gore = createGoreCandidateDetector({ predict: vi.fn(async () => [0.8, 0.1, 0.1]) });
    const adult = { id: "adult", category: "adult" as const, classify: vi.fn(async () => "allow" as const) };
    const decision = await moderateCanvas(fakeCanvas(), [adult, gore]);
    expect(decision.verdict).toBe("allow");
    expect(decision.findings).toHaveLength(1);
    expect(ACTIVE_LOCAL_IMAGE_POLICY.requiredCategories).toEqual(["adult"]);
    const policy: ModerationPolicy = { version: "research", requiredCategories: ["adult", "gore"] };
    expect((await moderateCanvas(fakeCanvas(), [adult, gore], policy)).verdict).toBe("block");
  });

  it("maintains fail-closed behavior for abort and predictor failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const gore = createGoreCandidateDetector({ predict: async () => [0.01, 0.01, 0.98] });
    await expect(gore.classify(fakeCanvas(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    const bad = createGoreCandidateDetector({ predict: async () => { throw new Error("GPU failed"); } });
    const policy: ModerationPolicy = { version: "research", requiredCategories: ["gore"] };
    expect((await moderateCanvas(fakeCanvas(), [bad], policy)).verdict).toBe("unverified");
  });

  it("converts RGBA to float32 RGB planar layout without normalizing twice", () => {
    const surface = fakeCanvas();
    const bytes = new Uint8ClampedArray(224 * 224 * 4);
    bytes.set([12, 34, 56, 255, 20, 30, 40, 255], 0);
    Object.defineProperty(surface, "getContext", {
      value: () => ({ getImageData: () => ({ data: bytes }) }),
    });
    const tensor = canvasToGoreTensor(surface);
    const plane = 224 * 224;
    expect(tensor.length).toBe(plane * 3);
    expect([tensor[0], tensor[plane], tensor[plane * 2]]).toEqual([12, 34, 56]);
    expect([tensor[1], tensor[plane + 1], tensor[plane * 2 + 1]]).toEqual([20, 30, 40]);
    surface.width = 10;
    expect(() => canvasToGoreTensor(surface)).toThrow();
  });

  it("has a separate experimental violence adapter, without enabling it", async () => {
    const detector = createExperimentalViolenceDetector({
      probabilityOfViolence: async () => 0.75,
    });
    expect(detector.category).toBe("graphic_violence");
    expect(await detector.classify(fakeCanvas())).toBe("block");
    const broken = createExperimentalViolenceDetector({
      probabilityOfViolence: async () => Infinity,
    });
    await expect(broken.classify(fakeCanvas())).rejects.toThrow();
  });

  it("benchmarks local latency without recording images or inventing accuracy", async () => {
    const predictor = vi.fn(async () => [0.1, 0, 0.9]);
    const detector = createGoreCandidateDetector({ predict: predictor });
    let tick = 0;
    const result = await benchmarkLocalDetector(detector, fakeCanvas(), 5, undefined, () => {
      tick += 5;
      return tick;
    });
    expect(result).toEqual({
      samples: 5, warmupRuns: 1, p50Ms: 5, p95Ms: 5, meanMs: 5, lastVerdict: "allow",
    });
    expect(predictor).toHaveBeenCalledTimes(6);
  });
});
