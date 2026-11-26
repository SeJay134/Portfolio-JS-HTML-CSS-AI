import { expect, it, vi } from "vitest";
import { createBlogSeoHandler } from "../../../src/data/blogSeo";
const config={url:"https://mock.supabase.co",key:"sb_publishable_fixture"};
const now=Date.parse("2026-11-25T00:00:00Z");
const fixture={slug:"fixture",title:"Fixture </script><script>alert(1)</script>",description:"Description & notes",author_name:"Fixture author",status:"published",published_at:"2026-01-01T00:00:00Z",featured:false,reading_minutes:2,cover_image:null,cover_alt:null,cover_width:null,cover_height:null,blog_categories:{name:"Data"},blog_post_tags:[],content:[{type:"paragraph",text:"Article <script>private</script>"}],seo_title:"Search title",seo_description:"Search description"};
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{"content-type":"application/json"}});
it("renders no-JS article, custom SEO, canonical and escaped structured data",async()=>{
  const reader=vi.fn<typeof fetch>().mockResolvedValue(json([fixture]));
  const res=await createBlogSeoHandler(config,reader,()=>now)("/blog/fixture/");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("no-store");
  const html=await res.text();
  expect(html).toContain("<title>Search title — Sergei Patrushev</title>");
  expect(html).toContain('content="Search description"');
  expect(html).toContain('href="https://sergei-luna.vercel.app/blog/fixture/"');
  expect(html).toContain("Article &lt;script&gt;private&lt;/script&gt;");
  expect(html).toContain('"@type":"BlogPosting"');
  expect(html).not.toContain("</script><script>alert(1)</script>");
  const [target,init]=reader.mock.calls[0];
  expect(new URL(String(target)).searchParams.get("slug")).toBe("eq.fixture");
  expect(new Headers(init?.headers).has("authorization")).toBe(false);
  expect(new Headers(init?.headers).get("apikey")).toBe(config.key);
  expect(init?.redirect).toBe("error");
  expect(init?.credentials).toBe("omit");
});
it.each([[],[{status:"draft",content:"PRIVATE"}],[{status:"archived",content:"PRIVATE"}],[{...fixture,published_at:"2099-01-01"}]])("returns true 404 for nonpublic rows",async(data)=>{
  const response=await createBlogSeoHandler(config,vi.fn<typeof fetch>().mockResolvedValue(json(data)),()=>now)("/blog/fixture");
  expect(response.status).toBe(404);
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  expect(await response.text()).not.toContain("PRIVATE");
});
it("distinguishes upstream failure and malformed projection from absence",async()=>{
  for(const data of [[{...fixture,slug:"other"}],[fixture,fixture],[{...fixture,content:[{type:"html",text:"PRIVATE"}]}]]){
    const response=await createBlogSeoHandler(config,vi.fn<typeof fetch>().mockResolvedValue(json(data)),()=>now)("/blog/fixture/");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.text()).not.toContain("PRIVATE");
  }
  const reader=vi.fn<typeof fetch>().mockRejectedValue(new Error("internal secret"));
  const response=await createBlogSeoHandler(config,reader,()=>now)("/blog/fixture/");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("internal secret");
});
it("lists only visible current rows in sitemap, RSS and crawlable catalogue",async()=>{
  const reader=vi.fn<typeof fetch>().mockImplementation(async()=>json([fixture,{status:"draft",slug:"private-draft"},{...fixture,slug:"future",published_at:"2099-01-01"}]));
  const handler=createBlogSeoHandler(config,reader,()=>now);
  for(const path of ["/blog/","/blog/sitemap.xml","/blog/rss.xml"]){
    const response=await handler(path),body=await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("/blog/fixture/");
    expect(body).not.toContain("private-draft");
    expect(body).not.toContain("/blog/future/");
    expect(body).not.toContain("<script>alert(1)</script>");
  }
  expect(new URL(String(reader.mock.calls[0][0])).searchParams.get("select")).not.toContain(",content");
});
it("does not fetch invalid paths or privileged settings; re-reads after withdrawal",async()=>{
  const reader=vi.fn<typeof fetch>().mockResolvedValueOnce(json([fixture])).mockResolvedValueOnce(json([]));
  const handler=createBlogSeoHandler(config,reader,()=>now);
  expect((await handler("/blog/media/")).status).toBe(404);
  expect((await handler("/blog/../private")).status).toBe(404);
  expect(reader).not.toHaveBeenCalled();
  expect((await handler("/blog/fixture/")).status).toBe(200);
  expect((await handler("/blog/fixture/")).status).toBe(404);
  expect((await createBlogSeoHandler({...config,key:"sb_secret_fixture"},reader,()=>now)("/blog/fixture/")).status).toBe(503);
  expect(reader).toHaveBeenCalledTimes(2);
});
