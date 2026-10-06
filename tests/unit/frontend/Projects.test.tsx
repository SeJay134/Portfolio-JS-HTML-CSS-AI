import React from "react";
import { render, screen } from "@testing-library/react";
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
  expect(screen.getAllByRole("article")).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: /^AI/ }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "Portfolio website & AI prototype" }),
  ).toBeVisible();
  expect(location.search).toContain("category=AI");
  await user.click(screen.getByRole("button", { name: /^All/ }));
  expect(screen.getAllByRole("article")).toHaveLength(4);
});
