import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import App from "../src/App";
const path = "dist/index.html";
const html = readFileSync(path, "utf8");
writeFileSync(
  path,
  html.replace(
    '<div id="root"></div>',
    `<div id="root">${renderToString(<App />)}</div>`,
  ),
);
console.log(
  "Prerendered portfolio content for search engines and no-JavaScript visitors.",
);
