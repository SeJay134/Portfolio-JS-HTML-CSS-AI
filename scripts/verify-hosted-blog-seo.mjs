import { pathToFileURL } from "node:url";

const canonicalOrigin = "https://sergei-luna.vercel.app";
const pathsFor = slug => ["/blog/"+slug+"/","/blog/"+slug,"/blog/","/sitemap.xml","/blog/sitemap.xml","/blog/rss.xml"];
const check = (ok, label) => { if (!ok) throw new Error(label); };
export function hostedOptions(env) {
  const origin = new URL(env.BLOG_SEO_ACCEPTANCE_ORIGIN ?? "");
  // Exact immutable deployment URL for this project; never the production or branch alias.
  check(origin.protocol === "https:" && /^sergei-luna-[a-z0-9]{9}-sergeis-projects-36bee0a3\.vercel\.app$/.test(origin.hostname) &&
    origin.origin === env.BLOG_SEO_ACCEPTANCE_ORIGIN && !origin.username && !origin.password,
    "Expected exact isolated Vercel deployment origin");
  const sha = env.BLOG_SEO_ACCEPTANCE_SHA ?? "";
  const slug = env.BLOG_SEO_ACCEPTANCE_SLUG ?? "";
  const state = env.BLOG_SEO_ACCEPTANCE_STATE ?? "";
  const marker = env.BLOG_SEO_ACCEPTANCE_MARKER ?? "";
  const forbidden = env.BLOG_SEO_ACCEPTANCE_FORBIDDEN ?? "";
  const oidc = env.VERCEL_OIDC_TOKEN ?? "";
  check(/^[a-f0-9]{40}$/.test(sha), "Exact deployed SHA required");
  check(/^seo-acceptance-[a-z0-9]{8,40}$/.test(slug), "Synthetic acceptance slug required");
  check(["published","withdrawn"].includes(state), "Explicit fixture state required");
  check(/^SEO-FIXTURE-[A-Z0-9-]{8,80}$/.test(marker), "Synthetic title marker required");
  check(!forbidden || /^SEO-FIXTURE-[A-Z0-9-]{8,80}$/.test(forbidden) && forbidden !== marker, "Invalid previous marker");
  check(oidc && oidc.length <= 16000 && !/[\r\n]/.test(oidc), "Use existing local development OIDC token");
  return { origin: origin.origin, sha, slug, state, marker, forbidden, oidc };
}
async function boundedText(response) {
  const reader = response.body?.getReader();
  check(reader, "Response body missing");
  const decoder = new TextDecoder("utf-8",{fatal:true});
  let total = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      check(total <= 5_000_000, "Response exceeds acceptance byte limit");
      text += decoder.decode(chunk.value,{stream:true});
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally { reader.releaseLock(); }
}
export async function verifyHostedSeo(env, fetcher = fetch) {
  const opt = hostedOptions(env);
  const canonical = canonicalOrigin + "/blog/" + opt.slug + "/";
  const results = [];
  const css = new Set();
  async function request(path, method, conditional = false) {
    const headers = {"x-vercel-trusted-oidc-idp-token":opt.oidc};
    if (conditional) {
      headers["If-None-Match"] = '"stale-seo-fixture"';
      headers["If-Modified-Since"] = "Wed, 01 Jan 2025 00:00:00 GMT";
    }
    const signal = AbortSignal.timeout(15000);
    // Deliberately do not send cache bypass request directives.
    let response = await fetcher(opt.origin+path,{method,headers,redirect:"manual",signal});
    if ([301,302,307,308].includes(response.status)) {
      const next = new URL(response.headers.get("location") ?? "",opt.origin);
      const allowed = path.endsWith("/") ? path.slice(0,-1) : path+"/";
      await response.body?.cancel();
      check(next.origin===opt.origin && next.pathname===allowed && !next.search && !next.hash, "Unexpected redirect: "+path);
      response = await fetcher(next.href,{method,headers,redirect:"manual",signal});
    }
    return response;
  }
  for (const path of pathsFor(opt.slug)) {
    const article = path === "/blog/"+opt.slug+"/" || path === "/blog/"+opt.slug;
    const expected = article && opt.state==="withdrawn" ? 404 : 200;
    for (const conditional of [false,true]) {
      const res = await request(path,"GET",conditional);
      check(res.status===expected,"Wrong status: "+path+" "+res.status);
      check(res.headers.get("x-blog-preview-revision")===opt.sha,"Wrong/missing deployment revision: "+path);
      check(/\bnoindex\b/i.test(res.headers.get("x-robots-tag")??""),"Noindex missing: "+path);
      check(/\bno-store\b/i.test(res.headers.get("cache-control")??""),"No-store missing: "+path);
      const cache = (res.headers.get("x-vercel-cache")??"").toUpperCase();
      check(!cache || ["MISS","BYPASS"].includes(cache),"Unexpected CDN cache state: "+path+" "+cache);
      const age = res.headers.get("age");
      check(age===null || age==="0","Nonzero CDN age: "+path);
      const type = path.endsWith("rss.xml")?"application/rss+xml":path.endsWith("sitemap.xml")?"application/xml":"text/html";
      check((res.headers.get("content-type")??"").startsWith(type),"Wrong content type: "+path);
      const body = await boundedText(res);
      check(!opt.forbidden || !body.includes(opt.forbidden),"Previous revision exposed: "+path);
      if (opt.state==="published") {
        if (article || path==="/blog/" || path.endsWith("rss.xml")) check(body.includes(opt.marker),"Expected title marker absent: "+path);
        if (path.endsWith(".xml") || article) check(body.includes(canonical),"Canonical missing: "+path);
        if (article) {
          check(body.includes('<link rel="canonical" href="'+canonical+'"'),"Canonical tag missing");
          check(body.includes('"@type":"BlogPosting"') && body.includes('property="og:title"') && body.includes('name="twitter:title"'),"Article metadata missing");
          check(body.includes('<article class="blog-article">'),"No-JS article absent");
          const styles = [...body.matchAll(/rel="stylesheet" href="(\/assets\/[A-Za-z0-9_-]+\.css)"/g)];
          check(styles.length>0 && styles.length<=16,"Built CSS missing");
          for (const match of styles) css.add(match[1]);
        }
      } else {
        check(!body.includes(canonical) && !body.includes(opt.marker) && !body.includes("/blog/"+opt.slug+"/"),"Withdrawn content exposed: "+path);
        if (article) check(!body.includes('"@type":"BlogPosting"'),"Withdrawn structured data exposed");
      }
      results.push({path,status:res.status,conditional,cache:cache||"not reported"});
    }
  }
  for (const path of css) {
    const res = await request(path,"GET");
    check(res.status===200 && (res.headers.get("content-type")??"").startsWith("text/css"),"CSS asset unavailable");
    check((await boundedText(res)).length>0,"Empty stylesheet");
  }
  const head = await request("/blog/"+opt.slug+"/","HEAD");
  check(head.status===(opt.state==="published"?200:404),"Wrong HEAD status");
  check(head.headers.get("x-blog-preview-revision")===opt.sha && /\bno-store\b/i.test(head.headers.get("cache-control")??""),"HEAD headers missing");
  check((await head.text())==="","HEAD returned a body");
  return {sha:opt.sha,state:opt.state,results,cssCount:css.size,headStatus:head.status};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await verifyHostedSeo(process.env),null,2)); }
  catch (error) {
    // No response bodies, request headers or credentials in output.
    console.error("Hosted SEO acceptance failed:",error instanceof Error && !/token|http/i.test(error.message)?error.message:"request/configuration failure");
    process.exitCode=1;
  }
}
