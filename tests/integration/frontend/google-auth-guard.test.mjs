import assert from "node:assert/strict";
import process from "node:process";
import { afterEach, test } from "node:test";
import { verifyGoogleUser, googleAuthRequired } from "../../../server/authGuard.js";

const originalFetch = globalThis.fetch;
const vars = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "REQUIRE_GOOGLE_AUTH", "VITE_ENABLE_GOOGLE_AUTH"];
const originalEnv = Object.fromEntries(vars.map(key => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const configure = () => {
  process.env.SUPABASE_URL = "https://sample.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
};
const bearer = { authorization: "Bearer test.jwt.token.with-a-long-value" };
const response = (value, ok = true) => ({ ok, json: async () => value });

test("authentication defaults off until explicitly enabled", () => {
  delete process.env.REQUIRE_GOOGLE_AUTH;
  delete process.env.VITE_ENABLE_GOOGLE_AUTH;
  assert.equal(googleAuthRequired(), false);
  process.env.REQUIRE_GOOGLE_AUTH = "true";
  assert.equal(googleAuthRequired(), true);
});

test("rejects missing bearer without network call", async () => {
  configure();
  globalThis.fetch = () => { throw new Error("must not fetch"); };
  assert.equal((await verifyGoogleUser({headers:{}})).status, 401);
});

test("fails closed when Supabase configuration is absent", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 503);
});

test("accepts a verified active Google user", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, bearer.authorization);
    assert.ok(url.startsWith("https://sample.supabase.co/"));
    if (calls === 1) return response({
      id: "test-user-id", email: "google-user@example.org",
      app_metadata: { provider: "google", providers: ["google"] },
    });
    return response([{status:"active"}]);
  };
  const result = await verifyGoogleUser({headers:bearer});
  assert.equal(result.ok, true);
  assert.deepEqual(result.user, {id:"test-user-id",email:"google-user@example.org"});
  assert.equal(calls, 2);
});

test("rejects blocked profiles and non-Google providers", async () => {
  configure();
  globalThis.fetch = async url => url.endsWith("/auth/v1/user") ?
    response({id:"test-id",app_metadata:{provider:"google",providers:["google"]}}) :
    response([{status:"blocked"}]);
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 403);
  globalThis.fetch = async () => response({
    id:"test-id", app_metadata:{provider:"email",providers:["email"]}
  });
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 403);
});

test("rejects linked non-Google accounts even if they have Google identity", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({
      id:"test-id", app_metadata:{provider:"email",providers:["email","google"]}
    });
  };
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 403);
  assert.equal(calls, 1);
  globalThis.fetch = async () => response({
    id:"test-id", app_metadata:{provider:"google",providers:["google","email"]}
  });
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 403);
});

test("does not leak errors from Supabase", async () => {
  configure();
  globalThis.fetch = async () => { throw new Error("private auth secret"); };
  const result = await verifyGoogleUser({headers:bearer});
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result).includes("private auth secret"));
});

test("rejects a privileged key instead of using it for public authentication", async () => {
  configure();
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_fixture";
  globalThis.fetch = () => { throw new Error("must not fetch"); };
  assert.equal((await verifyGoogleUser({headers:bearer})).status, 503);
});
