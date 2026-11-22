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
