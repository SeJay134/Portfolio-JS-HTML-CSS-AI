import React, { type ReactNode } from "react";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { useAuth } from "./AuthProvider";
import { isGoogleAuthEnabled } from "../lib/supabase";

type Props = { toolName: string; children: ReactNode };

export function RequireAuth(props: Props) {
  // Keep public tools available until Google OAuth configuration is complete.
  if (!isGoogleAuthEnabled()) return <>{props.children}</>;
  return <AuthenticatedTool {...props} />;
}

function AuthenticatedTool({ toolName, children }: Props) {
  const { status } = useAuth();
  if (status === "authenticated") return <>{children}</>;
  return (
    <main id="main" className="compressor-page" tabIndex={-1}>
      <section className="section compressor-intro auth-gate" aria-live="polite">
        <p className="eyebrow">Account access</p>
        <h1>{toolName}</h1>
        {status === "loading" ? (
          <p>Checking your Google sign-in…</p>
        ) : status === "unavailable" ? (
          <p>Sign-in is not configured yet. Please try again later.</p>
        ) : (
          <>
            <p>Sign in with your Google account to use this tool. No password is needed.</p>
            <GoogleLoginButton />
          </>
        )}
        <p><a href="/">Back to portfolio</a></p>
      </section>
    </main>
  );
}
