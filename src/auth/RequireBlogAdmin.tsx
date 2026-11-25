import React, { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { isBlogAdminEnabled, resolveBlogAdmin } from "./blogAdmin";

export function RequireBlogAdmin({ children }: { children: ReactNode }) {
  const { status, user, signOut, authRevision } = useAuth();
  const enabled = isBlogAdminEnabled();
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState<{ user: typeof user; revision: number; attempt: number; allowed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || status !== "authenticated" || !user?.id) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      controller.abort();
      if (active) setDecision({ user, revision: authRevision, attempt, allowed: false });
    }, 8000);
    void resolveBlogAdmin(controller.signal).then((allowed) => {
      if (active && !controller.signal.aborted) setDecision({ user, revision: authRevision, attempt, allowed });
    }).catch(() => {
      if (active) setDecision({ user, revision: authRevision, attempt, allowed: false });
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [enabled, status, user, authRevision, attempt]);
  useEffect(() => {
    if (!enabled || status !== "authenticated") return;
    const refresh = () => { setDecision(null); setAttempt((value) => value + 1); };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    const onHide = () => { setDecision(null); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("pagehide", onHide);
    };
  }, [enabled, status]);

  if (!enabled || status === "unavailable") return <p role="status">Blog Studio is not available yet.</p>;
  if (status === "loading") return <p role="status">Checking sign-in…</p>;
  if (status !== "authenticated" || !user?.id) return <><p>Sign in with Google to request administrator access.</p><GoogleLoginButton /></>;
  if (decision?.user !== user || decision.revision !== authRevision || decision.attempt !== attempt) return <p role="status">Checking administrator access…</p>;
  if (!decision.allowed) return <>
    <p role="alert">Administrator access is not available for this account.</p>
    <button className="button secondary" type="button" onClick={() => { setDecision(null); setAttempt((value) => value + 1); }}>Retry access check</button>
    <button className="button secondary" type="button" onClick={() => { void signOut().catch(() => { setDecision(null); }); }}>Log out</button>
  </>;
  return <>{children}</>;
}
