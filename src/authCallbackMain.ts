import { consumeReturnPath } from "./auth/returnPath";
import { getSupabase } from "./lib/supabase";

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
  window.location.replace(path);
}

void completeSignIn().catch((error: unknown) => {
  if (status) status.textContent = error instanceof Error ? error.message : "Google sign-in failed.";
});
