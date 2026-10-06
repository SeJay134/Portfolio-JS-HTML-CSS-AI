import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    test(`${theme} content remains readable at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
      // Also exercise the layout when the external font service is unavailable.
      await page.route("https://fonts.googleapis.com/**", (route) =>
        route.abort(),
      );
      await page.goto("/");
      await page.getByLabel("Color theme").selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(
        await page
          .locator("main > section")
          .evaluateAll((sections) => sections.map((section) => section.id)),
      ).toEqual([
        "Home",
        "Projects",
        "Skills",
        "Experience",
        "About",
        "Connect",
      ]);
      await expect(page.locator(".effects-toggle")).toHaveCount(0);
      await expect(page.locator("canvas")).toHaveCount(0);

      for (const image of await page.locator("main img").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          )
          .toBe(true);
      }
      for (const summary of await page.locator(".project-card summary").all()) {
        await summary.click();
      }
      await expect(page.locator(".project-card details[open]")).toHaveCount(4);
      const problems = await page.evaluate(() => {
        const problems: string[] = [];
        if (document.documentElement.scrollWidth > innerWidth)
          problems.push("page overflow");
        const selectors =
          ".hero h1, .hero-description, .hero-actions a, .project-body, .code-art, .filters button, .timeline article, .contact-form input, .contact-form textarea";
        for (const element of document.querySelectorAll<HTMLElement>(
          selectors,
        )) {
          const rect = element.getBoundingClientRect();
          if (rect.left < -1 || rect.right > innerWidth + 1)
            problems.push(
              `${element.className || element.tagName}: outside viewport`,
            );
          if (element.scrollWidth > element.clientWidth + 1)
            problems.push(
              `${element.className || element.tagName}: internal overflow`,
            );
          if (element.matches(".code-art")) {
            const parent = element.parentElement!.getBoundingClientRect();
            if (rect.top < parent.top || rect.bottom > parent.bottom)
              problems.push("clipped project illustration");
          }
        }
        return problems;
      });
      expect(problems).toEqual([]);
      if (width === 320 || width === 1440) {
        expect(
          (
            await new AxeBuilder({ page })
              .include("main")
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: testInfo.outputPath(`layout-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    });
  }
}
