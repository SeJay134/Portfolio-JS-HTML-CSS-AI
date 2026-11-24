import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { Projects } from "../../../src/components/Projects";
import { beforeEach, it, expect, vi } from "vitest";
beforeEach(() => {
  history.replaceState(null, "", "/");
});

it("does not add browser history when the selected category is pressed again", async () => {
  const user = userEvent.setup();
  render(<Projects />);
  const pushState = vi.spyOn(history, "pushState");
  try {
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(pushState).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^AI/ }));
    await user.click(screen.getByRole("button", { name: /^AI/ }));
    expect(pushState).toHaveBeenCalledTimes(1);
  } finally {
    pushState.mockRestore();
  }
});
it("filters local project content without requiring a network request", async () => {
  const user = userEvent.setup();
  render(<Projects />);
  expect(screen.getAllByRole("article")).toHaveLength(10);
  await user.click(screen.getByRole("button", { name: /^AI/ }));
  expect(screen.getAllByRole("article")).toHaveLength(4);
  expect(
    screen.getByRole("heading", { name: "Portfolio website & AI prototype" }),
  ).toBeVisible();
  expect(location.search).toContain("category=AI");
  await user.click(screen.getByRole("button", { name: /^Data/ }));
  expect(screen.getAllByRole("article")).toHaveLength(5);
  await user.click(screen.getByRole("button", { name: /^Web/ }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: /^All/ }));
  expect(screen.getAllByRole("article")).toHaveLength(10);
});

const previewAlt = "Chocolate sales dashboard with filters and sales visualizations.";

it("shows the fallback when a project preview fails after mounting", () => {
  render(<Projects />);
  fireEvent.error(screen.getByAltText(previewAlt));
  expect(screen.queryByAltText(previewAlt)).not.toBeInTheDocument();
  expect(screen.getByText("Preview unavailable")).toBeVisible();
});

it("recovers a prerendered preview that failed before React hydration", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Projects />);
  const image = container.querySelector<HTMLImageElement>('img[src="/images/chocolate.webp"]')!;
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 0 });
  document.body.appendChild(container);
  try {
    const view = render(<Projects />, { container, hydrate: true });
    expect(view.queryByAltText(previewAlt)).not.toBeInTheDocument();
    expect(view.getByText("Preview unavailable")).toBeVisible();
    view.unmount();
  } finally {
    container.remove();
  }
});
