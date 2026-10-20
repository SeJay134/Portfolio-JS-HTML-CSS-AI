// Only server-side Vercel Functions import this module.
// Never expose the ngrok origin or Flask secret in the browser bundle.
const allowedTunnelHost = (host) =>
  /(^|\.)(?:ngrok-free\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io)$/.test(host);

function upstreamConfig() {
  const raw = process.env.NGROK_TUNNEL_ORIGIN;
  const key = process.env.LOCAL_FLASK_API_KEY;
  if (!raw || !key || key.length < 24) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedTunnelHost(url.hostname) ||
        url.port || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return { origin: url.origin, key };
  } catch {
    return null;
  }
}

const json = (res, status, payload) =>
  res.status(status).setHeader("Cache-Control", "no-store")
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .json(payload);

const cleanSources = (sources) => {
  if (!Array.isArray(sources)) return [];
  return sources.filter((source) => {
    if (!source || typeof source.title !== "string" ||
        typeof source.url !== "string") return false;
    try {
      const url = new URL(source.url);
      return url.protocol === "https:" &&
        !url.username && !url.password &&
        ["github.com", "sergei-luna.vercel.app"].includes(url.hostname);
    } catch { return false; }
  }).slice(0, 5);
};

async function forward(endpoint, req, res, body, deadline) {
  const upstream = upstreamConfig();
  if (!upstream) return json(res, 503, {
    error: "Public assistant is not configured."
  });
  try {
    const response = await fetch(`${upstream.origin}/${endpoint}`, {
      method: endpoint === "chat" ? "POST" : "GET",
      redirect: "error",
      headers: {
        "X-Local-API-Key": upstream.key,
        "ngrok-skip-browser-warning": "1",
        ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(deadline),
    });
    // Never expose upstream details, private error strings or URL.
    if (!response.ok) {
      return json(res, response.status === 429 ? 429 : 503, {
        error: response.status === 429
          ? "Too many requests. Please retry later."
          : "Assistant is unavailable. Please retry later."
      });
    }
    const result = await response.json();
    if (endpoint === "ready") {
      return json(res, 200, {
        status: result?.status === "ready" ? "ready" : "offline"
      });
    }
    if (typeof result?.reply !== "string" || !result.reply.trim())
      return json(res, 502, { error: "Assistant returned an invalid response." });
    return json(res, 200, {
      reply: result.reply.slice(0, 10000),
      sources: cleanSources(result.sources),
    });
  } catch {
    return json(res, 503, { error: "Assistant is unavailable. Please retry later." });
  }
}

export async function chatHandler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (Number(req.headers["content-length"] || 0) > 16000)
    return json(res, 413, { error: "Message is too large." });
  const input = req.body;
  const body = typeof input === "string" ? (() => {
    try { return JSON.parse(input); } catch { return null; }
  })() : input;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.message !== "string" || !body.message.trim() ||
      [...body.message].length > 300)
    return json(res, 400, { error: "Provide a message between 1 and 300 characters." });
  return forward("chat", req, res, { message: body.message.trim() }, 125000);
}

export async function readyHandler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  return forward("ready", req, res, null, 4500);
}
