import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileConverterPage } from "./components/FileConverterPage";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AuthProvider><RequireAuth toolName="File Converter"><FileConverterPage /></RequireAuth></AuthProvider></StrictMode>,
);
