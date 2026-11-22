import React, { useState } from "react";
import { useAuth } from "./AuthProvider";
import { isGoogleAuthEnabled } from "../lib/supabase";

export function AccountMenu() {
  if (!isGoogleAuthEnabled()) return null;
  return <ActiveAccountMenu />;
}
function ActiveAccountMenu() {
  const { status, user, signInWithGoogle, signOut } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch {
      setError("Account action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (status === "loading" || status === "unavailable") return null;
  const name = typeof user?.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name : user?.email ?? "Account";
  return (
    <div className="auth-account">
      {status === "authenticated" ? (
        <>
          <span className="auth-account-name" title={user?.email ?? undefined}>{name}</span>
          <button type="button" className="auth-account-button" onClick={() => { void run(signOut); }} disabled={busy}>Log out</button>
        </>
      ) : (
        <button type="button" className="auth-account-button" onClick={() => { void run(signInWithGoogle); }} disabled={busy}>Sign in</button>
      )}
      {error && <span className="auth-account-error" role="alert">{error}</span>}
    </div>
  );
}
