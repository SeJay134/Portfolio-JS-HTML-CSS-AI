import { lstat, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Only remove conflicting generated files, never repository source or arbitrary paths.
export async function prepareSeoPreview(env, root = process.cwd()) {
  if (env.VERCEL_ENV !== "preview" || env.BLOG_SEO_PREVIEW !== "true" ||
      env.VITE_ENABLE_LIVE_BLOG !== "true" || !/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "")) {
    throw new Error("SEO preview build requires explicit Preview flags and exact Git revision");
  }
  const dist = resolve(root, "dist");
  for (const dir of [dist, resolve(dist,"blog"), resolve(dist,"blog-article")]) {
    if (!(await lstat(dir)).isDirectory()) throw new Error("Unexpected preview build directory");
  }
  const blogEntries = await readdir(resolve(dist,"blog"));
  if (blogEntries.length !== 1 || blogEntries[0] !== "index.html") throw new Error("Static blog snapshots are not allowed");
  const files = ["blog/index.html", "sitemap.xml", "blog-article/index.html"];
  for (const file of files) if (!(await lstat(resolve(dist,file))).isFile()) throw new Error("Unexpected preview build file");
  await unlink(resolve(dist,"blog/index.html"));
  await unlink(resolve(dist,"sitemap.xml"));
  // Keep the built article shell for function CSS extraction.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareSeoPreview(process.env);
  console.log("SEO Preview build: static route collisions removed");
}
