import { articleForPath } from "../data/blog";

/**
 * Only known internal pages may be restored after an OAuth redirect.
 * Never pass an arbitrary URL from a query string into location.assign().
 */
export const AUTH_RETURN_PATH_KEY = "sergei-portfolio:auth-return-path";

const ALLOWED_PATHS = new Set([
  "/",
  "/tools/photo-compressor/",
  "/tools/file-converter/",
  "/blog/",
  "/admin/blog/",
]);

export function safeReturnPath(candidate: unknown): string {
  if (typeof candidate !== "string") return "/";
  const path = candidate === "/" ? candidate : candidate.endsWith("/") ? candidate : candidate + "/";
  return ALLOWED_PATHS.has(path) || articleForPath(path) ? path : "/";
}

export function rememberReturnPath(
  pathname: string,
  storage: Pick<Storage, "setItem">,
): void {
  try {
    storage.setItem(AUTH_RETURN_PATH_KEY, safeReturnPath(pathname));
  } catch {
    // Private browsing or a restrictive storage policy must not break login.
  }
}

export function consumeReturnPath(
  storage: Pick<Storage, "getItem" | "removeItem">,
): string {
  try {
    const path = storage.getItem(AUTH_RETURN_PATH_KEY);
    storage.removeItem(AUTH_RETURN_PATH_KEY);
    return safeReturnPath(path);
  } catch {
    return "/";
  }
}
