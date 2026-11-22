import { describe, expect, it } from "vitest";
import { validSupabaseSettings } from "../../../src/lib/supabase";

describe("Supabase public client settings", () => {
  it.each([
    ["https://example.supabase.co", "sb_publishable_test", true],
    ["https://auth.example.com/", "public-key", true],
    ["", "public-key", false],
    ["http://example.supabase.co", "public-key", false],
    ["https://user:pass@example.supabase.co/", "public-key", false],
    ["https://example.supabase.co/auth", "public-key", false],
    ["https://example.supabase.co/?bad=1", "public-key", false],
    ["https://example.supabase.co", "", false],
  ])("validates %s without publishing a secret", (url, key, expected) => {
    expect(validSupabaseSettings(url, key)).toBe(expected);
  });
});
