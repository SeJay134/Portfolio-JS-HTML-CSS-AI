import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileConverterPage } from "./components/FileConverterPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><FileConverterPage /></StrictMode>,
);
