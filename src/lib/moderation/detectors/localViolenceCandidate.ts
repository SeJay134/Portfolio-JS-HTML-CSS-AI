import { ensureNotCancelled, SafetyCheckError } from "../types";
import { canvasToGoreTensor, loadLocalRuntime, sameOriginAsset } from "./localGoreCandidate";

/**
 * Research-only ONNX ViT probe. Class-index-to-violence mapping is NOT
 * independently verified, so the output is never used for safety decisions.
 * This model is ~86.8 MB and is not suitable for untested iPhone deployment.
 */
const PATH = "/experimental-gore/violence-vit-int8.onnx";
const EXPECTED_SHA256 =
  "90f5f918763d0b2d74a1b1798a428065bee0be9862110d8a86048806f3f1f361";

export function canvasToViTTensor(canvas: HTMLCanvasElement): Float32Array {
  const values = canvasToGoreTensor(canvas);
  // Model preprocessor_config.json: rescale 1/255, normalize mean/std=0.5.
  // Expected NCHW float32 in [-1, 1].
  for (let i = 0; i < values.length; i++) {
    values[i] = values[i] / 127.5 - 1;
  }
  return values;
}

export function validateViTLogits(data: ArrayLike<number>): [number, number] {
  if (!data || data.length !== 2) {
    throw new SafetyCheckError("Unexpected experimental violence output shape.");
  }
  const first = Number(data[0]);
  const second = Number(data[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new SafetyCheckError("Invalid experimental violence logits.");
  }
  return [first, second];
}

export interface LocalViolenceProbe {
  predictLogits(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<[number, number]>;
}

let probePromise: Promise<LocalViolenceProbe> | undefined;
export async function loadLocalViolenceProbe(signal?: AbortSignal): Promise<LocalViolenceProbe> {
  ensureNotCancelled(signal);
  if (!probePromise) {
    probePromise = (async () => {
      const ort = await loadLocalRuntime();
      const response = await fetch(sameOriginAsset(PATH), { credentials:"omit", redirect:"error" });
      if (!response.ok || !response.url.startsWith(sameOriginAsset("/experimental-gore/"))) {
        throw new SafetyCheckError("Local ViT violence model unavailable.");
      }
      const length = Number(response.headers.get("content-length"));
      if (length > 105_000_000) throw new SafetyCheckError("Unexpected ViT model size.");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 80_000_000 || buffer.byteLength > 105_000_000) {
        throw new SafetyCheckError("Unexpected ViT model size.");
      }
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, "0")).join("");
      if (sha256 !== EXPECTED_SHA256) {
        throw new SafetyCheckError("Local ViT model integrity check failed.");
      }
      const session = await ort.InferenceSession.create(new Uint8Array(buffer), {
        executionProviders: ["wasm"],
      });
      if (session.inputNames.length !== 1 || session.inputNames[0] !== "pixel_values" ||
          session.outputNames.length !== 1) {
        throw new SafetyCheckError("Unexpected ViT model input/output names.");
      }
      const input = session.inputNames[0];
      const output = session.outputNames[0];
      return {
        async predictLogits(canvas: HTMLCanvasElement, runSignal?: AbortSignal) {
          ensureNotCancelled(runSignal);
          const rgb = canvasToViTTensor(canvas);
          const tensor = new ort.Tensor("float32", rgb, [1,3,224,224]);
          const result = await session.run({[input]:tensor});
          ensureNotCancelled(runSignal);
          return validateViTLogits(result[output]?.data);
        },
      };
    })().catch(error => { probePromise = undefined; throw error; });
  }
  const probe = await probePromise;
  ensureNotCancelled(signal);
  return probe;
}
