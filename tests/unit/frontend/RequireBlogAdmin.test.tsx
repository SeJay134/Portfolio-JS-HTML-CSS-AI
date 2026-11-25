import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { RequireBlogAdmin } from "../../../src/auth/RequireBlogAdmin";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), enabled: vi.fn() }));
vi.mock("../../../src/auth/AuthProvider", () => ({ useAuth: mocks.auth }));
vi.mock("../../../src/auth/blogAdmin", () => ({ resolveBlogAdmin: mocks.resolve, isBlogAdminEnabled: mocks.enabled }));
vi.mock("../../../src/auth/GoogleLoginButton", () => ({ GoogleLoginButton: () => <button>Continue with Google</button> }));
const studio = () => <RequireBlogAdmin><p>Private studio</p></RequireBlogAdmin>;
beforeEach(() => {
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockReturnValue({ status: "authenticated", user: { id: "owner" }, signOut: vi.fn() });
  mocks.resolve.mockReset().mockResolvedValue(false);
});
it("fails closed when rollout is disabled", () => {
  mocks.enabled.mockReturnValue(false);
  render(studio());
  expect(screen.getByRole("status")).toHaveTextContent("not available");
  expect(mocks.resolve).not.toHaveBeenCalled();
});
it("requires sign-in", () => {
  mocks.auth.mockReturnValue({ status: "unauthenticated", user: null });
  render(studio());
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  expect(mocks.resolve).not.toHaveBeenCalled();
});
it("does not trust cached role or email", async () => {
  mocks.auth.mockReturnValue({ status: "authenticated", user: { id: "owner", user_metadata: { role: "admin" }, email: "owner@example.invalid" } });
  render(studio());
  expect(await screen.findByRole("alert")).toHaveTextContent("Administrator access is not available");
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
});
it("shows studio only after DB confirmation, and hides it on logout", async () => {
  mocks.resolve.mockResolvedValue(true);
  const view = render(studio());
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
  await screen.findByText("Private studio");
  mocks.auth.mockReturnValue({ status: "unauthenticated", user: null });
  view.rerender(studio());
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
});
it("ignores previous account response", async () => {
  let finish!: (value: boolean) => void;
  mocks.resolve.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const view = render(studio());
  mocks.auth.mockReturnValue({ status: "authenticated", user: { id: "other" } });
  view.rerender(studio());
  await screen.findByRole("alert");
  await act(async () => finish(true));
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
});
it("rechecks on explicit retry", async () => {
  render(studio());
  await screen.findByRole("alert");
  mocks.resolve.mockResolvedValue(true);
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry access check" }));
  await screen.findByText("Private studio");
});
it("denies failed requests", async () => {
  mocks.resolve.mockRejectedValue(new Error("private backend details"));
  render(studio());
  await screen.findByRole("alert");
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
  expect(screen.queryByText("private backend details")).not.toBeInTheDocument();
});

it("rechecks the same user after a new auth event rather than trusting a prior decision", async () => {
  const user = { id: "owner" };
  mocks.auth.mockReturnValue({status:"authenticated", user, authRevision:1, signOut:vi.fn()});
  mocks.resolve.mockResolvedValueOnce(true);
  const view = render(studio());
  await screen.findByText("Private studio");
  mocks.auth.mockReturnValue({status:"authenticated", user, authRevision:2, signOut:vi.fn()});
  view.rerender(studio());
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
  await screen.findByRole("alert");
});
it("rechecks authorization when a page is restored from browser cache", async () => {
  mocks.resolve.mockResolvedValueOnce(true);
  render(studio());
  await screen.findByText("Private studio");
  await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", {persisted:true})); });
  await screen.findByRole("alert");
  expect(screen.queryByText("Private studio")).not.toBeInTheDocument();
});
