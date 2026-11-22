import { verifyGoogleUser } from "../server/authGuard.js";

const json = (res, status, payload) =>
  res.status(status)
    .setHeader("Cache-Control", "no-store")
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .json(payload);

export default async function me(req, res) {
  if (req.method !== "GET")
    return json(res, 405, { error: "Method not allowed." });
  const auth = await verifyGoogleUser(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });
  return json(res, 200, { user: auth.user });
}
