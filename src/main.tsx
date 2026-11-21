import React from "react";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./styles.css";
const root = document.getElementById("root")!;
if (root.hasChildNodes())
  hydrateRoot(
    root,
    <StrictMode>
      <AuthProvider><App /></AuthProvider>
    </StrictMode>,
  );
else
  createRoot(root).render(
    <StrictMode>
      <AuthProvider><App /></AuthProvider>
    </StrictMode>,
  );
