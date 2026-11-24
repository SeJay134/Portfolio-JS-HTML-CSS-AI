import React, { useState } from "react";
import { articlePath, blogDate, filterPosts, type BlogPost } from "../data/blog";
import { Icon } from "./Icon";

function Cover({ post }: { post: BlogPost }) {
  const cover = post.cover;
  return cover ? <img className="blog-cover" src={cover.src} alt={cover.alt} width={cover.width} height={cover.height} loading="lazy" decoding="async" /> : null;
}

function Metadata({ post }: { post: BlogPost }) {
  return <p className="blog-meta"><time dateTime={post.publishedAt}>{blogDate(post.publishedAt)}</time><span>{post.readingMinutes} min read</span></p>;
}

function ArticleCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  return (
    <article className={featured ? "blog-card blog-featured" : "blog-card"}>
      <Cover post={post} />
      <div className="blog-card-body">
        <p className="eyebrow">{featured ? "Featured / " : ""}{post.category}</p>
        <h3><a href={articlePath(post.slug)}>{post.title}</a></h3>
        <p className="blog-description">{post.description}</p>
        <Metadata post={post} />
        <a className="text-link" href={articlePath(post.slug)} aria-label={`Read article: ${post.title}`}>Read article <Icon name="arrow" size={16} /></a>
      </div>
    </article>
  );
}

export function BlogCatalogue({ posts }: { posts: readonly BlogPost[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = Array.from(new Set(posts.map((post) => post.category))).sort();
  const matches = filterPosts(posts, query, category);
  const featured = !query.trim() && !category ? matches.find((post) => post.featured) : undefined;
  const remaining = matches.filter((post) => post !== featured);
  return (
    <section className="blog-catalogue" aria-labelledby="latest-articles">
      <div className="section-heading">
        <div><p className="eyebrow">From the notebook</p><h2 id="latest-articles">Latest articles</h2></div>
        <p role="status">{matches.length} {matches.length === 1 ? "published article" : "published articles"}</p>
      </div>
      {posts.length > 0 && <div className="blog-controls">
        <label>Search articles<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, topic or tag" /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        {(query || category) && <button className="button secondary" type="button" onClick={() => { setQuery(""); setCategory(""); }}>Clear filters</button>}
      </div>}
      {posts.length === 0 ? <div className="blog-empty">
        <p className="eyebrow">Coming soon</p><h3>No articles published yet.</h3>
        <p>New articles will appear here when they are published.</p>
        <a className="text-link" href="/#Projects">Explore selected projects <Icon name="arrow" size={16} /></a>
      </div> : matches.length === 0 ? <div className="blog-empty"><h3>No matching articles.</h3><p>Try a different search or category.</p></div> : <>
        {featured && <ArticleCard post={featured} featured />}
        <div className="blog-grid">{remaining.map((post) => <ArticleCard key={post.slug} post={post} />)}</div>
      </>}
    </section>
  );
}

export function BlogArticle({ post, posts }: { post: BlogPost; posts: readonly BlogPost[] }) {
  const headings = post.blocks.flatMap((block, index) => block.type === "heading" ? [{ text: block.text, id: `section-${index + 1}` }] : []);
  const related = filterPosts(posts, "", post.category).filter((other) => other.slug !== post.slug).slice(0, 3);
  return (
    <article className="blog-article">
      <header className="blog-article-header">
        <p className="eyebrow">{post.category}</p>
        <h1>{post.title}</h1>
        <p className="blog-lead">{post.description}</p>
        <p className="blog-author">By {post.author}</p>
        <Metadata post={post} />
        <ul className="tags" aria-label="Article tags">{post.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        <Cover post={post} />
      </header>
      {headings.length > 0 && <nav className="blog-toc" aria-label="Table of contents"><h2>On this page</h2><ul>{headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ul></nav>}
      <div className="blog-prose">
        {post.blocks.map((block, index) => {
          switch (block.type) {
            case "heading": return <h2 key={index} id={`section-${index + 1}`}>{block.text}</h2>;
            case "paragraph": return <p key={index}>{block.text}</p>;
            case "quote": return <blockquote key={index}>{block.text}</blockquote>;
            case "code": return <div className="blog-code" key={index}>{block.language && <p>{block.language}</p>}<pre><code>{block.text}</code></pre></div>;
            case "list": return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
          }
        })}
      </div>
      {related.length > 0 && <section className="blog-related" aria-labelledby="related-articles"><h2 id="related-articles">Related articles</h2><div className="blog-grid">{related.map((other) => <ArticleCard key={other.slug} post={other} />)}</div></section>}
      <a className="text-link" href="/blog/">← All articles</a>
    </article>
  );
}
