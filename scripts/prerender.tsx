import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import App from "../src/App";
import { BlogPage } from "../src/components/BlogPage";
import { AuthProvider } from "../src/auth/AuthProvider";
const path = "dist/index.html";
const html = readFileSync(path, "utf8");
writeFileSync(
  path,
  html.replace(
    '<div id="root"></div>',
    `<div id="root">${renderToString(<AuthProvider><App /></AuthProvider>)}</div>`,
  ),
);
console.log(
  "Prerendered portfolio content for search engines and no-JavaScript visitors.",
);

const blogPath = "dist/blog/index.html";
const blogHtml = readFileSync(blogPath, "utf8");
writeFileSync(blogPath, blogHtml.replace(
  '<div id="root"></div>',
  `<div id="root">${renderToString(<AuthProvider><BlogPage /></AuthProvider>)}</div>`,
));
console.log("Prerendered the public blog catalogue.");
