export type Category = "All" | "Web" | "Data" | "AI";

export type Project = {
  id: "chocolate" | "gdp" | "api" | "portfolio" | "world-happiness" | "life-expectancy" | "mlb-history" | "student-math" | "spam-classifier" | "image-classification";
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
    image: "/images/weather-explorer-preview.webp",
    imageAlt: "Weather app that uses Open-Meteo geocoding and forecast APIs"
  },
  {
    id: "portfolio",
    category: "AI",
    title: "Portfolio website & AI prototype",
    summary:
      "React and TypeScript portfolio with a separately developed Flask/Ollama RAG prototype. The assistant is not enabled on the public site.",
    tags: ["React", "TypeScript", "Flask", "FAISS", "Ollama"],
    demo: "https://sergei-luna.vercel.app",
    repository: "https://github.com/SeJay134/Portfolio-JS-HTML-CSS",
    detail:
      "A separate, not-yet-deployed RAG prototype retrieves reviewed portfolio evidence with FAISS and all-MiniLM-L6-v2 and uses qwen2.5:7b for grounded answers. This public portfolio release does not offer an AI chat interface.",
    image: "/images/portfolio-artwork.webp",
    imageAlt: "React and TypeScript portfolio website with AI assistant interface",
  },
  {
  id: "world-happiness",
  category: "Data",
  title: "World Happiness Analytics Pipeline",
  summary:
    "An end-to-end analytics pipeline using Prefect to automate World Happiness Report data processing and statistical analysis.",
  tags: [
    "Python",
    "Prefect",
    "ETL",
    "Data Analytics",
    "Statistics"
  ],
  repository:
    "https://github.com/SeJay134/World_Happiness_Pipeline",
  detail:
    "Automates multi-year data ingestion, validation, cleaning, transformation, hypothesis testing, correlation analysis, and visualization to explore global happiness trends.",
  image: "/images/world-happiness.webp",
  imageAlt: "World Happiness Analytics Pipeline visualization",
  },
  {
    id: "life-expectancy",
    category: "Data",
    title: "WHO life expectancy analysis",
    summary:
      "Streamlit-based exploration of WHO life expectancy data, health indicators, and country-level trends.",
    tags: ["Python", "Streamlit", "Pandas", "Plotly", "Data Cleaning"],
    repository: "https://github.com/SeJay134/Life-Expectancy-WHO-Python",
    detail:
      "Cleans missing values with mean and median imputation, engineers health and economic features, and uses exploratory plots to examine factors related to life expectancy.",
  },
  {
    id: "mlb-history",
    category: "Data",
    title: "MLB history scraping & dashboard",
    summary:
      "Python data pipeline that collects historical baseball statistics and presents them in an interactive Streamlit dashboard.",
    tags: ["Python", "Selenium", "SQLite", "Streamlit", "Plotly"],
    repository: "https://github.com/SeJay134/WebScraping-and-Dashboard-Proj-Python",
    detail:
      "Extracts historical player and league statistics from Baseball Almanac, imports structured records into SQLite, and offers filters and charts for MLB seasons and players.",
  },
  {
    id: "student-math",
    category: "AI",
    title: "Student grade prediction",
    summary:
      "Exploratory analysis and regression models to understand and predict final student math grades.",
    tags: ["Python", "Pandas", "scikit-learn", "Regression"],
    repository: "https://github.com/SeJay134/student_math_performance_analysis_and_grade_prediction",
    detail:
      "Analyzes academic and demographic factors, handles students who did not take the final exam, and compares baseline and feature-rich linear regression models using RMSE and R².",
  },
  {
    id: "spam-classifier",
    category: "AI",
    title: "Spam classifier comparison",
    summary:
      "Machine learning study comparing several classifiers on the UCI Spambase email dataset.",
    tags: ["Python", "scikit-learn", "PCA", "Classification"],
    repository: "https://github.com/SeJay134/Spam_Classification_with_Machine_Learning-_A_Classifier_Shootout",
    detail:
      "Benchmarks KNN, decision trees, random forests, and logistic regression with scaling, PCA, five-fold cross-validation, and precision, recall, and F1 evaluation.",
  },
  {
    id: "image-classification",
    category: "AI",
    title: "Image classification with PyTorch",
    summary:
      "Comparison of pretrained CNNs on six outdoor scene categories, including inference speed and transfer learning.",
    tags: ["Python", "PyTorch", "TorchVision", "CNN", "Transfer Learning"],
    repository: "https://github.com/SeJay134/Image_Classification_with_Pretrained_CNNs_-PyTorch-",
    detail:
      "Evaluates ResNet18, MobileNetV3-Small, and EfficientNet-B0 using confidence and latency analysis, PCA feature visualization, and a fine-tuned classification head.",
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
