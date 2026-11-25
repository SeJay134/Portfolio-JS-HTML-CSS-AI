// This mode is available only on the dedicated local Vite development server.
export const STAGING_MODE = "oauth-staging";
export const STAGING_APP_ORIGIN = "http://127.0.0.1:5511";
export const STAGING_API_ORIGIN = "http://127.0.0.1:54321";

export function isStagingConnection(mode: string, origin: string, url: string): boolean {
  return mode === STAGING_MODE && origin === STAGING_APP_ORIGIN &&
    (url === STAGING_API_ORIGIN || url === STAGING_API_ORIGIN + "/");
}
