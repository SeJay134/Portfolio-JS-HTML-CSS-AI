import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PhotoCompressorPage } from "./components/PhotoCompressorPage";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AuthProvider><RequireAuth toolName="Photo Compressor"><PhotoCompressorPage /></RequireAuth></AuthProvider></StrictMode>,
);
