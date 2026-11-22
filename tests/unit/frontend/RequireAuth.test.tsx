import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequireAuth } from "../../../src/auth/RequireAuth";
import { useAuth } from "../../../src/auth/AuthProvider";

vi.mock("../../../src/auth/AuthProvider", () => ({ useAuth: vi.fn() }));
const mockedAuth = vi.mocked(useAuth);
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("feature-flagged tool access", () => {
  it("preserves the existing tools until rollout", () => {
    vi.stubEnv("VITE_ENABLE_GOOGLE_AUTH", "false");
    render(<RequireAuth toolName="Photo Compressor"><p>Tool is available</p></RequireAuth>);
    expect(screen.getByText("Tool is available")).toBeInTheDocument();
    expect(mockedAuth).not.toHaveBeenCalled();
  });
  it("shows Google login without mounting an unauthenticated tool", () => {
    vi.stubEnv("VITE_ENABLE_GOOGLE_AUTH", "true");
    mockedAuth.mockReturnValue({
      status: "unauthenticated", user: null,
      signInWithGoogle: vi.fn(), signOut: vi.fn(),
    });
    render(<RequireAuth toolName="File Converter"><p>Protected converter</p></RequireAuth>);
    expect(screen.queryByText("Protected converter")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
  it("mounts the tool for a signed-in user", () => {
    vi.stubEnv("VITE_ENABLE_GOOGLE_AUTH", "true");
    mockedAuth.mockReturnValue({
      status: "authenticated", user: null,
      signInWithGoogle: vi.fn(), signOut: vi.fn(),
    });
    render(<RequireAuth toolName="Photo Compressor"><p>Protected compressor</p></RequireAuth>);
    expect(screen.getByText("Protected compressor")).toBeInTheDocument();
  });
});
