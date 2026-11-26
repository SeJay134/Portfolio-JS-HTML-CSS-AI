import { expect, test, type Page } from "@playwright/test";
const origin = "https://mock.supabase.co";
const time = "2026-11-25T00:00:00Z";
type Doc = { id: string; title: string; category: string; slug: string };
type Stored = { id: string; revision: number; updated_at: string; document: Doc };
async function setup(page: Page) {
  const revisions: Stored[] = [];
  let denied = false, conflict = false, loseReceipt = false;
  type Publication = {generation:number;source_revision:number|null;status:"draft"|"published"|"archived";slug:string|null;published_at:string|null};
  type Mutation = {p_id:string;p_expected_revision:number;p_expected_generation:number;p_request_id:string;p_action:"publish"|"unpublish"|"archive"};
  let publication:Publication={generation:0,source_revision:null,status:"draft",slug:null,published_at:null};
  const mutations:Mutation[]=[];
  const receipts=new Map<string,{request:Mutation;receipt:Publication}>();
  await page.route(origin + "/**", async route => {
    const req = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*" };
    const json = (status: number, body: unknown) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const path = new URL(req.url()).pathname;
    if (path.endsWith("/resolve_blog_admin")) return json(200,true);
    if (denied) return json(403,{code:"42501",message:"Private details"});
    const latest = revisions.at(-1);
    if (path.endsWith("/get_studio_publication")) return json(200,publication);
    if (path.endsWith("/change_studio_publication")) {
      const body=req.postDataJSON() as Mutation;
      mutations.push(body);
      const previous=receipts.get(body.p_request_id);
      if(previous) return JSON.stringify(previous.request)===JSON.stringify(body) ? json(200,previous.receipt) : json(400,{code:"22023"});
      if (!latest || body.p_id!==latest.id || body.p_expected_revision!==latest.revision || body.p_expected_generation!==publication.generation)
        return json(409,{code:"40001"});
      publication={generation:publication.generation+1,source_revision:body.p_action==="publish"?latest.revision:publication.source_revision,
        status:body.p_action==="publish"?"published":body.p_action==="unpublish"?"draft":"archived",
        slug:latest.document.slug,published_at:body.p_action==="publish"?time:body.p_action==="unpublish"?null:publication.published_at};
      receipts.set(body.p_request_id,{request:body,receipt:publication});
      if(loseReceipt){loseReceipt=false;return json(503,{code:"XX000",message:"Private details"});}
      return json(200,publication);
    }
    if (path.endsWith("/list_studio_drafts")) return json(200,latest ? [{ id: latest.id, revision:latest.revision, updated_at:time,
      title:latest.document.title, category:latest.document.category, slug:latest.document.slug }] : []);
    if (path.endsWith("/get_studio_draft")) {
      const body = req.postDataJSON();
      return json(200,body.p_revision ? revisions.find(r => r.revision === body.p_revision) : latest);
    }
    if (path.endsWith("/list_studio_revisions")) return json(200,revisions.map(r => ({revision:r.revision,created_at:time})).reverse());
    if (path.endsWith("/save_studio_draft")) {
      const body = req.postDataJSON();
      if (conflict || body.p_expected_revision !== (latest?.revision ?? 0)) return json(409,{code:"40001",message:"Private conflict details"});
      const stored = { id:body.p_id, revision:body.p_expected_revision+1, updated_at:time, document:body.p_document };
      revisions.push(stored);
      return json(200,{id:stored.id,revision:stored.revision,updated_at:time});
    }
    return json(403,{});
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("sergei-portfolio-supabase-auth", JSON.stringify({
    access_token:"test.header.signature",refresh_token:"test-refresh-token",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:{id:"11111111-1111-4111-8111-111111111111",aud:"authenticated",
      role:"authenticated",email:"fixture@example.test",created_at:"2026-01-01T00:00:00.000Z",
      app_metadata:{provider:"google",providers:["google"]},user_metadata:{full_name:"Fixture User"}}
  })));
  await page.goto("/admin/blog/");
  await expect(page.getByRole("button",{name:"+ New draft"})).toBeVisible();
  return { revisions, mutations, loseReceipt: () => { loseReceipt=true; }, deny: () => { denied=true; }, conflict: () => { conflict=true; } };
}
async function savedArticle(page:Page) {
  await page.getByRole("button",{name:"+ New draft"}).click();
  await page.getByLabel("Autosave").uncheck();
  await page.getByLabel("Article title").fill("Publication fixture");
  await page.getByLabel("Summary").fill("Fixture summary");
  await page.getByLabel("URL slug").fill("publication-fixture");
  await page.getByLabel("Category",{exact:true}).fill("Photography");
  await page.getByLabel("Public byline").fill("Fixture");
  await page.getByLabel("Block 1 text part 1",{exact:true}).fill("Fixture body");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 1 / 100",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"Publish",exact:true})).toBeEnabled();
}
async function confirmAction(page:Page,name:string,accept=true) {
  page.once("dialog",dialog=>accept?dialog.accept():dialog.dismiss());
  await page.getByRole("button",{name,exact:true}).click();
}
test("publish, edit, republish, unpublish and archive from saved revisions",async({page})=>{
  const server=await setup(page);
  await savedArticle(page);
  await confirmAction(page,"Publish",false);
  expect(server.mutations).toHaveLength(0);
  await confirmAction(page,"Publish");
  await expect(page.getByRole("link",{name:"View published article"})).toHaveAttribute("href","/blog/publication-fixture/");
  await expect(page.getByRole("button",{name:"Republish",exact:true})).toBeEnabled();
  await page.getByLabel("Article title").fill("Updated fixture");
  await expect(page.getByRole("button",{name:"Republish",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 2 / 100",{exact:false})).toBeVisible();
  await expect(page.getByText("Saved revision differs from the public version.")).toBeVisible();
  await confirmAction(page,"Republish");
  await expect(page.getByText("Generation 2 / 200 · Published source revision 2")).toBeVisible();
  await confirmAction(page,"Unpublish");
  await expect(page.getByText("Status: Draft",{exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"View published article"})).toHaveCount(0);
  await confirmAction(page,"Archive");
  await expect(page.getByText("Status: Archived",{exact:true})).toBeVisible();
  expect(server.mutations.map(m=>[m.p_action,m.p_expected_revision,m.p_expected_generation])).toEqual([["publish",1,0],["publish",2,1],["unpublish",2,2],["archive",2,3]]);
  await page.reload();
  await page.getByRole("button",{name:/Updated fixture/}).click();
  await expect(page.getByText("Status: Archived",{exact:true})).toBeVisible();
});
test("lost receipt locks edits and navigation, retries same key, then clears on denial",async({page})=>{
  const server=await setup(page);
  await savedArticle(page);
  server.loseReceipt();
  await confirmAction(page,"Publish");
  await expect(page.getByRole("button",{name:"Retry publication request"})).toBeEnabled();
  await expect(page.getByLabel("Article title")).toBeDisabled();
  await expect(page.getByRole("button",{name:"+ New draft"})).toBeDisabled();
  await expect(page.getByRole("button",{name:/Publication fixture/})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Save draft"})).toBeDisabled();
  await page.getByRole("button",{name:"Retry publication request"}).click();
  await expect(page.getByRole("link",{name:"View published article"})).toBeVisible();
  await expect(page.getByLabel("Article title")).toBeEnabled();
  expect(server.mutations).toHaveLength(2);
  expect(server.mutations[1]).toEqual(server.mutations[0]);
  server.deny();
  await page.getByRole("button",{name:"Refresh publication status"}).click();
  await expect(page.getByRole("alert")).toContainText("Administrator access is no longer available");
  await expect(page.getByLabel("Article title")).toHaveCount(0);
});
