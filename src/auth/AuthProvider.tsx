import React, {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase";
import { rememberReturnPath } from "./returnPath";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unavailable";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  authRevision: number;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setStatus("unavailable");
      return;
    }

    let active = true;
    let receivedAuthEvent = false;
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        receivedAuthEvent = true;
        setAuthRevision((revision) => revision + 1);
        setUser(session?.user ?? null);
        setStatus(session?.user ? "authenticated" : "unauthenticated");
      },
    );

    // Also handle storage-disabled browsers and failed initial hydration.
    void client.auth.getSession()
      .then(({ data, error }) => {
        if (!active || receivedAuthEvent) return;
        setUser(error ? null : data.session?.user ?? null);
        setStatus(!error && data.session?.user ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!active || receivedAuthEvent) return;
        setUser(null);
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle(): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error("Google sign-in is not configured.");
    try {
      rememberReturnPath(window.location.pathname, window.sessionStorage);
    } catch {
      // It is still safe to sign in; callback will return to the homepage.
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback/",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }

  async function signOut(): Promise<void> {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ status, user, authRevision, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
