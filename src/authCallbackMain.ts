import { consumeReturnPath } from "./auth/returnPath";
import { getSupabase } from "./lib/supabase";
import { isBlogAdminEnabled, resolveBlogAdmin } from "./auth/blogAdmin";

const status = document.getElementById("auth-status");

async function completeSignIn(): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Sign-in is not configured.");

  const params = new URL(window.location.href).searchParams;
  if (params.has("error")) throw new Error("Google sign-in was cancelled or denied.");
  const code = params.get("code");
  if (!code) throw new Error("Google did not return an authorization code.");

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) throw new Error("The sign-in session could not be created.");

  let path = "/";
  try {
    path = consumeReturnPath(window.sessionStorage);
  } catch {
    // Session storage may be disabled; returning home is safe.
  }
  // Enrollment is optional for ordinary sign-in. Missing schema or network
  // errors must never break login or grant administrator access.
  if (isBlogAdminEnabled()) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try { await resolveBlogAdmin(controller.signal); }
    finally { window.clearTimeout(timeout); }
  }
  window.location.replace(path);
}

void completeSignIn().catch((error: unknown) => {
  if (status) status.textContent = error instanceof Error ? error.message : "Google sign-in failed.";
});
