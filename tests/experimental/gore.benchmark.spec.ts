import { expect, test } from "@playwright/test";

test("experimental gore ONNX model loads and benchmarks locally with safe synthetic images", async ({ page }) => {
  test.skip(process.env.RUN_GORE_BENCHMARK !== "1", "Run only with prepared on-device research assets.");
  test.setTimeout(180_000);
  const requests: string[] = [];
  const posts: string[] = [];
  page.on("request", request => {
    if (request.url().includes("experimental-gore")) requests.push(request.url());
    if (request.method() === "POST") {
      posts.push(request.url());
    }
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { loadLocalGoreCandidate } = await import("/src/lib/moderation/detectors/localGoreCandidate.ts");
    const { benchmarkLocalDetector } = await import("/src/lib/moderation/benchmark.ts");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 224;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ccddee";
    ctx.fillRect(0, 0, 224, 224);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(30, 40, 110, 90);
    const loadStarted = performance.now();
    const detector = await loadLocalGoreCandidate();
    const loadMs = Math.round(performance.now() - loadStarted);
    const benchmark = await benchmarkLocalDetector(detector, canvas, 5);
    return { loadMs, ...benchmark };
  });
  console.log("EXPERIMENTAL_GORE_INFERENCE_BENCHMARK=" + JSON.stringify(result));
  expect(result.samples).toBe(5);
  expect(result.p50Ms).toBeGreaterThan(0);
  expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
  expect(result.loadMs).toBeGreaterThan(0);
  expect(["block", "allow"]).toContain(result.lastVerdict);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(posts).toEqual([]);
});

test("experimental quantized ViT runs locally as an uncalibrated violence probe", async ({ page }) => {
  test.skip(process.env.RUN_VIOLENCE_BENCHMARK !== "1", "Requires opt-in prepared ViT research weights.");
  test.setTimeout(240_000);
  const posts: string[] = [];
  const assets: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST") posts.push(request.url());
    if (request.url().includes("experimental-gore")) assets.push(request.url());
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { loadLocalViolenceProbe } = await import("/src/lib/moderation/detectors/localViolenceCandidate.ts");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 224;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ccddee";
    ctx.fillRect(0, 0, 224, 224);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(30, 40, 110, 90);
    const loadStarted = performance.now();
    const probe = await loadLocalViolenceProbe();
    const loadMs = Math.round(performance.now() - loadStarted);
    // No interpretation of class index until model labels are verified.
    await probe.predictLogits(canvas);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const logits = await probe.predictLogits(canvas);
      if (logits.length !== 2 || logits.some(value => !Number.isFinite(value))) {
        throw new Error("ViT returned invalid logits");
      }
      times.push(performance.now() - start);
    }
    times.sort((a,b)=>a-b);
    const round = (x:number) => Math.round(x*100)/100;
    return {
      loadMs, samples:times.length, warmupRuns:1,
      p50Ms:round(times[2]), p95Ms:round(times[4]),
      meanMs:round(times.reduce((a,b)=>a+b,0)/times.length),
      labelMappingValidated:false,
    };
  });
  console.log("EXPERIMENTAL_VIOLENCE_VIT_BENCHMARK=" + JSON.stringify(result));
  expect(result.samples).toBe(5);
  expect(result.loadMs).toBeGreaterThan(0);
  expect(result.p50Ms).toBeGreaterThan(0);
  expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
  expect(result.labelMappingValidated).toBe(false);
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(posts).toEqual([]);
});
