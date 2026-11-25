import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { deliverPublicMedia } from "../../../server/publicMedia.js";

const id = "82000000-0000-0000-0000-000000000001";
const path = "/blog/media/" + id + ".jpg";
// Tiny synthetic framing fixture. Real verified JPEG tests belong to Storage integration.
const jpeg = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
const asset = { id, key: "62000000-0000-0000-0000-000000000001/" + id + ".jpg",
  byte_size: jpeg.length, sha256: createHash("sha256").update(jpeg).digest("hex") };
const response = (bytes = jpeg, headers = {"Content-Type": "image/jpeg"}) => new globalThis.Response(bytes, { headers });
const invoke = (resolve, read, request = { method: "GET", path }) => deliverPublicMedia(request, { resolve, read });
const checkNoStore = r => {
  assert.match(r.headers["Cache-Control"], /no-store/);
  assert.equal(r.headers["CDN-Cache-Control"], "no-store");
  assert.equal(r.headers["Vercel-CDN-Cache-Control"], "no-store");
  assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
};
test("serves bounded verified JPEG only after two live resolution checks", async () => {
  const calls = [];
  const result = await invoke(async (arg, signal) => {
    calls.push("resolve"); assert.equal(arg,id); assert.ok(signal instanceof globalThis.AbortSignal); return asset;
  }, async (arg, signal) => {
    calls.push("read"); assert.deepEqual(arg,asset); assert.ok(signal instanceof globalThis.AbortSignal); return response();
  });
  assert.deepEqual(calls, ["resolve","read","resolve"]);
  assert.equal(result.status,200);
  assert.equal(result.headers["Content-Type"],"image/jpeg");
  assert.equal(result.headers["Content-Length"],String(jpeg.length));
  assert.deepEqual(result.body,jpeg);
  checkNoStore(result);
});
test("invalid routes and methods never reach adapters", async () => {
  const unexpected = async () => assert.fail("adapter called");
  for (const invalid of [path+"?token=x",path+"/",path+"\n",path.toUpperCase(),
    "/blog/media/../private.jpg","https://evil.example"+path,"/blog/media/%2e%2e.jpg"]) {
    const r=await invoke(unexpected,unexpected,{method:"GET",path:invalid});
    assert.equal(r.status,404); checkNoStore(r);
  }
  const r=await invoke(unexpected,unexpected,{method:"POST",path});
  assert.equal(r.status,405); assert.equal(r.headers.Allow,"GET"); checkNoStore(r);
});
test("unpublished media is never fetched; withdrawal during read discards bytes", async () => {
  const r=await invoke(async()=>null,async()=>assert.fail("unexpected read"));
  assert.equal(r.status,404); checkNoStore(r);
  let count=0;
  const removed=await invoke(async()=>++count===1?asset:null,async()=>response());
  assert.equal(removed.status,404); assert.notDeepEqual(removed.body,jpeg); checkNoStore(removed);
});
test("metadata corruption cannot reach storage", async () => {
  for (const invalid of [{...asset,id:"wrong"},{...asset,key:"../private.jpg"},
    {...asset,key:asset.key.replace(id,"82000000-0000-0000-0000-000000000002")},
    {...asset,key:asset.key+"\n"},{...asset,byte_size:5000001},{...asset,sha256:"a".repeat(64)+"\n"},
    {...asset,private_token:"secret"}]) {
    const r=await invoke(async()=>invalid,async()=>assert.fail("unexpected read"));
    assert.equal(r.status,503); checkNoStore(r);
  }
});
test("rejects redirects, partial content, wrong MIME, length, framing and hash", async () => {
  for (const bad of [
    globalThis.Response.redirect("https://evil.example/"),new globalThis.Response(jpeg,{status:206,headers:{"Content-Type":"image/jpeg"}}),
    response(jpeg,{"Content-Type":"text/html"}),response(jpeg,{"Content-Type":"image/jpeg","Content-Range":"bytes 0-6/7"}),
    response(jpeg,{"Content-Type":"image/jpeg","Content-Length":"8"}),
    response(jpeg.subarray(0,3)),response(Buffer.concat([jpeg,jpeg])),response(Buffer.from([255,216,1,2,4,255,217])),
  ]) {
    const r=await invoke(async()=>asset,async()=>bad);
    assert.equal(r.status,503); assert.notDeepEqual(r.body,jpeg); checkNoStore(r);
  }
});
test("dependency failures and metadata changes fail closed without details", async () => {
  const r=await invoke(async()=>{throw new Error("private_key secret");},async()=>assert.fail("unexpected read"));
  assert.equal(r.status,503); assert.equal(r.body.toString(),"Media temporarily unavailable.");
  let count=0;
  const changed=await invoke(async()=>++count===1?asset:{...asset,sha256:"a".repeat(64)},async()=>response());
  assert.equal(changed.status,503); checkNoStore(changed);
});
