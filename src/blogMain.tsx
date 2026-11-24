import React, { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { BlogPage } from "./components/BlogPage";
import "./styles.css";
import "./blog.css";

const root = document.getElementById("root")!;
const app = <StrictMode><AuthProvider><BlogPage /></AuthProvider></StrictMode>;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
