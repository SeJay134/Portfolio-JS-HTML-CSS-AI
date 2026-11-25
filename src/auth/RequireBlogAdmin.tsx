import React, { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { isBlogAdminEnabled, resolveBlogAdmin } from "./blogAdmin";

export function RequireBlogAdmin({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useAuth();
  const enabled = isBlogAdminEnabled();
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState<{ userId: string; allowed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || status !== "authenticated" || !user?.id) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      controller.abort();
      if (active) setDecision({ userId: user.id, allowed: false });
    }, 8000);
    void resolveBlogAdmin(controller.signal).then((allowed) => {
      if (active && !controller.signal.aborted) setDecision({ userId: user.id, allowed });
    }).catch(() => {
      if (active) setDecision({ userId: user.id, allowed: false });
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [enabled, status, user, attempt]);
  useEffect(() => {
    if (!enabled || status !== "authenticated") return;
    const refresh = () => { setDecision(null); setAttempt((value) => value + 1); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, status]);

  if (!enabled || status === "unavailable") return <p role="status">Blog Studio is not available yet.</p>;
  if (status === "loading") return <p role="status">Checking sign-in…</p>;
  if (status !== "authenticated" || !user?.id) return <><p>Sign in with Google to request administrator access.</p><GoogleLoginButton /></>;
  if (decision?.userId !== user.id) return <p role="status">Checking administrator access…</p>;
  if (!decision.allowed) return <>
    <p role="alert">Administrator access is not available for this account.</p>
    <button className="button secondary" type="button" onClick={() => { setDecision(null); setAttempt((value) => value + 1); }}>Retry access check</button>
    <button className="button secondary" type="button" onClick={() => { void signOut().catch(() => { setDecision(null); }); }}>Log out</button>
  </>;
  return <>{children}</>;
}
