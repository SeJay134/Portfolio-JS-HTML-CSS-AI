import { describe, expect, it } from "vitest";
import { isStagingConnection, STAGING_MODE, STAGING_APP_ORIGIN, STAGING_API_ORIGIN } from "../../../src/lib/oauthStaging";
import { assertOAuthStaging } from "../../../scripts/oauth-staging-config";

const env = {
  VITE_SUPABASE_URL: STAGING_API_ORIGIN,
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  VITE_ENABLE_GOOGLE_AUTH: "true",
  VITE_ENABLE_BLOG_ADMIN: "true",
  VITE_ENABLE_LIVE_BLOG: "true",
};
describe("local OAuth staging isolation", () => {
  it("allows exactly the dedicated loopback origins", () => {
    expect(isStagingConnection(STAGING_MODE, STAGING_APP_ORIGIN, STAGING_API_ORIGIN)).toBe(true);
    expect(isStagingConnection(STAGING_MODE, STAGING_APP_ORIGIN, STAGING_API_ORIGIN + "/")).toBe(true);
  });
  it.each([
    ["production", STAGING_APP_ORIGIN, STAGING_API_ORIGIN],
    [STAGING_MODE, "https://portfolio.example", STAGING_API_ORIGIN],
    [STAGING_MODE, "http://localhost:5511", STAGING_API_ORIGIN],
    [STAGING_MODE, STAGING_APP_ORIGIN, "https://production.supabase.co"],
    [STAGING_MODE, STAGING_APP_ORIGIN, "http://127.0.0.1:54321.evil.example"],
    [STAGING_MODE, STAGING_APP_ORIGIN, STAGING_API_ORIGIN + "/rest/v1"],
    [STAGING_MODE, STAGING_APP_ORIGIN, STAGING_API_ORIGIN + "?x=1"],
  ])("rejects mode/origin mismatch %s %s %s", (mode, origin, url) => {
    expect(isStagingConnection(mode, origin, url)).toBe(false);
  });
  it("allows only the configured local dev launcher", () => {
    expect(() => assertOAuthStaging("serve", STAGING_MODE, env)).not.toThrow();
    expect(() => assertOAuthStaging("build", STAGING_MODE, env)).toThrow();
    expect(() => assertOAuthStaging("serve", STAGING_MODE, {...env, VERCEL:"1"})).toThrow();
    expect(() => assertOAuthStaging("serve", STAGING_MODE, {...env, CI:"true"})).toThrow();
    expect(() => assertOAuthStaging("serve", STAGING_MODE, {...env, VITE_SUPABASE_URL:"https://production.supabase.co"})).toThrow();
    expect(() => assertOAuthStaging("serve", STAGING_MODE, {...env, VITE_SUPABASE_PUBLISHABLE_KEY:"sb_secret_fixture"})).toThrow();
    expect(() => assertOAuthStaging("serve", STAGING_MODE, {...env, VITE_ENABLE_BLOG_ADMIN:"false"})).toThrow();
    expect(() => assertOAuthStaging("build", "production", {})).not.toThrow();
  });
});
