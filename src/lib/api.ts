export type Source = { title: string; url: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
// Local owner testing still uses loopback Flask in Vite DEV. Public builds
// may only call same-origin /api/*; never expose the owner's PC URL or any
// server-only API key in the browser.
const LOCAL_API = "http://127.0.0.1:5002";

export function canUseLocalChat(hostname: string, dev: boolean): boolean {
  return dev && ["localhost", "127.0.0.1"].includes(hostname);
}

export function selectChatApi(
  hostname: string,
  protocol: string,
  dev: boolean,
  productionBetaEnabled: boolean,
): string | null {
  if (canUseLocalChat(hostname, dev)) return LOCAL_API;
  if (!dev && productionBetaEnabled && protocol === "https:")
    return "/api"; // same-origin; /api/chat, /api/ready
  return null;
}

function selectedApi(): string | null {
  if (typeof window === "undefined") return null;
  return selectChatApi(
    window.location.hostname,
    window.location.protocol,
    import.meta.env?.DEV === true,
    import.meta.env?.PROD === true &&
      import.meta.env?.VITE_ENABLE_PUBLIC_CHAT_UI === "true",
  );
}
export async function requestAnswer(
  message: string,
  signal: AbortSignal,
): Promise<{ reply: string; sources: Source[] }> {
  const base = selectedApi();
  if (base === null)
    throw new ApiError(
      "The assistant is not available in this deployment. Use Contact for now.",
    );
  const response = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The assistant returned an unexpected response. Please try again.",
      response.status,
    );
  }
  if (!response.ok) {
    const retry =
      response.status === 429
        ? "Too many requests. Please wait a minute before retrying."
        : response.status === 503
          ? "The assistant is unavailable or taking too long. Please retry or use Contact."
          : "The request could not be completed. Please check your message.";
    throw new ApiError(retry, response.status);
  }
  if (typeof data.reply !== "string" || !data.reply.trim())
    throw new ApiError(
      "The assistant returned an empty response. Please try again.",
    );
  const sources = Array.isArray(data.sources)
    ? data.sources.filter((s: unknown): s is Source => {
        if (
          !s ||
          typeof s !== "object" ||
          !("url" in s) ||
          !("title" in s) ||
          typeof s.url !== "string" ||
          typeof s.title !== "string"
        )
          return false;
        try {
          const url = new URL(s.url);
          return (
            url.protocol === "https:" &&
            !url.username && !url.password &&
            ["github.com", "sergei-luna.vercel.app"].includes(url.hostname)
          );
        } catch {
          return false;
        }
      })
    : [];
  return { reply: data.reply, sources };
}
export async function readiness(signal: AbortSignal): Promise<boolean> {
  const base = selectedApi();
  if (base === null) return false;
  const response = await fetch(`${base}/ready`, { signal });
  if (!response.ok) return false;
  const data = await response.json();
  return data.status === "ready";
}
