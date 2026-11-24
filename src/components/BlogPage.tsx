import React, { useEffect, useRef, useState } from "react";
import { AccountMenu } from "../auth/AccountMenu";
import { useTheme } from "../hooks/useTheme";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { BlogArticle, BlogCatalogue } from "./BlogContent";
import { publishedPosts, type BlogPost } from "../data/blog";

export function BlogPage({ article }: { article?: BlogPost } = {}) {
  const { theme, selectTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [menu]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-left">
            <button ref={menuButton} className="menu-button" type="button"
              aria-expanded={menu} aria-controls="navigation-drawer"
              onClick={() => setMenu(true)}>
              <Icon name="menu" /><span>Menu</span>
            </button>
            <a className="wordmark" href="/" aria-label="Sergei Patrushev, home">SP<span>.</span></a>
          </div>
          <span className="header-caption">Software developer / Data &amp; AI</span>
          <div className="header-actions">
            <label className="sr-only" htmlFor="blog-theme">Color theme</label>
            <select id="blog-theme" value={theme} onChange={(event) => selectTheme(event.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <AccountMenu />
            <a className="header-contact" href="/#Connect">Let's talk <Icon name="arrow" size={16} /></a>
          </div>
        </div>
      </header>
      <Drawer open={menu} activePage="blog" sectionHrefPrefix="/"
        onClose={() => { setMenu(false); requestAnimationFrame(() => menuButton.current?.focus({ preventScroll: true })); }} />
      <main id="main" tabIndex={-1} className="section blog-main">
        {article ? <>
          <a className="text-link" href="/blog/">← Back to blog</a>
          <BlogArticle post={article} posts={publishedPosts} />
        </> : <>
          <a className="text-link" href="/">← Back to portfolio</a>
          <div className="blog-intro">
            <p className="eyebrow">Writing / Insights</p>
            <h1>Blog <span className="serif-accent">&amp; Insights.</span></h1>
            <p>Articles on software development, data, artificial intelligence and personal projects.</p>
          </div>
          <BlogCatalogue posts={publishedPosts} />
        </>}
      </main>
      <footer className="site-footer">
        <a className="wordmark" href="/" aria-label="Portfolio home">SP<span>.</span></a>
        <p>© {new Date().getFullYear()} Sergei Patrushev</p>
        <nav className="footer-legal" aria-label="Legal">
          <a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Service</a>
        </nav>
        <a href="#main">Back to top ↑</a>
      </footer>
    </>
  );
}
