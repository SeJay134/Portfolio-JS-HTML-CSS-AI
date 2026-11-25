import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isStagingConnection, STAGING_MODE } from "./oauthStaging";

/** Auth is opt-in until Google OAuth and Supabase settings are ready. */
export function isGoogleAuthEnabled(): boolean {
  return import.meta.env?.VITE_ENABLE_GOOGLE_AUTH === "true";
}

let instance: SupabaseClient | null = null;

export function validSupabaseSettings(url: unknown, key: unknown): boolean {
  if (typeof url !== "string" || typeof key !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return false;
  const mode = import.meta.env?.MODE;
  if (mode === STAGING_MODE) return typeof window !== "undefined" &&
    import.meta.env.DEV && isStagingConnection(mode, window.location.origin, url);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      !!parsed.hostname && !parsed.username && !parsed.password &&
      parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

/**
 * Instantiate only in browser event handlers/effects, never during
 * prerender.tsx. No secret or service-role key belongs in VITE_*.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!validSupabaseSettings(url, key)) return null;

  if (!instance) {
    instance = createClient(url, key, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storageKey: import.meta.env.MODE === STAGING_MODE ? "sergei-portfolio-oauth-staging" : "sergei-portfolio-supabase-auth",
      },
    });
  }
  return instance;
}
