import React from "react";
import { RequireBlogAdmin } from "../auth/RequireBlogAdmin";
import { AccountMenu } from "../auth/AccountMenu";
import { BlogStudioWorkspace } from "./BlogStudioWorkspace";
import { useTheme } from "../hooks/useTheme";

export function BlogAdminPage() {
  const { theme, selectTheme } = useTheme();
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <a className="wordmark" href="/" aria-label="Portfolio home">SP<span>.</span></a>
      <div className="header-actions">
        <label className="sr-only" htmlFor="admin-theme">Color theme</label>
        <select id="admin-theme" value={theme} onChange={(event) => selectTheme(event.target.value)}>
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
        <AccountMenu />
      </div>
    </div></header>
    <main id="main" tabIndex={-1} className="section blog-main">
      <a className="text-link" href="/blog/">← Back to blog</a>
      <div className="blog-intro"><p className="eyebrow">Private workspace</p><h1>Blog Studio</h1></div>
      <section className={import.meta.env.VITE_ENABLE_BLOG_EDITOR === "true" ? "studio-gate" : "blog-empty"} aria-label="Administrator access">
        <RequireBlogAdmin>
          {import.meta.env.VITE_ENABLE_BLOG_EDITOR === "true" ? <BlogStudioWorkspace /> : <><h2>Administrator access confirmed</h2>
          <p>Blog Studio editing tools will be added in the next phase.</p></>}
        </RequireBlogAdmin>
      </section>
    </main>
  </>;
}
