import { describe, expect, it } from "vitest";
import { validSupabaseSettings } from "../../../src/lib/supabase";

describe("Supabase public client settings", () => {
  it.each([
    ["https://example.supabase.co", "sb_publishable_test", true],
    ["https://auth.example.com/", "sb_publishable_test", true],
    ["", "sb_publishable_test", false],
    ["http://example.supabase.co", "sb_publishable_test", false],
    ["https://user:pass@example.supabase.co/", "sb_publishable_test", false],
    ["https://example.supabase.co/auth", "sb_publishable_test", false],
    ["https://example.supabase.co/?bad=1", "sb_publishable_test", false],
    ["https://example.supabase.co", "", false],
    ["https://example.supabase.co", "sb_secret_test", false],
    ["https://example.supabase.co", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature", false],
    ["https://example.supabase.co", "unknown-key", false],
  ])("validates %s without publishing a secret", (url, key, expected) => {
    expect(validSupabaseSettings(url, key)).toBe(expected);
  });
});
