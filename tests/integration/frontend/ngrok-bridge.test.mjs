import assert from "node:assert/strict";
import process from "node:process";
import { afterEach, test } from "node:test";
import { chatHandler, readyHandler } from "../../../server/chatBridge.js";

const originalFetch = globalThis.fetch;
const savedEnv = {
  NGROK_TUNNEL_ORIGIN: process.env.NGROK_TUNNEL_ORIGIN,
  LOCAL_FLASK_API_KEY: process.env.LOCAL_FLASK_API_KEY,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function res() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, val) { this.headers[key] = val; return this; },
    json(value) { this.body = value; return this; },
  };
}

function configure() {
  process.env.NGROK_TUNNEL_ORIGIN = "https://example.ngrok-free.app";
  process.env.LOCAL_FLASK_API_KEY = "testing-only-012345678901234567";
}

test("chat refuses unconfigured upstream without contacting network", async () => {
  delete process.env.NGROK_TUNNEL_ORIGIN;
  delete process.env.LOCAL_FLASK_API_KEY;
  globalThis.fetch = () => { throw new Error("network should not run"); };
  const response = res();
  await chatHandler({method:"POST",headers:{},body:{message:"Hello"}},response);
  assert.equal(response.statusCode,503);
  assert.ok(!JSON.stringify(response.body).includes("ngrok"));
});

test("rejects invalid or untrusted ngrok endpoints", async () => {
  configure();
  globalThis.fetch = () => { throw new Error("never call"); };
  for(const upstream of [
    "http://example.ngrok-free.app",
    "https://ngrok-free.app.evil.example",
    "https://ngrok-free.dev.evil.example",
    "https://user:pass@example.ngrok-free.dev",
    "http://example.ngrok-free.dev",
    "https://example.ngrok-free.dev/private",
    "https://user:pass@example.ngrok-free.app",
    "https://example.ngrok-free.app:8443",
    "https://example.ngrok-free.app/private",
    "https://localhost:5002",
  ]) {
    process.env.NGROK_TUNNEL_ORIGIN = upstream;
    const response = res();
    await readyHandler({method:"GET",headers:{}},response);
    assert.equal(response.statusCode,503,upstream);
  }
});

test("chat forwards server-only key and returns only validated public sources", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url,options) => {
    requests.push({url,options});
    return {ok:true,status:200,json:async()=>({
      reply:"Chocolate sales dashboard",
      private:"Never show this",
      sources:[
        {title:"Correct",url:"https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python"},
        {title:"Bad",url:"file:///C:/private/note.txt"},
        {title:"Wrong host",url:"https://github.com.evil.test/a"},
        {title:"Credentials",url:"https://u:p@github.com/secret"},
        {title:"Contact",url:"https://sergei-luna.vercel.app/#Projects"},
      ],
    })};
  };
  const response = res();
  await chatHandler({method:"POST",headers:{},body:{message:"What projects?"}},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.headers["Cache-Control"],"no-store");
  assert.deepEqual(Object.keys(response.body),["reply","sources"]);
  assert.equal(response.body.sources.length,2);
  assert.equal(requests[0].url,"https://example.ngrok-free.app/chat");
  assert.equal(requests[0].options.redirect,"error");
  assert.equal(requests[0].options.headers["X-Local-API-Key"],process.env.LOCAL_FLASK_API_KEY);
  assert.deepEqual(JSON.parse(requests[0].options.body),{message:"What projects?"});
  assert.equal(requests[0].options.signal.aborted,false);
});

test("chat rejects empty, oversized, malformed or unsupported methods", async () => {
  configure();
  globalThis.fetch = () => { throw new Error("never call"); };
  for (const input of [
    {method:"GET",headers:{},body:{message:"hi"}},
    {method:"POST",headers:{},body:{message:""}},
    {method:"POST",headers:{},body:{message:"x".repeat(301)}},
    {method:"POST",headers:{"content-length":"16001"},body:{message:"hi"}},
    {method:"POST",headers:{},body:"{broken"},
    {method:"POST",headers:{},body:{message:21}},
  ]) {
    const response=res();
    await chatHandler(input,response);
    assert.ok([400,405,413].includes(response.statusCode));
  }
});

test("official ngrok-free.dev tunnel reaches Flask readiness endpoint", async () => {
  configure();
  process.env.NGROK_TUNNEL_ORIGIN = "https://demo.ngrok-free.dev";
  let count = 0;
  globalThis.fetch = async (url,options) => {
    count++;
    assert.equal(url, "https://demo.ngrok-free.dev/ready");
    assert.equal(options.headers["X-Local-API-Key"], process.env.LOCAL_FLASK_API_KEY);
    return {ok:true,status:200,json:async()=>({status:"ready"})};
  };
  const response = res();
  await readyHandler({method:"GET",headers:{}},response);
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,{status:"ready"});
  assert.equal(count,1);
});

test("readiness uses protected tunnel, never leaking upstream", async () => {
  configure();
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,"https://example.ngrok-free.app/ready");
    assert.equal(options.headers["X-Local-API-Key"],process.env.LOCAL_FLASK_API_KEY);
    return {ok:true,status:200,json:async()=>({status:"ready",info:"private"})};
  };
  const response=res();
  await readyHandler({method:"GET",headers:{}},response);
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body,{status:"ready"});
});

test("unreachable upstream returns redacted 503", async () => {
  configure();
  globalThis.fetch = async () => { throw new Error("Private tunnel unavailable"); };
  const response=res();
  await chatHandler({method:"POST",headers:{},body:{message:"Hello"}},response);
  assert.equal(response.statusCode,503);
  assert.ok(!JSON.stringify(response.body).includes("Private"));
});
