import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSeoPreview } from "../../../scripts/prepare-seo-preview.mjs";
import { verifyHostedSeo, hostedOptions } from "../../../scripts/verify-hosted-blog-seo.mjs";
const sha="a".repeat(40),slug="seo-acceptance-12345678",marker="SEO-FIXTURE-12345678";
const env={BLOG_SEO_ACCEPTANCE_ORIGIN:"https://sergei-luna-123456789-sergeis-projects-36bee0a3.vercel.app",BLOG_SEO_ACCEPTANCE_SHA:sha,BLOG_SEO_ACCEPTANCE_SLUG:slug,BLOG_SEO_ACCEPTANCE_STATE:"published",BLOG_SEO_ACCEPTANCE_MARKER:marker,VERCEL_OIDC_TOKEN:"synthetic-test-token"};
const canonical="https://sergei-luna.vercel.app/blog/"+slug+"/";
function reader(state, override={}) {
  return async (url,init)=>{
    assert.equal(new globalThis.URL(url).origin,env.BLOG_SEO_ACCEPTANCE_ORIGIN);
    assert.equal(init.redirect,"manual");
    assert.equal(new globalThis.Headers(init.headers).get("x-vercel-trusted-oidc-idp-token"),env.VERCEL_OIDC_TOKEN);
    assert.equal(new globalThis.Headers(init.headers).has("cache-control"),false);
    const path=new globalThis.URL(url).pathname;
    const article=path==="/blog/"+slug+"/"||path==="/blog/"+slug;
    const css=path.startsWith("/assets/");
    const status=article&&state==="withdrawn"?404:200;
    const type=css?"text/css":path.endsWith("rss.xml")?"application/rss+xml":path.endsWith("sitemap.xml")?"application/xml":"text/html";
    const body=css?"body{}":state==="withdrawn"?"empty":article?'<link rel="canonical" href="'+canonical+'"><meta property="og:title"><meta name="twitter:title"><script type="application/ld+json">{"@type":"BlogPosting"}</script><link rel="stylesheet" href="/assets/blog-a123.css"><article class="blog-article">'+marker+'</article>':marker+" "+canonical;
    return new globalThis.Response(init.method==="HEAD"?null:body,{status,headers:{"content-type":type,"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow","x-blog-preview-revision":sha,"x-vercel-cache":"MISS",...override}});
  };
}
test("hosted verifier checks repeated routes, conditional requests, CSS and HEAD",async()=>{
  const published=await verifyHostedSeo(env,reader("published"));
  assert.equal(published.results.length,12);assert.equal(published.cssCount,1);
  const withdrawn=await verifyHostedSeo({...env,BLOG_SEO_ACCEPTANCE_STATE:"withdrawn"},reader("withdrawn"));
  assert.equal(withdrawn.headStatus,404);assert.equal(withdrawn.results.length,12);
});
test("hosted verifier rejects stale cache, wrong SHA, wrong state and non-preview origin",async()=>{
  for(const headers of [{"x-vercel-cache":"HIT"},{"age":"10"},{"x-blog-preview-revision":"b".repeat(40)},{"cache-control":"public, max-age=60"},{"x-robots-tag":"index"}]) await assert.rejects(verifyHostedSeo(env,reader("published",headers)));
  await assert.rejects(verifyHostedSeo({...env,BLOG_SEO_ACCEPTANCE_STATE:"withdrawn"},reader("published")));
  assert.throws(()=>hostedOptions({...env,BLOG_SEO_ACCEPTANCE_ORIGIN:"https://sergei-luna.vercel.app"}));
  assert.throws(()=>hostedOptions({...env,BLOG_SEO_ACCEPTANCE_SLUG:"real-article"}));
  assert.throws(()=>hostedOptions({...env,VERCEL_OIDC_TOKEN:""}));
});
test("preview build removes only colliding generated files, refuses production and static snapshots",async()=>{
  const root=await mkdtemp(join(tmpdir(),"seo-preview-"));
  const flags={VERCEL_ENV:"preview",BLOG_SEO_PREVIEW:"true",VITE_ENABLE_LIVE_BLOG:"true",VERCEL_GIT_COMMIT_SHA:sha};
  try{
    await mkdir(join(root,"dist/blog"),{recursive:true});await mkdir(join(root,"dist/blog-article"));
    for(const path of ["blog/index.html","sitemap.xml","blog-article/index.html","index.html"]) await writeFile(join(root,"dist",path),"fixture");
    await assert.rejects(prepareSeoPreview({...flags,VERCEL_ENV:"production"},root));
    assert.equal(await readFile(join(root,"dist/blog/index.html"),"utf8"),"fixture");
    await mkdir(join(root,"dist/blog/static-article"));
    await assert.rejects(prepareSeoPreview(flags,root));
    await rm(join(root,"dist/blog/static-article"),{recursive:true});
    await prepareSeoPreview(flags,root);
    for(const path of ["blog/index.html","sitemap.xml"]) await assert.rejects(readFile(join(root,"dist",path)));
    for(const path of ["blog-article/index.html","index.html"]) assert.equal(await readFile(join(root,"dist",path),"utf8"),"fixture");
  }finally{await rm(root,{recursive:true,force:true});}
});
