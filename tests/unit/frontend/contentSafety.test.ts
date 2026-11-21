import { describe, expect, it } from "vitest";
import {
  containsAdultContent, MAX_BATCH_FILES, MAX_INPUT_IMAGE_BYTES,
  screenImage, SafetyCheckError, type SafetyPrediction,
} from "../../../src/lib/contentSafety";
import { isImageFile } from "../../../src/lib/photoCompressor";

function predictions(changes: Partial<Record<string, number>> = {}): SafetyPrediction[] {
  return ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"].map((className) => ({
    className,
    probability: changes[className] ??
      (className === "Neutral" ? 1 : 0),
  }));
}

describe("private adult-content policy screening", () => {
  it("allows clearly neutral and nonsexual drawing predictions", () => {
    expect(containsAdultContent(predictions())).toBe(false);
    expect(containsAdultContent(predictions({ Neutral: 0, Drawing: 1 }))).toBe(false);
  });

  it("blocks explicit and strongly suggestive predictions", () => {
    expect(containsAdultContent(predictions({ Neutral: 0.75, Porn: 0.25 }))).toBe(true);
    expect(containsAdultContent(predictions({ Neutral: 0.78, Hentai: 0.22 }))).toBe(true);
    expect(containsAdultContent(predictions({ Neutral: 0.35, Sexy: 0.65 }))).toBe(true);
    expect(containsAdultContent(predictions({
      Neutral: 0.4, Porn: 0.19, Hentai: 0.19, Sexy: 0.22,
    }))).toBe(true);
  });

  it("fails closed on incomplete, misleading or corrupt model results", () => {
    expect(() => containsAdultContent([])).toThrow(SafetyCheckError);
    expect(() => containsAdultContent(predictions().slice(0, 4))).toThrow(SafetyCheckError);
    expect(() => containsAdultContent(predictions({ Neutral: Number.NaN }))).toThrow(SafetyCheckError);
    expect(() => containsAdultContent(predictions({ Neutral: 0.5 }))).toThrow(SafetyCheckError);
    expect(() => containsAdultContent(predictions({ Neutral: -1 }))).toThrow(SafetyCheckError);
    const fake = predictions();
    fake[0] = { className: "Unknown", probability: 0 };
    expect(() => containsAdultContent(fake)).toThrow(SafetyCheckError);
    const duplicate = predictions();
    duplicate[0] = { className: "Neutral", probability: 0 };
    expect(() => containsAdultContent(duplicate)).toThrow(SafetyCheckError);
  });

  it("does not send unsupported or oversized files to the model", async () => {
    const model = { classify: () => {
      throw new Error("Must not be called");
    } };
    const svg = new File(["<svg></svg>"], "adult.svg", { type: "image/svg+xml" });
    expect(isImageFile(svg)).toBe(false);
    await expect(screenImage(svg, model)).rejects.toThrow(SafetyCheckError);
    const large = new File(["jpg"], "test.jpg", { type: "image/jpeg" });
    Object.defineProperty(large, "size", { value: MAX_INPUT_IMAGE_BYTES + 1 });
    await expect(screenImage(large, model)).rejects.toThrow(/oversized/);
    expect(MAX_BATCH_FILES).toBeGreaterThanOrEqual(100);
  });
});
