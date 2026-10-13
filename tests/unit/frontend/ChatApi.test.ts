import { describe, expect, it, vi } from "vitest";
import { canUseLocalChat, selectChatApi, requestAnswer, readiness } from "../../../src/lib/api";

describe("local-only chat API contract", () => {
  it("blocks production builds and non-loopback browser origins", () => {
    expect(canUseLocalChat("localhost", true)).toBe(true);
    expect(canUseLocalChat("127.0.0.1", true)).toBe(true);
    expect(canUseLocalChat("sergei-luna.vercel.app", true)).toBe(false);
    expect(canUseLocalChat("localhost", false)).toBe(false);
    expect(canUseLocalChat("127.0.0.1", false)).toBe(false);
    expect(canUseLocalChat("localhost.evil.example", true)).toBe(false);
  });
  it("never sends production requests to loopback or an arbitrary origin", () => {
    expect(selectChatApi("localhost", "http:", true, false))
      .toBe("http://127.0.0.1:5002");
    expect(selectChatApi("sergei-luna.vercel.app", "https:", false, false))
      .toBeNull();
    expect(selectChatApi("sergei-luna.vercel.app", "https:", false, true))
      .toBe("/api");
    expect(selectChatApi("sergei-luna.vercel.app", "http:", false, true))
      .toBeNull();
    expect(selectChatApi("attacker.example", "https:", true, true))
      .toBeNull();
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
  it("shows a recoverable message for an unavailable or timed-out local model", async () => {
    const mocked = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Assistant is unavailable.", request_id: "test" }),
    });
    vi.stubGlobal("fetch", mocked);
    try {
      await expect(requestAnswer("What projects?", new AbortController().signal))
        .rejects.toThrow("The assistant is unavailable or taking too long.");
      expect(mocked).toHaveBeenCalledTimes(1);
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
