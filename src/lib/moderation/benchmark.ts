import { ensureNotCancelled, type ModerationDetector, type DetectorVerdict } from "./types";

export type LocalModelBenchmark = {
  samples: number;
  warmupRuns: number;
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
  lastVerdict: DetectorVerdict;
};

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

/**
 * Optional device-local inference benchmark. No photos or scores are logged.
 * Use synthetic/non-sensitive canvases. Does NOT measure classification accuracy.
 */
export async function benchmarkLocalDetector(
  detector: ModerationDetector,
  canvas: HTMLCanvasElement,
  repetitions = 5,
  signal?: AbortSignal,
  clock: () => number = () => performance.now(),
): Promise<LocalModelBenchmark> {
  if (!Number.isSafeInteger(repetitions) || repetitions < 2 || repetitions > 100) {
    throw new Error("Benchmark repetitions must be between 2 and 100.");
  }
  ensureNotCancelled(signal);
  await detector.classify(canvas, signal); // warmup, not included in timings
  const durations: number[] = [];
  let lastVerdict: DetectorVerdict = "allow";
  for (let i = 0; i < repetitions; i++) {
    ensureNotCancelled(signal);
    const start = clock();
    lastVerdict = await detector.classify(canvas, signal);
    const elapsed = clock() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new Error("Invalid benchmark clock.");
    }
    durations.push(elapsed);
  }
  durations.sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    samples: repetitions,
    warmupRuns: 1,
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    meanMs: round(durations.reduce((a, b) => a + b, 0) / repetitions),
    lastVerdict,
  };
}
