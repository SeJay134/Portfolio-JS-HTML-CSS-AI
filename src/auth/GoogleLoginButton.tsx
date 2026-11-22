import React, { useState } from "react";
import { useAuth } from "./AuthProvider";

export function GoogleLoginButton() {
  const { signInWithGoogle, status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function beginLogin() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setError("Google sign-in could not start. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-login-control">
      <button
        type="button"
        className="button primary"
        onClick={() => { void beginLogin(); }}
        disabled={busy || status === "unavailable"}
      >
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p role="alert" className="compressor-warning">{error}</p>}
    </div>
  );
}
