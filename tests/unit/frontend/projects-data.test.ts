import { describe, expect, it } from "vitest";
import { filterProjects, projects } from "../../../src/data/projects";

const expectedRepositories = {
  chocolate: "https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python",
  gdp: "https://github.com/SeJay134/GDP-Dashboard-Python",
  api: "https://github.com/SeJay134/Open-API-Project-JS",
  portfolio: "https://github.com/SeJay134/Portfolio-JS-HTML-CSS",
} as const;

describe("standalone public project data contract", () => {
  it("contains four curated local project records with unique IDs", () => {
    expect(projects.map((project) => project.id)).toEqual([
      "chocolate", "gdp", "api", "portfolio",
    ]);
    expect(new Set(projects.map((project) => project.id)).size).toBe(projects.length);
  });

  it("uses reviewed repository URLs without importing private RAG knowledge", () => {
    for (const project of projects) {
      expect(project.repository).toBe(expectedRepositories[project.id]);
      expect(project.summary.trim().length).toBeGreaterThan(20);
      expect(project.detail.trim().length).toBeGreaterThan(20);
    }
  });

  it("keeps preview assets local, optimized and meaningfully described", () => {
    for (const project of projects) {
      if (!project.image) continue;
      expect(project.image).toMatch(/^\/images\/[^/]+\.webp$/);
      expect(project.imageAlt?.trim().length).toBeGreaterThan(20);
    }
  });

  it("filters local project data and supports an explicit empty state", () => {
    expect(filterProjects(projects, "AI").map((project) => project.id)).toEqual(["portfolio"]);
    expect(filterProjects(projects, "All")).toHaveLength(4);
    expect(filterProjects([], "Data")).toEqual([]);
  });

  it("only contains valid category and HTTPS external links", () => {
    for (const project of projects) {
      expect(["Web", "Data", "AI"]).toContain(project.category);
      expect(new URL(project.repository).protocol).toBe("https:");
      if (project.demo) expect(new URL(project.demo).protocol).toBe("https:");
    }
  });
});
