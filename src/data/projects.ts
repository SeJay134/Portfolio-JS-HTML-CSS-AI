export type Category = "All" | "Web" | "Data" | "AI";

export type Project = {
  id: "chocolate" | "gdp" | "api" | "portfolio";
  category: Exclude<Category, "All">;
  title: string;
  summary: string;
  tags: readonly string[];
  image?: string;
  imageAlt?: string;
  demo?: string;
  repository: string;
  detail: string;
};

export const projects: readonly Project[] = [
  {
    id: "chocolate",
    category: "Data",
    title: "Chocolate sales dashboard",
    summary:
      "Interactive Streamlit dashboard for analyzing chocolate sales by country, product, and salesperson.",
    tags: ["Python", "Streamlit", "Pandas", "Plotly"],
    image: "/images/chocolate.webp",
    imageAlt:
      "Chocolate sales dashboard with filters and sales visualizations.",
    demo: "https://sergei-chocolate-sales-dashboard.streamlit.app/",
    repository: "https://github.com/SeJay134/Chocolate-Sales-Dashboard-Python",
    detail:
      "Loads chocolate-sales CSV data, removes missing and duplicate rows, normalizes amount and date fields, and provides filters with line, bar, pie, and table views.",
  },
  {
    id: "gdp",
    category: "Data",
    title: "GDP dashboard",
    summary:
      "Streamlit dashboard for browsing GDP data for countries around the world over time.",
    tags: ["Python", "Streamlit", "Pandas"],
    image: "/images/gdp.webp",
    imageAlt:
      "GDP dashboard with country and year controls and time-series visualizations.",
    demo: "https://gdp-dashboard-99adkaf6mof.streamlit.app/",
    repository: "https://github.com/SeJay134/GDP-Dashboard-Python",
    detail:
      "Loads World Bank GDP data from CSV, reshapes yearly columns into year/value records, filters countries and years, and presents time-series charts and country metrics.",
  },
  {
    id: "api",
    category: "Web",
    title: "Open API weather explorer",
    summary:
      "HTML, CSS, and JavaScript weather app that uses Open-Meteo geocoding and forecast APIs.",
    tags: ["HTML", "CSS", "JavaScript", "Open-Meteo API"],
    demo: "https://open-api-project-vert.vercel.app",
    repository: "https://github.com/SeJay134/Open-API-Project-JS",
    detail:
      "Accepts a city, resolves its coordinates through Open-Meteo geocoding, requests current weather, displays Fahrenheit temperature, and maps weather codes to visual conditions.",
  },
  {
    id: "portfolio",
    category: "AI",
    title: "Portfolio & AI assistant",
    summary:
      "React and TypeScript portfolio with a separate Flask/Ollama RAG assistant grounded in reviewed portfolio evidence.",
    tags: ["React", "TypeScript", "Flask", "FAISS", "Ollama"],
    demo: "https://sergei-luna.vercel.app",
    repository: "https://github.com/SeJay134/Portfolio-JS-HTML-CSS",
    detail:
      "The assistant accepts independent questions, retrieves portfolio evidence with FAISS and all-MiniLM-L6-v2 embeddings, and generates grounded answers with qwen2.5:7b while the portfolio remains usable if the AI backend is offline.",
  },
];


export function filterProjects(
  source: readonly Project[],
  category: Category,
): readonly Project[] {
  return category === "All"
    ? source
    : source.filter((project) => project.category === category);
}
