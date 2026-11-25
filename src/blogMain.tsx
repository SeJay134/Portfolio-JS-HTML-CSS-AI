import React, { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { BlogPage } from "./components/BlogPage";
import "./styles.css";
import "./blog.css";
import { articleForPath } from "./data/blog";
import { isLiveBlogEnabled } from "./data/blogRemote";
import { LiveBlogPage } from "./components/LiveBlogPage";

const root = document.getElementById("root")!;
const pathname = window.location.pathname;
const live = isLiveBlogEnabled();
const article = articleForPath(pathname);
const catalogue = pathname === "/blog" || pathname === "/blog/";
const app = <StrictMode><AuthProvider>{live ? <LiveBlogPage key={pathname} pathname={pathname} /> : article || catalogue ? <BlogPage article={article} /> : <BlogPage articleRoute notice={<section className="blog-empty"><h1>Article not found.</h1><p>This article is not currently published.</p></section>} />}</AuthProvider></StrictMode>;
if (!live && root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
