// Local proof only. Never configure a hosted origin or mint a signing key here.
import { deliverPublicMedia } from "./publicMedia.js";
const ORIGIN = "http://127.0.0.1:54321";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const validId = value => typeof value === "string" && value.length === 36 && UUID.test(value);

async function boundedJson(response, signal) {
  if (response.status !== 200 || response.redirected ||
      !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "") || !response.body)
    throw new Error("Resolver unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error("Invalid metadata");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * The trusted capability provider supplies one token for the exact asset.
 * It is deliberately injected: no browser token, service-role key or
 * hosted JWT signer is accepted/configured by this module.
 */
export function createLocalPublicMediaHandler({ origin, publishableKey, capabilityFor }) {
  if (origin !== ORIGIN || typeof publishableKey !== "string" ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) ||
      typeof capabilityFor !== "function") throw new Error("Expected isolated local media configuration");
  return async function localPublicMedia(req, res) {
    // Per request only; never cache tokens across requests.
    let token;
    let scopedId;
    async function headers(id, signal) {
      if (!validId(id)) throw new Error("Invalid asset");
      if (token === undefined) {
        token = await capabilityFor(id, signal);
        signal.throwIfAborted();
        if (typeof token !== "string" || token.length > 8000 || !TOKEN.test(token) || /\s/.test(token))
          throw new Error("Invalid capability");
        scopedId = id;
      }
      if (id !== scopedId) throw new Error("Scope mismatch");
      return { apikey: publishableKey, Authorization: "Bearer " + token,
        "Cache-Control": "no-store" };
    }
    const result = await deliverPublicMedia({ method: req.method, path: req.url }, {
      async resolve(id, signal) {
        const response = await fetch(ORIGIN + "/rest/v1/rpc/resolve_public_media", {
          method: "POST", headers: { ...await headers(id, signal), "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ p_id: id }), cache: "no-store", redirect: "error", signal,
        });
        return boundedJson(response, signal);
      },
      async read(asset, signal) {
        const parts = asset.key.split("/");
        if (parts.length !== 2 || !validId(parts[0]) || parts[1] !== asset.id + ".jpg")
          throw new Error("Invalid object key");
        return fetch(ORIGIN + "/storage/v1/object/studio-media-verified/" + parts.map(encodeURIComponent).join("/"), {
          method: "GET", headers: { ...await headers(asset.id, signal), Accept: "image/jpeg" },
          cache: "no-store", redirect: "error", signal,
        });
      },
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  };
}
