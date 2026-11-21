import { describe, expect, it, vi } from "vitest";
import {
  AUTH_RETURN_PATH_KEY,
  consumeReturnPath,
  rememberReturnPath,
  safeReturnPath,
} from "../../../src/auth/returnPath";

describe("OAuth return path", () => {
  it.each([
    ["/", "/"],
    ["/tools/photo-compressor", "/tools/photo-compressor/"],
    ["/tools/photo-compressor/", "/tools/photo-compressor/"],
    ["/tools/file-converter/", "/tools/file-converter/"],
    ["https://attacker.example/", "/"],
    ["//attacker.example", "/"],
    ["/\\attacker.example", "/"],
    ["/tools/file-converter/?redirect=https://attacker.example", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("normalizes safe path %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it("remembers, consumes and clears the return path", () => {
    const stored = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => stored.set(key, value),
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => { stored.delete(key); },
    };
    rememberReturnPath("/tools/photo-compressor/", storage);
    expect(stored.get(AUTH_RETURN_PATH_KEY)).toBe("/tools/photo-compressor/");
    expect(consumeReturnPath(storage)).toBe("/tools/photo-compressor/");
    expect(consumeReturnPath(storage)).toBe("/");
  });

  it("fails safely when storage is disabled", () => {
    const storage = {
      setItem: vi.fn(() => { throw new Error("storage disabled"); }),
      getItem: vi.fn(() => { throw new Error("storage disabled"); }),
      removeItem: vi.fn(),
    };
    expect(() => rememberReturnPath("/tools/file-converter/", storage)).not.toThrow();
    expect(consumeReturnPath(storage)).toBe("/");
  });
});
