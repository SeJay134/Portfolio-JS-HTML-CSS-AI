import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Collaborations } from "../../../src/components/Collaborations";

const landingPath = "collaborations/light-up-media-signs/index.html";
const canonical =
  "https://sergei-luna.vercel.app/collaborations/light-up-media-signs/";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Light Up collaboration SEO", () => {
  it("links the portfolio card to an actual standalone page", () => {
    render(<Collaborations />);
    const link = screen.getByRole("link", { name: /read about the collaboration/i });
    expect(link.getAttribute("href")).toBe("/collaborations/light-up-media-signs/");
  });

  it("provides static indexable content with unique metadata and a qualified business relationship", () => {
    const html = source(landingPath);
    expect(html).toContain('<link rel="canonical" href="' + canonical + '"');
    expect(html).toContain("<h1");
    expect(html).toContain("Light Up");
    expect(html).toContain("Business Collaboration");
    expect(html).toContain("Light Up Media &amp; Signs LLC is an independent organization");
    expect(html).toContain("https://www.lightupmediasigns.com/");
    expect(html).toContain("https://schema.org");
    expect(html).toContain('"@type": "WebPage"');
    expect(html).toContain('"name": "Sergei Patrushev"');
    expect(html).not.toMatch(/noindex/i);
  });

  it("includes the page in the Vite entrypoints and sitemap for discovery", () => {
    const vite = source("vite.config.ts");
    const sitemap = source("public/sitemap.xml");
    const robots = source("public/robots.txt");
    expect(vite).toContain(landingPath);
    expect(sitemap).toContain("<loc>" + canonical + "</loc>");
    expect(robots).toContain("Sitemap: https://sergei-luna.vercel.app/sitemap.xml");
  });
});
