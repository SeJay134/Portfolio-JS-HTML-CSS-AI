import { expect, test, type Page } from "@playwright/test";
const origin = "https://mock.supabase.co";
const time = "2026-11-25T00:00:00Z";
type Doc = { id: string; title: string; category: string; slug: string };
type Stored = { id: string; revision: number; updated_at: string; document: Doc };
async function setup(page: Page) {
  const revisions: Stored[] = [];
  let denied = false, conflict = false;
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
  return { revisions, deny: () => { denied=true; }, conflict: () => { conflict=true; } };
}
test("private save survives reload and old revision restores as new edit", async ({page}) => {
  const server=await setup(page);
  await page.getByRole("button",{name:"+ New draft"}).click();
  await page.getByLabel("Autosave").uncheck();
  await page.getByLabel("Article title").fill("First revision");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 1 / 100",{exact:false})).toBeVisible();
  await page.getByLabel("Article title").fill("Second revision");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 2 / 100",{exact:false})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:/Second revision/}).click();
  await page.getByLabel("Autosave").uncheck();
  await expect(page.getByLabel("Article title")).toHaveValue("Second revision");
  await page.getByRole("button",{name:"Load revision history"}).click();
  page.once("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Restore revision 1"}).click();
  await expect(page.getByLabel("Article title")).toHaveValue("First revision");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 3 / 100",{exact:false})).toBeVisible();
  expect(server.revisions.map(r=>r.document.title)).toEqual(["First revision","Second revision","First revision"]);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain("First revision");
});
test("conflict preserves unsaved input and denial clears editor", async ({page}) => {
  const server=await setup(page);
  await page.getByRole("button",{name:"+ New draft"}).click();
  await page.getByLabel("Autosave").uncheck();
  await page.getByLabel("Article title").fill("Saved draft");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText("Saved revision 1 / 100",{exact:false})).toBeVisible();
  server.conflict();
  await page.getByLabel("Article title").fill("Unsaved private edits");
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByRole("alert")).toContainText("Another save changed this draft");
  await expect(page.getByLabel("Article title")).toHaveValue("Unsaved private edits");
  await expect(page.getByRole("button",{name:"Save draft"})).toBeDisabled();
  server.deny();
  page.once("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Reload saved version"}).click();
  await expect(page.getByRole("alert")).toContainText("Administrator access is no longer available");
  await expect(page.getByLabel("Article title")).toHaveCount(0);
  await expect(page.getByText("Unsaved private edits")).toHaveCount(0);
});
