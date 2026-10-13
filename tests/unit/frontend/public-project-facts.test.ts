import { expect, it } from "vitest";
import { projects } from "../../../src/data/projects";
import catalog from "../../../content/public-projects.json";

it("keeps RAG's public project facts exactly aligned with reviewed React project data", () => {
  expect(catalog.schema_version).toBe(1);
  expect(catalog.projects).toEqual(projects.map((project) => ({
    id: project.id,
    category: project.category,
    title: project.title,
    summary: project.summary,
    tags: project.tags,
    repository: project.repository,
    detail: project.detail,
  })));
});
