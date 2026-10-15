import { expect, test } from "@playwright/test";

test("local React chat sends and displays a verified source without exposing untrusted links", async ({page}) => {
  let question: string | undefined;
  await page.route("http://127.0.0.1:5002/**", async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": "http://127.0.0.1:5001",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({status:204, headers:cors});
    } else if (request.url().endsWith("/ready")) {
      await route.fulfill({
        status:200, contentType:"application/json", headers:cors,
        body:JSON.stringify({status:"ready"}),
      });
    } else if (request.url().endsWith("/chat")) {
      question = request.postDataJSON().message;
      await route.fulfill({
        status:200, contentType:"application/json", headers:cors,
        body:JSON.stringify({
          reply:"The chocolate dashboard uses Streamlit.",
          sources:[
            {title:"Project repository",url:"https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python"},
            {title:"Unsafe destination",url:"javascript:alert(1)"},
          ],
        }),
      });
    } else {
      await route.abort();
    }
  });
  await page.goto("/");
  const launcher = page.getByRole("button", {name:"Open portfolio assistant"});
  await expect(launcher).toHaveCSS("position", "fixed");
  await launcher.click();
  const chat = page.getByRole("dialog", {name:"Ask about Sergei"});
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Assistant online")).toBeVisible();
  await chat.getByLabel("Your question").fill("Which dashboards?");
  await chat.getByRole("button", {name:/Send/}).click();
  await expect(chat.getByText("The chocolate dashboard uses Streamlit.")).toBeVisible();
  await expect(chat.getByRole("link", {name:/Project repository/})).toHaveAttribute(
    "href", "https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python",
  );
  await expect(chat.getByText("Unsafe destination")).toHaveCount(0);
  expect(question).toBe("Which dashboards?");
  await chat.getByRole("button", {name:"Clear chat"}).click();
  await expect(chat.getByText("Which dashboards?")).toHaveCount(0);
});

test("mobile chat switches to the main drawer without competing dialogs", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route("http://127.0.0.1:5002/ready", route =>
    route.fulfill({
      status:503, contentType:"application/json",
      headers:{"access-control-allow-origin":"http://127.0.0.1:5001"},
      body:JSON.stringify({error:"Assistant offline"}),
    }),
  );
  await page.goto("/");
  const launcher = page.getByRole("button", {name:"Open portfolio assistant"});
  await expect(launcher).toHaveCSS("position", "fixed");
  await launcher.click();
  const chat = page.getByRole("dialog", {name:"Ask about Sergei"});
  await expect(chat).toBeVisible();
  await expect(chat).toHaveJSProperty("open", true);
  await chat.getByRole("button", {name:"Menu"}).click();
  await expect(chat).toBeHidden();
  await expect(page.getByRole("dialog", {name:"Explore the portfolio"})).toBeVisible();
  await page.getByRole("button", {name:"Close menu"}).click();
  await expect(page.getByRole("dialog", {name:"Explore the portfolio"})).toBeHidden();
});


test("mobile chat releases body scroll lock when resized to desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Ask about Sergei" })).toBeVisible();

  const overflow = () => page.evaluate(() => document.body.style.overflow);
  await expect.poll(overflow).toBe("hidden");

  // At desktop widths the chat is no longer a modal dialog.
  await page.setViewportSize({ width: 1100, height: 844 });
  await expect.poll(overflow).not.toBe("hidden");

  // Switching back to mobile should reinstate the scroll lock.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(overflow).toBe("hidden");

  await page.getByRole("button", { name: "Close portfolio assistant" }).click();
  await expect.poll(overflow).not.toBe("hidden");
});
