import { createGoreCandidateDetector } from "./goreDetector";
import {
  ensureNotCancelled, SafetyCheckError, type ModerationDetector,
} from "../types";

/**
 * A working, opt-in on-device ONNX research adapter.
 *
 * Assets must first be installed under /experimental-gore/ by the pinned
 * prepare script. Both JS runtime and model are loaded from THIS origin.
 * No selected image or tensor is sent to a server. Production policy does
 * not enable this candidate until independent validation is completed.
 */
const ROOT = "/experimental-gore/";
const MODEL_PATH = ROOT + "image-safety-classifier-xs.onnx";
const RUNTIME_PATH = ROOT + "ort.wasm.min.js";
const EXPECTED_MODEL_SHA256 =
  "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689";

type OrtTensor = { readonly data: ArrayLike<number> };
type OrtSession = {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};
export type OrtRuntime = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(model: Uint8Array, opts: { executionProviders: string[] }): Promise<OrtSession>;
  };
};

declare global {
  interface Window {
    ort?: OrtRuntime;
  }
}

let runtimePromise: Promise<OrtRuntime> | undefined;
let detectorPromise: Promise<ModerationDetector> | undefined;

export function sameOriginAsset(path: string): string {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(ROOT)) {
    throw new SafetyCheckError("A local moderation asset path is invalid.");
  }
  return url.href;
}

export async function loadLocalRuntime(): Promise<OrtRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!window.ort) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = sameOriginAsset(RUNTIME_PATH);
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new SafetyCheckError("Local ONNX runtime unavailable."));
          document.head.appendChild(script);
        });
      }
      const ort = window.ort;
      if (!ort || !ort.InferenceSession || !ort.Tensor || !ort.env?.wasm) {
        throw new SafetyCheckError("Local ONNX runtime unavailable.");
      }
      ort.env.wasm.numThreads = 1; // compatible with iOS Safari lacking cross-origin isolation
      ort.env.wasm.wasmPaths = sameOriginAsset(ROOT);
      return ort;
    })().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

async function loadVerifiedModelBytes(): Promise<Uint8Array> {
  const response = await fetch(sameOriginAsset(MODEL_PATH), {
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok || !response.url.startsWith(sameOriginAsset(ROOT))) {
    throw new SafetyCheckError("Local gore model unavailable.");
  }
  const advertisedSize = Number(response.headers.get("content-length"));
  if (advertisedSize > 18_000_000) {
    throw new SafetyCheckError("Unexpected local model size.");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 10_000_000 || buffer.byteLength > 18_000_000) {
    throw new SafetyCheckError("Unexpected local model size.");
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  if (sha256 !== EXPECTED_MODEL_SHA256) {
    throw new SafetyCheckError("Local gore model integrity check failed.");
  }
  return new Uint8Array(buffer);
}

/**
 * NCHW, float32 RGB [0..255] per the candidate model card.
 * Normalization and softmax are already included in the ONNX graph.
 */
export function canvasToGoreTensor(canvas: HTMLCanvasElement): Float32Array {
  if (canvas.width !== 224 || canvas.height !== 224) {
    throw new SafetyCheckError("Experimental gore input must be 224x224.");
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new SafetyCheckError();
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, 224, 224).data;
  } catch {
    throw new SafetyCheckError("Could not read image pixels for local screening.");
  }
  const planeSize = 224 * 224;
  const tensor = new Float32Array(planeSize * 3);
  for (let i = 0; i < planeSize; i++) {
    const pixel = i * 4;
    tensor[i] = pixels[pixel];
    tensor[planeSize + i] = pixels[pixel + 1];
    tensor[planeSize * 2 + i] = pixels[pixel + 2];
  }
  return tensor;
}

export async function loadLocalGoreCandidate(
  signal?: AbortSignal,
): Promise<ModerationDetector> {
  ensureNotCancelled(signal);
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const ort = await loadLocalRuntime();
      const modelBytes = await loadVerifiedModelBytes();
      const session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: ["wasm"],
      });
      if (session.inputNames.length !== 1 ||
          session.inputNames[0] !== "image" ||
          session.outputNames.length !== 1) {
        throw new SafetyCheckError("Unexpected experimental ONNX model structure.");
      }
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];

      return createGoreCandidateDetector({
        async predict(canvas, runSignal) {
          ensureNotCancelled(runSignal);
          const rgb = canvasToGoreTensor(canvas);
          const input = new ort.Tensor("float32", rgb, [1, 3, 224, 224]);
          const outputs = await session.run({ [inputName]: input });
          ensureNotCancelled(runSignal);
          const values = outputs[outputName]?.data;
          if (!values || values.length !== 3) {
            throw new SafetyCheckError("Unexpected experimental ONNX output.");
          }
          return Array.from(values);
        },
      });
    })().catch((error) => {
      detectorPromise = undefined;
      throw error;
    });
  }
  const result = await detectorPromise;
  ensureNotCancelled(signal);
  return result;
}
