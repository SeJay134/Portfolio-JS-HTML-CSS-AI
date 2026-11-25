import { getSupabase, isGoogleAuthEnabled } from "../lib/supabase";

// Separate rollout gate. Enabling this never grants database permission.
export function isBlogAdminEnabled(): boolean {
  return isGoogleAuthEnabled() && import.meta.env.VITE_ENABLE_BLOG_ADMIN === "true";
}

export async function resolveBlogAdmin(signal?: AbortSignal): Promise<boolean> {
  if (!isBlogAdminEnabled()) return false;
  const client = getSupabase();
  if (!client) return false;
  try {
    const request = client.rpc("resolve_blog_admin");
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    return !error && data === true && !signal?.aborted;
  } catch {
    return false;
  }
}
