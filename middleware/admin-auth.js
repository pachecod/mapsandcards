import crypto from "crypto";
import { createSessionHelpers, parseCookies } from "../lib/session.js";

const ADMIN_PASSWORD = (process.env.APP_PASSWORD || "").trim();
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash("sha256").update(ADMIN_PASSWORD || "mapsandcards-admin-dev").digest("hex");

const adminSession = createSessionHelpers({
  cookieName: "mc_admin_session",
  secret: ADMIN_SESSION_SECRET,
  role: "admin",
});

/** Legacy builder cookie from middleware/auth.js */
function hasLegacyAdminCookie(req) {
  const password = ADMIN_PASSWORD;
  if (!password) return false;
  const token = crypto
    .createHmac("sha256", password)
    .update("mapsandcards-session")
    .digest("hex")
    .slice(0, 32);
  const cookies = parseCookies(req);
  return cookies.mc_auth === token;
}

export function getAdminSession(req) {
  return adminSession.getSessionFromRequest(req);
}

export function isAdminRequest(req) {
  if (!ADMIN_PASSWORD) return true;
  return !!getAdminSession(req) || hasLegacyAdminCookie(req);
}

export function requireAdminApi(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: "Admin authentication required" });
}

export function handleAdminLogin(req, res) {
  if (!ADMIN_PASSWORD) {
    const token = adminSession.createToken({});
    adminSession.setCookie(res, token);
    return res.json({ ok: true });
  }
  const { password } = req.body || {};
  if ((password || "").trim() !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  const token = adminSession.createToken({});
  adminSession.setCookie(res, token);
  return res.json({ ok: true });
}

export function handleAdminLogout(_req, res) {
  adminSession.clearCookie(res);
  res.json({ ok: true });
}

export function handleAdminMe(req, res) {
  if (!ADMIN_PASSWORD) {
    return res.json({ ok: true, admin: true, authDisabled: true });
  }
  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Not signed in" });
  }
  return res.json({ ok: true, admin: true });
}

export { adminSession, ADMIN_PASSWORD };
