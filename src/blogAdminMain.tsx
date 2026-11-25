import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { BlogAdminPage } from "./components/BlogAdminPage";
import "./styles.css";
import "./blog.css";
createRoot(document.getElementById("root")!).render(<StrictMode><AuthProvider><BlogAdminPage /></AuthProvider></StrictMode>);
