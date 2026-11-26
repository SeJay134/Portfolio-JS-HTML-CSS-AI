// Disposable integration harness. Credentials passed via stdin, never printed.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createLocalPublicMediaHandler } from "../../../server/localPublicMedia.js";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { key, token, assetId, expectedStatus, sha256 } = JSON.parse(Buffer.concat(chunks));
let issued = 0;
const handler = createLocalPublicMediaHandler({ origin: "http://127.0.0.1:54321", publishableKey: key,
  capabilityFor: async id => { assert.equal(id, assetId); issued++; return token; } });
const server = createServer(handler);
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const path = "/blog/media/" + assetId + ".jpg";
  const opts = { redirect: "error", signal: AbortSignal.timeout(15000) };
  for (const invalid of [path + "?token=bad", path + "/", "/blog/media/not-an-id.jpg"]) {
    const response = await fetch(origin + invalid, opts);
    assert.equal(response.status, 404); await response.arrayBuffer();
  }
  const denied = await fetch(origin + path, { ...opts, method: "POST" });
  assert.equal(denied.status, 405); await denied.arrayBuffer();
  assert.equal(issued, 0);
  // Browser-supplied token, cookie and range are ignored. Only scoped server token is used.
  const response = await fetch(origin + path, { ...opts, headers: {
    Authorization: "Bearer untrusted", Cookie: "session=untrusted", Range: "bytes=0-1" } });
  assert.equal(response.status, expectedStatus);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = Buffer.from(await response.arrayBuffer());
  if (expectedStatus === 200) {
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(createHash("sha256").update(body).digest("hex"), sha256);
  } else assert.equal(body.toString(), "Media not found.");
  assert.equal(issued, 1);
  console.log("Local public media HTTP proof passed");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
