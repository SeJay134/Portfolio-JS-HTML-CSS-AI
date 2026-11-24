import React, { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { BlogPage } from "./components/BlogPage";
import "./styles.css";
import "./blog.css";
import { articleForPath } from "./data/blog";

const root = document.getElementById("root")!;
const app = <StrictMode><AuthProvider><BlogPage article={articleForPath(window.location.pathname)} /></AuthProvider></StrictMode>;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
