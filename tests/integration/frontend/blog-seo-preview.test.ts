import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createSeoPreviewHandler, styleLinks } from "../../../server/blogSeoPreview";
const env = { VERCEL_ENV:"preview", BLOG_SEO_PREVIEW:"true", BLOG_SEO_SUPABASE_URL:"https://fixture.supabase.co", BLOG_SEO_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture" };
const fixture = {slug:"fixture",title:"Fixture",description:"Description",author_name:"Author",status:"published",published_at:"2026-01-01T00:00:00Z",featured:false,reading_minutes:2,cover_image:null,cover_alt:null,cover_width:null,cover_height:null,blog_categories:{name:"Data"},blog_post_tags:[],content:[{type:"paragraph",text:"No JavaScript required."}],seo_title:"SEO Fixture",seo_description:"SEO Description"};
test("real local HTTP adapter against built assets and disposable public fixtures", async () => {
  let visible = true, calls = 0, failUpstream = false;
  const handler = createSeoPreviewHandler({env,clock:()=>Date.parse("2026-11-25T00:00:00Z"),reader:async(target,init)=>{
    calls++;
    assert.equal(new URL(String(target)).hostname,"fixture.supabase.co");
    assert.equal(new Headers(init?.headers).has("authorization"),false);
    assert.equal(init?.credentials,"omit");
    if(failUpstream) return new Response("upstream private error",{status:500});
    return new Response(JSON.stringify(visible?[fixture]:[]),{headers:{"content-type":"application/json"}});
  }});
  const server=createServer(async(req,res)=>{
    try{
      const reply=await handler(new Request("http://127.0.0.1"+req.url,{method:req.method}));
      res.writeHead(reply.status,Object.fromEntries(reply.headers));
      res.end(Buffer.from(await reply.arrayBuffer()));
    }catch{res.writeHead(500);res.end();}
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  try{
    const address=server.address();assert.ok(address&&typeof address!=="string");
    const base="http://127.0.0.1:"+address.port+"/api/blog-seo";
    const get=(route:string,method="GET")=>fetch(base+"?route="+encodeURIComponent(route),{method});
    const article=await get("/blog/fixture/");
    assert.equal(article.status,200);
    assert.equal(article.headers.get("x-robots-tag"),"noindex, nofollow");
    assert.equal(article.headers.get("vercel-cdn-cache-control"),"no-store");
    const html=await article.text();assert.match(html,/No JavaScript required/);
    assert.match(html,/SEO Fixture/);assert.match(html,/rel="stylesheet" href="\/assets\/[^"]+\.css"/);
    for(const match of html.matchAll(/rel="stylesheet" href="(\/assets\/[^"]+\.css)"/g)) assert.ok((await readFile("dist"+match[1])).length>0);
    const sitemap=await get("/sitemap.xml");assert.equal(sitemap.status,200);
    const xml=await sitemap.text();assert.match(xml,/sergei-luna\.vercel\.app\/privacy\//);assert.match(xml,/blog\/fixture\//);
    const rss=await get("/blog/rss.xml");assert.equal(rss.status,200);assert.match(await rss.text(),/<rss version="2.0">/);
    const head=await get("/blog/fixture/","HEAD");assert.equal(head.status,200);assert.equal(await head.text(),"");
    visible=false;assert.equal((await get("/blog/fixture/")).status,404);
    assert.doesNotMatch(await (await get("/sitemap.xml")).text(),/blog\/fixture\//);
    assert.doesNotMatch(await (await get("/blog/rss.xml")).text(),/blog\/fixture\//);
    failUpstream=true;const failed=await get("/blog/fixture/");assert.equal(failed.status,503);assert.equal(failed.headers.get("retry-after"),"60");assert.doesNotMatch(await failed.text(),/upstream private error/);
    const before=calls;
    assert.equal((await get("/blog/../private")).status,404);
    assert.equal((await get("/blog/fixture/","POST")).status,405);
    assert.equal((await fetch(base+"?route=/blog/&route=/blog/fixture/")).status,404);
    assert.equal(calls,before);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test("disabled and production modes cannot fetch; stylesheet extraction rejects injection", async()=>{
  const reader:typeof fetch=async()=>{throw new Error("Unexpected fetch");};
  const req=new Request("https://fixture.invalid/api/blog-seo?route=/blog/");
  for(const invalid of [{...env,VERCEL_ENV:"production"},{...env,BLOG_SEO_PREVIEW:"false"}]) assert.equal((await createSeoPreviewHandler({env:invalid,reader})(req)).status,404);
  assert.throws(()=>styleLinks('<link rel="stylesheet" href="https://evil.invalid/style.css">'));
  assert.throws(()=>styleLinks('<link rel="stylesheet" href="/assets/../evil.css">'));
});
