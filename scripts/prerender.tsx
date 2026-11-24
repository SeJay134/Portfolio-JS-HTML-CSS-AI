import React from "react";
import { renderToString } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import App from "../src/App";
import { BlogPage } from "../src/components/BlogPage";
import { articlePath, publishedPosts, validatePosts } from "../src/data/blog";
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

validatePosts(publishedPosts);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));
const origin = "https://sergei-luna.vercel.app";
for (const article of publishedPosts) {
  const route = articlePath(article.slug);
  const directory = "dist" + route;
  mkdirSync(directory, { recursive: true });
  const articleHtml = blogHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(article.title)} — Sergei Patrushev</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${escapeHtml(article.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, () => `<link rel="canonical" href="${origin}${route}" />`)
    .replace('<div id="root"></div>', () => `<div id="root">${renderToString(<AuthProvider><BlogPage article={article} /></AuthProvider>)}</div>`);
  writeFileSync(directory + "index.html", articleHtml);
}
const sitemapPath = "dist/sitemap.xml";
const sitemap = readFileSync(sitemapPath, "utf8");
writeFileSync(sitemapPath, sitemap.replace("</urlset>", () =>
  publishedPosts.map((article) => `  <url><loc>${origin}${articlePath(article.slug)}</loc></url>\n`).join("") + "</urlset>",
));
console.log(`Prerendered ${publishedPosts.length} published blog articles.`);
