import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Collaborations } from "../../../src/components/Collaborations";

describe("Collaborations", () => {
  it("identifies an external collaboration and links safely to the business", () => {
    render(<Collaborations />);
    expect(
      screen.getByRole("heading", { name: "Light Up Media & Signs" }),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: /explore website/i });
    expect(link.getAttribute("href")).toBe("https://www.lightupmediasigns.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText(/independent external website/i)).toBeTruthy();
  });

  it("labels the illustration as an illustration and the next venture as planned", () => {
    render(<Collaborations />);
    expect(
      screen.getByRole("img", { name: /illustrative browser preview/i }),
    ).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
  });
});
