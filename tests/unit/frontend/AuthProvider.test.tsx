import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../../../src/auth/AuthProvider";
import { RequireAuth } from "../../../src/auth/RequireAuth";
import { AccountMenu } from "../../../src/auth/AccountMenu";
import { AUTH_RETURN_PATH_KEY } from "../../../src/auth/returnPath";

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("../../../src/lib/supabase", () => ({
  getSupabase: mocks.getSupabase,
  isGoogleAuthEnabled: () => true,
}));

type FakeSession = { user: { email: string; user_metadata: { full_name: string } } };
const googleSession: FakeSession = {
  user: { email: "person@example.test", user_metadata: { full_name: "Test Person" } },
};

let getSession: ReturnType<typeof vi.fn>;
let signInWithOAuth: ReturnType<typeof vi.fn>;
let signOut: ReturnType<typeof vi.fn>;
let authChange: ((event: string, session: FakeSession | null) => void) | undefined;
let unsubscribe: ReturnType<typeof vi.fn>;

function renderAuth(initialTool = "Photo Compressor") {
  return render(
    <AuthProvider>
      <AccountMenu />
      <RequireAuth toolName={initialTool}><p>Protected tool content</p></RequireAuth>
    </AuthProvider>,
  );
}

beforeEach(() => {
  authChange = undefined;
  unsubscribe = vi.fn();
  getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  signOut = vi.fn().mockImplementation(async () => {
    authChange?.("SIGNED_OUT", null);
    return { error: null };
  });
  mocks.getSupabase.mockReturnValue({
    auth: {
      getSession,
      signInWithOAuth,
      signOut,
      onAuthStateChange: (fn: typeof authChange) => {
        authChange = fn;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  });
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("Google authentication lifecycle", () => {
  it("does not render protected contents before session initialization", async () => {
    let resolve!: (result: unknown) => void;
    getSession.mockImplementation(() => new Promise((done) => { resolve = done; }));
    renderAuth();
    expect(screen.queryByText("Protected tool content")).not.toBeInTheDocument();
    expect(screen.getByText("Checking your Google sign-in…")).toBeInTheDocument();
    resolve({ data: { session: null }, error: null });
    await screen.findByRole("button", { name: "Continue with Google" });
  });

  it("restores a cached Google session and displays account controls", async () => {
    getSession.mockResolvedValue({ data: { session: googleSession }, error: null });
    renderAuth();
    await screen.findByText("Protected tool content");
    expect(screen.getByText("Test Person")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("starts Google OAuth with a same-origin callback and remembers a safe tool path", async () => {
    window.history.replaceState(null, "", "/tools/photo-compressor/");
    renderAuth();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback/",
        queryParams: { prompt: "select_account" },
      },
    });
    expect(sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBe("/tools/photo-compressor/");
  });

  it("shows a generic error without exposing OAuth failure details", async () => {
    signInWithOAuth.mockRejectedValue(new Error("private provider data"));
    renderAuth();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in could not start. Please try again.",
    );
    expect(screen.queryByText("private provider data")).not.toBeInTheDocument();
  });

  it("signs out locally and immediately hides protected content", async () => {
    getSession.mockResolvedValue({ data: { session: googleSession }, error: null });
    renderAuth("File Converter");
    await screen.findByText("Protected tool content");
    await userEvent.setup().click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.queryByText("Protected tool content")).not.toBeInTheDocument();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("fails closed if session recovery rejects", async () => {
    getSession.mockRejectedValue(new Error("private API error"));
    renderAuth();
    await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.queryByText("Protected tool content")).not.toBeInTheDocument();
  });

  it("unsubscribes from auth change notifications on unmount", async () => {
    const mounted = renderAuth();
    await screen.findByRole("button", { name: "Continue with Google" });
    mounted.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

it("does not restore an old cached session after a newer logout event", async () => {
  let finish!: (result: unknown) => void;
  getSession.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderAuth();
  authChange?.("SIGNED_OUT", null);
  await screen.findByRole("button", { name: "Continue with Google" });
  finish({ data: { session: googleSession }, error: null });
  await waitFor(() => expect(screen.queryByText("Protected tool content")).not.toBeInTheDocument());
});
