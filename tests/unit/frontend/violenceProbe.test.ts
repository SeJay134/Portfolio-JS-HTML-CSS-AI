import { describe, expect, it } from "vitest";
import { canvasToViTTensor, validateViTLogits } from "../../../src/lib/moderation/detectors/localViolenceCandidate";

describe("research-only general-violence ViT probe", () => {
  it("normalizes RGB 0..255 to NCHW [-1..1] as specified by the model", () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 224;
    const bytes = new Uint8ClampedArray(224 * 224 * 4);
    bytes.set([0, 127, 255, 255], 0);
    Object.defineProperty(canvas,"getContext",{value:()=>({getImageData:()=>({data:bytes})})});
    const tensor = canvasToViTTensor(canvas);
    const pixels = 224 * 224;
    expect(tensor[0]).toBe(-1);
    expect(tensor[pixels]).toBeCloseTo(127 / 127.5 - 1);
    expect(tensor[pixels * 2]).toBe(1);
  });

  it("validates logits but does not assign unverified class labels", () => {
    expect(validateViTLogits([-2,3])).toEqual([-2,3]);
    expect(() => validateViTLogits([])).toThrow();
    expect(() => validateViTLogits([1,2,3])).toThrow();
    expect(() => validateViTLogits([1,Infinity])).toThrow();
  });
});
