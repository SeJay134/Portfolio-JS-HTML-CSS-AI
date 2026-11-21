import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileBottomNav } from "../../../src/components/MobileBottomNav";
import { AiNetworkMark } from "../../../src/components/AiNetworkMark";
import { MobileChatPreview } from "../../../src/components/MobileChatPreview";

describe("mobile portfolio navigation", () => {
  it("keeps five destinations, with Ask AI as the fifth tab", () => {
    const toggle = vi.fn();
    const navigate = vi.fn();
    render(
      <MobileBottomNav
        active="Home"
        chatOpen={false}
        onToggleChat={toggle}
        onNavigate={navigate}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    const destinations = Array.from(nav.querySelectorAll("a, button"));
    expect(destinations).toHaveLength(5);
    expect(destinations.map((element) => element.textContent?.trim())).toEqual([
      "Work",
      "Experience",
      "About",
      "Contact",
      "Ask AI",
    ]);
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("href", "#Projects");
    expect(screen.getByRole("button", { name: "Ask AI" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(toggle).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Contact" }));
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("shows Ask AI selected while the panel is open", () => {
    render(
      <MobileBottomNav
        active="Experience"
        chatOpen
        onToggleChat={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Ask AI" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Experience" })).not.toHaveAttribute("aria-current");
  });
});

describe("unconnected mobile AI preview", () => {
  it("allows visual prompt preview but does not submit AI requests", () => {
    const close = vi.fn();
    render(<MobileChatPreview onClose={close} />);
    const dialog = screen.getByRole("dialog", { name: "Ask AI UI preview" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(screen.getByText("Design preview — no AI requests are sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show me Sergei's projects/ }));
    expect(screen.getByText("UI preview only.", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(close).toHaveBeenCalledOnce();
  });
});


describe("original-style AI particle badge", () => {
  it("renders eight independently moving nodes and 28 possible proximity connections", () => {
    const { container } = render(<AiNetworkMark />);
    expect(container.querySelectorAll(".ai-network-dots circle")).toHaveLength(8);
    expect(container.querySelectorAll(".ai-network-halos circle")).toHaveLength(8);
    expect(container.querySelectorAll(".ai-network-links line")).toHaveLength(28);
    expect(container.querySelector(".ai-network-mark")).toHaveAttribute("aria-hidden", "true");
  });
});
