import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PhotoCompressorPage } from "./components/PhotoCompressorPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><PhotoCompressorPage /></StrictMode>,
);
