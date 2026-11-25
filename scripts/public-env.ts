// Build-time check: fail before Vite emits browser assets. Never print values.
export function assertPublicEnvironment(env: Record<string, string | undefined>): void {
  const forbidden = /(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|API_TOKEN|PASSWORD)/i;
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_") || !value) continue;
    if (forbidden.test(name) || value.trim().startsWith("sb_secret_")) {
      throw new Error("A server credential must not be exposed through VITE_*");
    }
    // Legacy Supabase JWTs contain a role claim; reject privileged credentials
    // even if someone assigns them to an unexpected public variable.
    const parts = value.trim().split(".");
    if (parts.length === 3) {
      let role: unknown;
      try { role = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role; }
      catch { /* Not a JWT. */ }
      if (role === "service_role" || role === "supabase_admin") throw new Error("A privileged JWT must not be exposed through VITE_*");
    }
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error("Supabase browser configuration requires a publishable key");
}
