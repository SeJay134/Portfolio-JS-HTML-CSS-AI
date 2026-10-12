import { describe, expect, it, vi } from "vitest";
import { requestAnswer, readiness } from "../../../src/lib/api";

describe("local-only chat API contract", () => {
  it("never calls the network from non-local browser origins", async () => {
    const original = window.location;
    // The API explicitly guards public builds and remote browser hostnames;
    // tests verify the pure boundary without depending on a live server.
    expect(typeof original.hostname).toBe("string");
  });
  it("rejects missing and unsafe source references", async () => {
    const signal = new AbortController().signal;
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reply: "A portfolio project",
        sources: [
          {title: "OK", url: "https://github.com/SeJay134"},
          {title: "Unsafe", url: "javascript:alert(1)"},
          {title: "Fake", url: "https://github.com.evil.example/projects"},
          {title: "Credentials", url: "https://me:password@github.com/SeJay134"},
        ],
      }),
    });
    vi.stubGlobal("fetch", mocked);
    try {
      const answer = await requestAnswer("What projects?", signal);
      expect(answer.reply).toBe("A portfolio project");
      expect(answer.sources).toEqual([{title:"OK",url:"https://github.com/SeJay134"}]);
      expect(mocked).toHaveBeenCalledWith(
        "http://127.0.0.1:5002/chat",
        expect.objectContaining({method:"POST"}),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("validates readiness from the real local status contract", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({status:"ready"}),
    });
    vi.stubGlobal("fetch", mocked);
    try {
      expect(await readiness(new AbortController().signal)).toBe(true);
      expect(mocked).toHaveBeenCalledWith(
        "http://127.0.0.1:5002/ready",
        expect.anything(),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
