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

  await page.getByRole("dialog", { name: "Ask about Sergei" })
    .getByRole("button", { name: "Close chat" }).click();
  await expect.poll(overflow).not.toBe("hidden");
});


test("503 changes online status to temporarily unavailable and Retry restores it", async ({ page }) => {
  let calls = 0;
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:5001",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  await page.route("http://127.0.0.1:5002/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
    } else if (request.url().endsWith("/ready")) {
      await route.fulfill({
        status: 200, contentType: "application/json", headers: cors,
        body: JSON.stringify({ status: "ready" }),
      });
    } else if (request.url().endsWith("/chat")) {
      calls++;
      await route.fulfill({
        status: calls === 1 ? 503 : 200,
        contentType: "application/json",
        headers: cors,
        body: calls === 1
          ? JSON.stringify({ error: "Temporary outage" })
          : JSON.stringify({ reply: "Recovered assistant response", sources: [] }),
      });
    } else {
      await route.abort();
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  const chat = page.getByRole("dialog", { name: "Ask about Sergei" });
  await expect(chat.getByText("Assistant online", { exact: true })).toBeVisible();
  await chat.getByLabel("Your question").fill("Tell me about Python");
  await chat.getByRole("button", { name: /Send/ }).click();
  await expect(chat.getByText("Assistant temporarily unavailable")).toBeVisible();
  await expect(chat.getByText("Assistant online", { exact: true })).toHaveCount(0);
  await expect(chat.getByRole("alert")).toContainText("unavailable or taking too long");
  await chat.getByRole("button", { name: "Retry" }).click();
  await expect(chat.getByText("Recovered assistant response")).toBeVisible();
  await expect(chat.getByText("Assistant online", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test("a delayed successful /ready cannot overwrite a later 503", async ({ page }) => {
  let releaseReady: (() => void) | undefined;
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:5001",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  await page.route("http://127.0.0.1:5002/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
    } else if (request.url().endsWith("/ready")) {
      await new Promise<void>((resolve) => { releaseReady = resolve; });
      await route.fulfill({
        status: 200, contentType: "application/json", headers: cors,
        body: JSON.stringify({ status: "ready" }),
      });
    } else if (request.url().endsWith("/chat")) {
      await route.fulfill({
        status: 503, contentType: "application/json", headers: cors,
        body: JSON.stringify({ error: "Unavailable" }),
      });
    } else {
      await route.abort();
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  const chat = page.getByRole("dialog", { name: "Ask about Sergei" });
  await expect.poll(() => Boolean(releaseReady)).toBe(true);
  await chat.getByLabel("Your question").fill("Which projects?");
  await chat.getByRole("button", { name: /Send/ }).click();
  await expect(chat.getByText("Assistant temporarily unavailable")).toBeVisible();
  releaseReady?.();
  await expect(chat.getByText("Assistant online", { exact: true })).toHaveCount(0);
  await expect(chat.getByText("Assistant temporarily unavailable")).toBeVisible();
});

test("429 is rate limited, not offline, and Retry can recover", async ({ page }) => {
  let calls = 0;
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:5001",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  await page.route("http://127.0.0.1:5002/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
    } else if (request.url().endsWith("/ready")) {
      await route.fulfill({
        status: 200, contentType: "application/json", headers: cors,
        body: JSON.stringify({ status: "ready" }),
      });
    } else if (request.url().endsWith("/chat")) {
      calls++;
      await route.fulfill({
        status: calls === 1 ? 429 : 200,
        contentType: "application/json", headers: cors,
        body: calls === 1
          ? JSON.stringify({ error: "Rate limited" })
          : JSON.stringify({ reply: "Assistant recovered", sources: [] }),
      });
    } else {
      await route.abort();
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open portfolio assistant" }).click();
  const chat = page.getByRole("dialog", { name: "Ask about Sergei" });
  await expect(chat.getByText("Assistant online", { exact: true })).toBeVisible();
  await chat.getByLabel("Your question").fill("What projects?");
  await chat.getByRole("button", { name: /Send/ }).click();
  await expect(chat.getByText("Assistant rate limited")).toBeVisible();
  await expect(chat.getByRole("alert")).toContainText("Too many requests");
  await chat.getByRole("button", { name: "Retry" }).click();
  await expect(chat.getByText("Assistant recovered")).toBeVisible();
  await expect(chat.getByText("Assistant online", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});
