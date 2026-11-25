import { expect, test, type Page } from "@playwright/test";
const origin = "https://mock.supabase.co";
async function session(page: Page, allowed: boolean) {
  await page.route(origin + "/**", async route => {
    const req = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (new URL(req.url()).pathname.endsWith("/resolve_blog_admin")) return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(allowed) });
    return route.fulfill({ status: 403, headers, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("sergei-portfolio-supabase-auth", JSON.stringify({
    access_token:"test.header.signature",refresh_token:"test-refresh-token",token_type:"bearer",expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user:{id:"11111111-1111-4111-8111-111111111111",aud:"authenticated",
      role:"authenticated",email:"fixture@example.test",created_at:"2026-01-01T00:00:00.000Z",
      app_metadata:{provider:"google",providers:["google"]},user_metadata:{full_name:"Fixture User"}}
  })));
  await page.goto("/admin/blog/");
}
test("photo preparation never appears for anonymous or denied users", async ({ page }) => {
  await page.goto("/admin/blog/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("region",{ name:"Photo preparation" })).toHaveCount(0);
  await session(page,false);
  await expect(page.getByRole("alert")).toContainText("Administrator access is not available");
  await expect(page.getByRole("region",{ name:"Photo preparation" })).toHaveCount(0);
});
test("selects 105 photos locally, policy confirmation, mobile layout, target validation and clear", async ({ page }) => {
  await session(page,true);
  const panel = page.getByRole("region",{ name:"Photo preparation" });
  await expect(panel).toBeVisible();
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "steelblue"; ctx.fillRect(0,0,96,96);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const writes: string[] = [];
  page.on("request", req => { if (["POST","PUT","PATCH","DELETE"].includes(req.method()) && !req.url().endsWith("/resolve_blog_admin")) writes.push(req.url()); });
  await panel.getByLabel("Choose photos").setInputFiles(Array.from({length:105},(_,i)=>({name:"fixture-"+i+".png",mimeType:"image/png",buffer:Buffer.from(base64,"base64")})));
  await expect(panel.getByText(/105 selected/)).toBeVisible();
  await expect(panel.getByLabel("Max size per photo (KB)")).toHaveValue("300");
  await expect(panel.getByRole("button",{name:"Compress photos"})).toBeDisabled();
  await panel.getByRole("checkbox",{name:/I confirm/}).check();
  await panel.getByLabel("Max size per photo (KB)").fill("0");
  await panel.getByRole("button",{name:"Compress photos"}).click();
  await expect(panel.getByText("Enter a whole number between 20 and 5000 KB.")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(writes).toEqual([]);
  await panel.getByRole("button",{name:"Clear photo batch"}).click();
  await expect(panel.getByText(/0 selected/)).toBeVisible();
  await expect(panel.getByRole("checkbox",{name:/I confirm/})).not.toBeChecked();
});
