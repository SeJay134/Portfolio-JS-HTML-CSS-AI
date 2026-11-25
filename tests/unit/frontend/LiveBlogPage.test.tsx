import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LiveBlogPage } from "../../../src/components/LiveBlogPage";
const mocks = vi.hoisted(() => ({ catalogue: vi.fn(), article: vi.fn() }));
vi.mock("../../../src/data/blogRemote", () => ({
  blogSlugForPath: (path: string) => /^\/blog\/([a-z-]+)\/$/.exec(path)?.[1] ?? null,
  loadBlogCatalogue: mocks.catalogue, loadBlogArticle: mocks.article,
}));
vi.mock("../../../src/components/BlogPage", () => ({
  BlogPage: ({ article, posts, notice }: {article?: {title:string}; posts?: {title:string}[]; notice?: React.ReactNode}) => <main>{notice ?? (article ? <h1>{article.title}</h1> : posts?.map(p => <h2 key={p.title}>{p.title}</h2>))}</main>,
}));
beforeEach(() => { mocks.catalogue.mockReset().mockResolvedValue([]); mocks.article.mockReset().mockResolvedValue(null); });
it("loads catalogue and shows published results", async () => {
  mocks.catalogue.mockResolvedValue([{title:"Published fixture"}]);
  render(<LiveBlogPage pathname="/blog/" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(await screen.findByRole("heading", {name:"Published fixture"})).toBeVisible();
});
it("renders a direct slug without prior catalogue navigation", async () => {
  mocks.article.mockResolvedValue({title:"Direct fixture"});
  render(<LiveBlogPage pathname="/blog/direct-fixture/" />);
  expect(await screen.findByRole("heading", {name:"Direct fixture"})).toBeVisible();
  expect(mocks.article).toHaveBeenCalledWith("direct-fixture", expect.any(AbortSignal));
});
it("does not show catalogue for a missing slug", async () => {
  render(<LiveBlogPage pathname="/blog/missing/" />);
  expect(await screen.findByRole("heading", {name:"Article not found."})).toBeVisible();
  expect(mocks.catalogue).not.toHaveBeenCalled();
});
it("shows safe error and supports retry without stale content", async () => {
  mocks.catalogue.mockRejectedValueOnce(new Error("private error")).mockResolvedValueOnce([{title:"Recovered fixture"}]);
  render(<LiveBlogPage pathname="/blog/" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Please try again later.");
  expect(screen.queryByText("private error")).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button",{name:"Retry"}));
  expect(await screen.findByRole("heading",{name:"Recovered fixture"})).toBeVisible();
});
