import { expect, it } from "vitest";
import { assertPublicEnvironment } from "../../../scripts/public-env";
it("allows public rollout flags and publishable key", () => expect(() => assertPublicEnvironment({VITE_ENABLE_LIVE_BLOG:"false",VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"})).not.toThrow());
it.each([
  {VITE_SUPABASE_PUBLISHABLE_KEY:"sb_secret_fixture"},
  {VITE_UNEXPECTED:"sb_secret_fixture"},
  {VITE_GOOGLE_CLIENT_SECRET:"fixture"},
  {VITE_SUPABASE_SERVICE_ROLE_KEY:"fixture"},
  {VITE_UNEXPECTED:"e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"},
  {VITE_SUPABASE_PUBLISHABLE_KEY:"unknown"},
])("rejects misconfigured browser credentials without echoing values", (env) => {
  expect(() => assertPublicEnvironment(env)).toThrow();
  try { assertPublicEnvironment(env); } catch (error) {
    for (const value of Object.values(env)) expect(String(error)).not.toContain(value);
  }
});
