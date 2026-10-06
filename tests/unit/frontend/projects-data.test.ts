import { describe, expect, it } from "vitest";
import knowledge from "../../../content/knowledge.json";
import {
  filterProjects,
  projects,
} from "../../../src/data/projects";

const projectKnowledge = new Map(
  knowledge
    .filter((entry) => entry.doc_id === "projects")
    .map((entry) => [entry.id, entry]),
);

describe("reviewed project data contract", () => {
  it("contains exactly the four reviewed project records", () => {
    expect(projects.map((project) => project.id)).toEqual([
      "chocolate",
      "gdp",
      "api",
      "portfolio",
    ]);
    expect(new Set(projects.map((project) => project.id)).size).toBe(
      projects.length,
    );
  });

  it("keeps repository URLs aligned with the RAG knowledge source", () => {
    for (const project of projects) {
      const evidence = projectKnowledge.get(
        project.id === "portfolio" ? "assistant" : project.id,
      );
      expect(evidence, `missing RAG evidence for ${project.id}`).toBeDefined();
      expect(project.repository).toBe(evidence?.url);
    }
  });

  it("keeps preview assets local, optimized, and meaningfully described", () => {
    for (const project of projects) {
      if (!project.image) continue;
      expect(project.image).toMatch(/^\/images\/[^/]+\.webp$/);
      expect(project.imageAlt?.trim().length).toBeGreaterThan(20);
    }
  });

  it("filters local project data and keeps an explicit empty-state contract", () => {
    expect(filterProjects(projects, "AI").map((project) => project.id)).toEqual([
      "portfolio",
    ]);
    expect(filterProjects(projects, "All")).toHaveLength(4);
    expect(filterProjects([], "Data")).toEqual([]);
  });

  it("uses only supported categories and absolute HTTPS external URLs", () => {
    for (const project of projects) {
      expect(["Web", "Data", "AI"]).toContain(project.category);
      expect(new URL(project.repository).protocol).toBe("https:");
      if (project.demo) expect(new URL(project.demo).protocol).toBe("https:");
    }
  });
});
