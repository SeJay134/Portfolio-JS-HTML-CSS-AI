import React from "react";
import { useEffect, useState } from "react";
import {
  filterProjects,
  projects,
  type Category,
  type Project,
} from "../data/projects";
import { Icon } from "./Icon";
const categories: Category[] = ["All", "Web", "Data", "AI"];

function ProjectImage({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);

  if (!project.image || failed) {
    return (
      <div className="code-art image-fallback" aria-hidden="true">
        <span className="code-muted">Preview unavailable</span>
        <strong>{project.title}</strong>
      </div>
    );
  }

  return (
    <img
      src={project.image}
      alt={project.imageAlt ?? `${project.title} preview`}
      loading="lazy"
      decoding="async"
      width="800"
      height="500"
      onError={() => setFailed(true)}
    />
  );
}

export function Projects() {
  const [filter, setFilter] = useState<Category>("All");
  const visibleProjects = filterProjects(projects, filter);
  useEffect(() => {
    function sync() {
      const value = new URLSearchParams(location.search).get(
        "category",
      ) as Category;
      setFilter(categories.includes(value) ? value : "All");
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function select(category: Category) {
    if (category === filter) return;
    setFilter(category);
    const url = new URL(location.href);
    if (category === "All") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    history.pushState(null, "", url);
  }
  return (
    <section id="Projects" tabIndex={-1} className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / Selected work</p>
          <h2>
            Built to explore.
            <br />
            Made to work.
          </h2>
        </div>
        <p>
          A selection of web applications, data tools,
          <br className="desktop-break" /> and experiments in applied AI.
        </p>
      </div>
      <div className="filters" role="group" aria-label="Filter projects">
        {categories.map((c) => (
          <button key={c} aria-pressed={filter === c} onClick={() => select(c)}>
            {c}
            <span>
              {c === "All"
                ? projects.length
                : projects.filter((p) => p.category === c).length}
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {visibleProjects.length
          ? `${visibleProjects.length} projects shown`
          : `No ${filter} projects are available right now.`}
      </p>
      <div className="project-grid">
        {visibleProjects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className={`project-art art-${project.id}`}>
                {project.image ? (
                  <ProjectImage project={project} />
                ) : (
                  <div className="code-art" aria-hidden="true">
                    {project.id === "portfolio" ? (
                      <>
                        <span className="node-label">question</span>
                        <span className="node-line" />
                        <span className="node-label accent-label">
                          retrieve → reason
                        </span>
                        <span className="node-line" />
                        <span className="node-label">grounded answer</span>
                      </>
                    ) : (
                      <>
                        <span className="code-muted">
                          const response = await
                        </span>
                        <strong>fetch(possibilities)</strong>
                        <span className="code-muted">
                          // turn data into something useful
                        </span>
                      </>
                    )}
                  </div>
                )}
                <span className="art-category">{project.category}</span>
              </div>
              <div className="project-body">
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <ul className="tags" aria-label="Technologies">
                  {project.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="project-actions">
                  {project.demo && (
                    <a href={project.demo} target="_blank" rel="noreferrer">
                      Live demo <Icon name="arrow" size={16} />
                    </a>
                  )}
                  <a href={project.repository} target="_blank" rel="noreferrer">
                    Source code <Icon name="github" size={16} />
                  </a>
                </div>
                <details>
                  <summary>Behind the project</summary>
                  <p>{project.detail}</p>
                </details>
              </div>
            </article>
          ))}
        {!visibleProjects.length && (
          <p className="projects-empty">
            No {filter} projects are available right now. Try another filter.
          </p>
        )}
      </div>
      <a
        className="text-link all-projects"
        href="https://github.com/SeJay134?tab=repositories"
        target="_blank"
        rel="noreferrer"
      >
        Explore more on GitHub <Icon name="arrow" />
      </a>
    </section>
  );
}
