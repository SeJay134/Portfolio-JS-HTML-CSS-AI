export type Source = { title: string; url: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export async function requestAnswer(
  message: string,
  signal: AbortSignal,
): Promise<{ reply: string; sources: Source[] }> {
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
          ? "The assistant is offline or busy. Please try later or use Contact."
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
  const response = await fetch(`${base}/ready`, { signal });
  if (!response.ok) return false;
  const data = await response.json();
  return data.status === "ready";
}
