import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "../../../src/components/Chat";

const mocks = vi.hoisted(() => ({
  requestAnswer: vi.fn(),
  readiness: vi.fn(),
}));
vi.mock("../../../src/lib/api", () => ({
  requestAnswer: mocks.requestAnswer,
  readiness: mocks.readiness,
  ApiError: class ApiError extends Error {},
}));

beforeEach(() => {
  mocks.readiness.mockReset().mockResolvedValue(true);
  mocks.requestAnswer.mockReset().mockResolvedValue({
    reply: "The Chocolate sales dashboard uses Streamlit.",
    sources: [],
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "show", {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

function openChat() {
  const close = vi.fn();
  const menu = vi.fn();
  render(<Chat open onClose={close} onOpenMenu={menu} />);
  return { close, menu };
}

describe("original React chat behavior", () => {
  it("opens with portfolio prompts, reports local readiness and closes accessibly", async () => {
    const user = userEvent.setup();
    const { close, menu } = openChat();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByText(/What projects has Sergei built/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Assistant online")).toBeInTheDocument());
    await user.click(screen.getByRole("button", {name:"Menu"}));
    expect(menu).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", {name:"Close chat"}));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("sends a question without HTML injection and clears the local transcript", async () => {
    mocks.requestAnswer.mockResolvedValue({
      reply: "<img src=x onerror=alert(1)>",
      sources: [],
    });
    const user = userEvent.setup();
    openChat();
    await user.type(screen.getByLabelText("Your question"), "Which projects?");
    await user.click(screen.getByRole("button", {name:/Send/}));
    await waitFor(() => expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument());
    expect(screen.getByRole("dialog").querySelector("img")).toBeNull();
    expect(mocks.requestAnswer).toHaveBeenCalledWith("Which projects?", expect.anything());
    await user.click(screen.getByRole("button", {name:"Clear chat"}));
    expect(screen.queryByText("Which projects?")).not.toBeInTheDocument();
  });

  it("keeps the draft and retries a failed request without duplicating the user bubble", async () => {
    mocks.requestAnswer
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({reply: "Recovered",sources: []});
    const user = userEvent.setup();
    openChat();
    await user.type(screen.getByLabelText("Your question"), "Explain RAG");
    await user.click(screen.getByRole("button", {name:/Send/}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the assistant"));
    expect(screen.getByLabelText("Your question")).toHaveValue("Explain RAG");
    await user.click(screen.getByRole("button", {name:"Retry"}));
    await waitFor(() => expect(screen.getByText("Recovered")).toBeInTheDocument());
    expect(screen.getByRole("dialog").querySelectorAll(".message.user")).toHaveLength(1);
    expect(mocks.requestAnswer).toHaveBeenCalledTimes(2);
  });

  it("stops a pending request without claiming to cancel the model", async () => {
    mocks.requestAnswer.mockImplementation((_message: string, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    );
    const user = userEvent.setup();
    openChat();
    await user.type(screen.getByLabelText("Your question"), "Explain my work");
    await user.click(screen.getByRole("button", {name:/Send/}));
    await user.click(screen.getByRole("button", {name:"Stop"}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Request stopped"));
    expect(screen.getByLabelText("Your question")).toHaveValue("Explain my work");
  });
});
