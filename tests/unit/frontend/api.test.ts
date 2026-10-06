import { it, expect, vi } from "vitest";
import { requestAnswer } from "../../../src/lib/api";
it("rejects HTTP errors and does not treat them as empty successful answers", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
        }),
      ),
  );
  await expect(
    requestAnswer("hello", new AbortController().signal),
  ).rejects.toThrow("Too many requests");
  vi.unstubAllGlobals();
});
it("renders only validated source URLs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "Hello",
          sources: [
            { title: "Unsafe", url: "javascript:alert(1)" },
            { title: "Fake", url: "https://github.com.evil.test/" },
            {
              title: "Project",
              url: "https://github.com/SeJay134/Portfolio-JS-HTML-CSS",
            },
          ],
        }),
      ),
    ),
  );
  const result = await requestAnswer("hello", new AbortController().signal);
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0].title).toBe("Project");
  vi.unstubAllGlobals();
});
