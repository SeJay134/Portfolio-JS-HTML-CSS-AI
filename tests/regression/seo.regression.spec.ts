import { test, expect } from "@playwright/test";

const origin = "https://sergei-luna.vercel.app";
const description =
  "Explore Sergei Patrushev's software development portfolio: responsive web applications, Python dashboards, data projects, and applied AI prototypes.";
const socialDescription =
  "Thoughtful interfaces. Meaningful data. Practical AI. Explore my selected projects.";
const image = `${origin}/images/social-card.png`;
const imageAlt =
  "Sergei Patrushev portfolio preview featuring software, data, and AI projects.";

test("SEO metadata remains canonical and consistent across filtered deep links", async ({
  page,
}) => {
  await page.goto("/?category=AI#Projects");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.title()).toBe("Sergei Patrushev — Software, Data & AI");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/`,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    `${origin}/`,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    await page.title(),
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    socialDescription,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    image,
  );
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute(
    "content",
    "image/png",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
    "content",
    "630",
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    imageAlt,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
    "content",
    await page.title(),
  );
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
    "content",
    socialDescription,
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    image,
  );
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
    "content",
    imageAlt,
  );
});

test("robots, sitemap, favicon, and share image serve the declared assets", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(
    `Sitemap: ${origin}/sitemap.xml`,
  );

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(`<loc>${origin}/</loc>`);

  const favicon = await request.get("/favicon.svg");
  expect(favicon.ok()).toBe(true);
  expect(await favicon.text()).toContain("<svg");

  const socialCard = await request.get("/images/social-card.png");
  expect(socialCard.ok()).toBe(true);
  expect(socialCard.headers()["content-type"]).toContain("image/png");
  const data = await socialCard.body();
  expect(Array.from(data.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(data.readUInt32BE(16)).toBe(1200);
  expect(data.readUInt32BE(20)).toBe(630);
});

test("production HTML has crawlable project content and correct landmarks", async ({
  request,
  page,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('id="root"');
  expect(html).toContain('id="Projects"');
  expect(html).toContain("Chocolate sales dashboard");
  expect(html).toContain('id="Connect"');

  await page.goto("/");
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("header.site-header")).toHaveCount(1);
  await expect(page.locator("footer.site-footer")).toHaveCount(1);
  for (const section of [
    "Projects",
    "Skills",
    "Experience",
    "About",
    "Connect",
  ]) {
    await expect(page.locator(`#${section} h2`)).toHaveCount(1);
  }
});
