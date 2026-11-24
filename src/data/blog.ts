export type BlogBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string; language?: string }
  | { type: "list"; items: readonly string[] };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: readonly string[];
  author: string;
  publishedAt: string;
  readingMinutes: number;
  featured?: boolean;
  cover?: { src: string; alt: string; width: number; height: number };
  blocks: readonly BlogBlock[];
};

// This module is public and bundled into the static site. Only reviewed,
// published articles belong here. Drafts will live in protected storage later.
export const publishedPosts: readonly BlogPost[] = [];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function articlePath(slug: string): string {
  if (!SLUG.test(slug)) throw new Error("Invalid article slug");
  return `/blog/${slug}/`;
}

export function articleForPath(pathname: string, posts: readonly BlogPost[] = publishedPosts): BlogPost | undefined {
  return posts.find((post) => {
    const path = articlePath(post.slug);
    return pathname === path || pathname === path.slice(0, -1);
  });
}

export function filterPosts(posts: readonly BlogPost[], query = "", category = ""): BlogPost[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return posts.filter((post) => {
    const text = [post.title, post.description, post.category, ...post.tags].join(" ").toLowerCase();
    return (!category || post.category === category) && words.every((word) => text.includes(word));
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}

export function blogDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date));
}

export function validatePosts(posts: readonly BlogPost[]): void {
  const seen = new Set<string>();
  for (const post of posts) {
    articlePath(post.slug);
    if (seen.has(post.slug)) throw new Error("Duplicate blog slug: " + post.slug);
    seen.add(post.slug);
    if (!post.title.trim() || !post.description.trim() || !post.author.trim() || !post.category.trim() ||
      !Number.isFinite(Date.parse(post.publishedAt)) || !Number.isInteger(post.readingMinutes) ||
      post.readingMinutes < 1 || !post.blocks.length) throw new Error("Incomplete blog post: " + post.slug);
    if (post.cover && (!/^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(post.cover.src) ||
      post.cover.src.split("/").includes("..") || !post.cover.alt.trim() ||
      !Number.isInteger(post.cover.width) || !Number.isInteger(post.cover.height) ||
      post.cover.width < 1 || post.cover.height < 1)) throw new Error("Invalid blog cover: " + post.slug);
  }
}
