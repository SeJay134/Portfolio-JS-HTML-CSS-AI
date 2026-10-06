import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Contact } from "../../../src/components/Contact";
import { it, expect, vi } from "vitest";

async function prepare(message = "Hello about a project & an opportunity") {
  const user = userEvent.setup();
  render(<Contact />);
  await user.type(screen.getByLabelText("Your name"), "Alex");
  await user.type(screen.getByLabelText("Email"), "alex@example.com");
  await user.type(
    screen.getByLabelText("What would you like to talk about?"),
    message,
  );
  await user.click(screen.getByRole("button", { name: "Prepare email" }));
  return user;
}

it("encodes user content without rendering injected HTML or claiming delivery", async () => {
  await prepare("<img src=x onerror=alert(1)>");
  const link = screen.getByRole("link", { name: /Open email app/ });
  expect(link.getAttribute("href")).toContain("%3Cimg");
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("review and send");
});

it("rejects whitespace-only names and messages with focused, associated errors", async () => {
  const user = userEvent.setup();
  render(<Contact />);
  await user.type(screen.getByLabelText("Your name"), "   ");
  await user.type(screen.getByLabelText("Email"), "alex@example.com");
  await user.type(
    screen.getByLabelText("What would you like to talk about?"),
    "  ",
  );
  await user.click(screen.getByRole("button", { name: "Prepare email" }));
  expect(
    screen.queryByRole("link", { name: /Open email app/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Your name")).toHaveFocus();
  expect(screen.getByLabelText("Your name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(2);
});

it("invalidates the prepared draft as soon as its inputs change", async () => {
  const user = await prepare();
  await user.type(screen.getByLabelText("Your name"), " Taylor");
  expect(
    screen.queryByRole("link", { name: /Open email app/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Prepare email" }));
  expect(
    screen.getByRole("link", { name: /Open email app/ }).getAttribute("href"),
  ).toContain("Alex%20Taylor");
});

it("copies the exact draft and only then reports success", async () => {
  const user = await prepare();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(write).toHaveBeenCalledWith(
    "Hello about a project & an opportunity\n\nFrom: Alex\nReply to: alex@example.com",
  );
  expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
});

it("provides a selectable fallback when clipboard permission is denied", async () => {
  const user = await prepare();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("Permission denied"),
  );
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Automatic copying is unavailable",
  );
  expect(screen.getByLabelText("Email draft")).toHaveFocus();
  expect(
    (screen.getByLabelText("Email draft") as HTMLTextAreaElement).value,
  ).toContain("From: Alex");
});

it("ignores a late clipboard result after the visitor edits the draft", async () => {
  const user = await prepare();
  let finish!: () => void;
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  await user.type(screen.getByLabelText("Your name"), " Updated");
  finish();
  await user.click(screen.getByRole("button", { name: "Prepare email" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copy draft" })).toBeVisible(),
  );
  expect(
    screen.queryByRole("button", { name: "Copied" }),
  ).not.toBeInTheDocument();
});


it("exposes helper text, limits, and an associated email validation error", async () => {
  const user = userEvent.setup();
  render(<Contact />);

  const name = screen.getByLabelText("Your name");
  const email = screen.getByLabelText("Email");
  const message = screen.getByLabelText("What would you like to talk about?");

  expect(name).toHaveAttribute("maxlength", "80");
  expect(email).toHaveAttribute("maxlength", "254");
  expect(message).toHaveAttribute("maxlength", "2000");
  expect(email).toHaveAttribute("aria-describedby", "contact-email-help");

  await user.type(name, "Alex");
  await user.type(email, "not-an-email");
  await user.type(message, "Hello");
  await user.click(screen.getByRole("button", { name: "Prepare email" }));

  expect(email).toHaveFocus();
  expect(email).toHaveAttribute("aria-invalid", "true");
  expect(email).toHaveAttribute(
    "aria-describedby",
    "contact-email-help contact-email-error",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a valid email address.",
  );
});
