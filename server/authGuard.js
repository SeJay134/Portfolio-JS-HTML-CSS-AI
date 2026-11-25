// Server-only Google identity verification for protected Vercel endpoints.
// The bearer token is sent only to the configured Supabase project.
export function googleAuthRequired() {
  return process.env.REQUIRE_GOOGLE_AUTH === "true" ||
    process.env.VITE_ENABLE_GOOGLE_AUTH === "true";
}

const failure = (status, error) => ({ ok: false, status, error });

function config() {
  const raw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof raw !== "string" || typeof key !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username ||
        url.password || url.pathname !== "/" || url.search || url.hash)
      return null;
    return { origin: url.origin, key };
  } catch {
    return null;
  }
}

export async function verifyGoogleUser(req) {
  const settings = config();
  if (!settings) return failure(503, "Authentication is unavailable.");

  const header = req.headers?.authorization;
  const token = typeof header === "string"
    ? /^Bearer ([A-Za-z0-9._-]{20,8000})$/i.exec(header)?.[1]
    : null;
  if (!token) return failure(401, "Sign in with Google to continue.");

  const headers = {
    apikey: settings.key,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  try {
    // Supabase Auth validates the token and retrieves the current user.
    const response = await fetch(settings.origin + "/auth/v1/user", {
      method: "GET", headers, redirect: "error",
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return failure(401, "Google session has expired.");
    const user = await response.json();
    if (typeof user?.id !== "string" || !user.id)
      return failure(401, "Invalid account.");
    const providers = user.app_metadata?.providers;
    // Only accounts originating from Google and linked exclusively to Google
    // may use this API. app_metadata.provider is the FIRST sign-in method,
    // not proof of which method created this particular session. Disable
    // other sign-in methods in Supabase to enforce Google-only sessions.
    if (user.app_metadata?.provider !== "google" ||
        !Array.isArray(providers) || providers.length !== 1 ||
        providers[0] !== "google")
      return failure(403, "Google-only account required.");

    // Profile status is independently protected by RLS; fail closed if
    // the migration has not yet been installed.
    const profileUrl = settings.origin +
      "/rest/v1/profiles?select=status&id=eq." + encodeURIComponent(user.id);
    const profileResponse = await fetch(profileUrl, {
      method: "GET", headers, redirect: "error",
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!profileResponse.ok)
      return failure(503, "Account access is unavailable.");
    const profiles = await profileResponse.json();
    if (!Array.isArray(profiles) || profiles.length !== 1 ||
        profiles[0]?.status !== "active")
      return failure(403, "Account is not active.");
    return { ok: true, user: { id: user.id, email: user.email ?? null } };
  } catch {
    return failure(503, "Authentication is temporarily unavailable.");
  }
}
