// Configuration fence, not proof of actual account/project isolation.
export function assertSeoPreviewIsolation(env) {
  const primary = env.BLOG_SEO_PRIMARY_PROJECT_REF ?? "";
  const test = env.BLOG_SEO_TEST_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(primary) || !/^[a-z0-9]{20}$/.test(test) || primary === test)
    throw new Error("Distinct reviewed primary and isolated project refs required");
  const expected = "https://" + test + ".supabase.co";
  const url = env.BLOG_SEO_SUPABASE_URL ?? "";
  if (url !== expected && url !== expected + "/") throw new Error("SEO origin does not match isolated project");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.BLOG_SEO_SUPABASE_PUBLISHABLE_KEY ?? ""))
    throw new Error("Isolated publishable key required");
  // Prevent the live client in the preview build from targeting a different project.
  if (env.VITE_ENABLE_LIVE_BLOG === "true") {
    if (env.VITE_SUPABASE_URL !== expected && env.VITE_SUPABASE_URL !== expected + "/")
      throw new Error("Live blog client does not match isolated project");
    if (env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.BLOG_SEO_SUPABASE_PUBLISHABLE_KEY)
      throw new Error("Live blog client does not match isolated key");
  }
}
