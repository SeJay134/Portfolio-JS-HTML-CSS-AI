import { STAGING_API_ORIGIN, STAGING_MODE } from "../src/lib/oauthStaging";
export function assertOAuthStaging(command: string, mode: string, env: Record<string,string | undefined>): void {
  if (mode !== STAGING_MODE) return;
  if (command !== "serve" || env.VERCEL || env.CI) throw new Error("OAuth staging is local development only");
  if (env.VITE_SUPABASE_URL !== STAGING_API_ORIGIN ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "") ||
      env.VITE_ENABLE_GOOGLE_AUTH !== "true" || env.VITE_ENABLE_BLOG_ADMIN !== "true" ||
      env.VITE_ENABLE_LIVE_BLOG !== "true") throw new Error("Use the isolated OAuth staging launcher");
}
