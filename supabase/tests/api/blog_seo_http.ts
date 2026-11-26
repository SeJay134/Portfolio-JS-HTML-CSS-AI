// Disposable local Data API only. Credentials enter through stdin, not argv/logs.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createSeoPreviewHandler } from "../../../server/blogSeoPreview";
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const input=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {key:string;slug:string;expectedTitle:string|null;forbiddenTitle:string|null};
assert.match(input.key,/^sb_publishable_[A-Za-z0-9_-]+$/);
assert.equal(input.slug,"studio-fixture");
let calls=0;
const handler=createSeoPreviewHandler({
  env:{VERCEL_ENV:"preview",BLOG_SEO_PREVIEW:"true",BLOG_SEO_PRIMARY_PROJECT_REF:"aaaaaaaaaaaaaaaaaaaa",BLOG_SEO_TEST_PROJECT_REF:"bbbbbbbbbbbbbbbbbbbb",BLOG_SEO_SUPABASE_URL:"https://bbbbbbbbbbbbbbbbbbbb.supabase.co",BLOG_SEO_SUPABASE_PUBLISHABLE_KEY:input.key},
  // This injected test-only reader maps the fixed validated endpoint to the disposable local gateway.
  reader:async(target,init)=>{
    const url=new URL(String(target));
    assert.equal(url.origin,"https://bbbbbbbbbbbbbbbbbbbb.supabase.co");
    assert.equal(url.pathname,"/rest/v1/blog_posts");
    assert.equal(init?.credentials,"omit");
    assert.equal(init?.redirect,"error");
    assert.equal(init?.cache,"no-store");
    const headers=new Headers(init?.headers);
    assert.equal(headers.has("authorization"),false);
    assert.equal(headers.has("cookie"),false);
    assert.ok(headers.get("apikey")===input.key);
    calls++;
    return fetch("http://127.0.0.1:54321/rest/v1/blog_posts"+url.search,init);
  },
});
const server=createServer(async(req,res)=>{
  try{
    const response=await handler(new Request("http://127.0.0.1"+req.url,{method:req.method,headers:{"Cookie":"untrusted=fixture","Authorization":"Bearer untrusted"}}));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
});
server.listen(0,"127.0.0.1");await once(server,"listening");
try{
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const origin="http://127.0.0.1:"+address.port;
  const canonical="https://sergei-luna.vercel.app/blog/studio-fixture/";
  const paths=["/blog/studio-fixture/","/blog/studio-fixture","/blog/","/sitemap.xml","/blog/sitemap.xml","/blog/rss.xml"];
  for(const path of paths){
    const article=path.startsWith("/blog/studio-fixture");
    const response=await fetch(origin+"/api/blog-seo?route="+encodeURIComponent(path),{
      headers:{"If-None-Match":'"old-fixture"',"If-Modified-Since":"Wed, 01 Jan 2025 00:00:00 GMT"}
    });
    assert.equal(response.status,article&&!input.expectedTitle?404:200,path+" status");
    assert.match(response.headers.get("cache-control")??"",/no-store/);
    assert.equal(response.headers.get("cdn-cache-control"),"no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"),"no-store");
    assert.equal(response.headers.get("x-robots-tag"),"noindex, nofollow");
    const body=await response.text();
    assert.ok(!body.includes("96000000-0000-0000-0000-000000000001"),"private draft identifier");
    if(input.forbiddenTitle) assert.ok(!body.includes(input.forbiddenTitle),path+" stale/private title");
    if(input.expectedTitle){
      if(article||path==="/blog/"||path==="/blog/rss.xml") assert.ok(body.includes(input.expectedTitle),path+" current title");
      if(path.endsWith(".xml")||article) assert.ok(body.includes(canonical),path+" canonical");
      if(article){
        assert.match(body,/<article class="blog-article">/);
        assert.match(body,/"@type":"BlogPosting"/);
        assert.match(body,/<link rel="stylesheet" href="\/assets\/[^"]+\.css">/);
      }
    }else{
      assert.ok(!body.includes(canonical),path+" withdrawn canonical");
      assert.ok(!body.includes("Private body"),path+" withdrawn article text");
      assert.ok(!body.includes('"@type":"BlogPosting"'),path+" withdrawn JSON-LD");
    }
  }
  assert.equal(calls,paths.length);
  console.log("PASS: real local SEO six HTTP routes, current anonymous projection, no-store and noindex");
}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
