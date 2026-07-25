import crypto from "crypto";
import { SESSION_BOOT_ID } from "./session-boot-id.js";

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function appendSetCookie(res, cookieValue) {
  if (typeof res.append === "function") {
    res.append("Set-Cookie", cookieValue);
    return;
  }
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookieValue);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, cookieValue]);
  else res.setHeader("Set-Cookie", [prev, cookieValue]);
}

export function createSessionHelpers({
  cookieName,
  secret,
  role,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
  persistAcrossRestarts = false,
}) {
  function signSession(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verifySession(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (sig.length !== expected.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (!payload || payload.role !== role) return null;
      if (!persistAcrossRestarts && payload.boot !== SESSION_BOOT_ID) return null;
      if (!payload.exp || Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function createToken(extra = {}, options = {}) {
    const ageMs = options.maxAgeMs ?? maxAgeMs;
    const payload = { role, exp: Date.now() + ageMs, ...extra };
    if (!persistAcrossRestarts) payload.boot = SESSION_BOOT_ID;
    return signSession(payload);
  }

  function setCookie(res, token, options = {}) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const sessionOnly = options.sessionOnly === true;
    const agePart = sessionOnly
      ? ""
      : `; Max-Age=${Math.floor((options.maxAgeMs ?? maxAgeMs) / 1000)}`;
    appendSetCookie(
      res,
      `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/${agePart}; SameSite=Lax${secure}`
    );
  }

  function clearCookie(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    appendSetCookie(
      res,
      `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`
    );
  }

  function getSessionFromRequest(req) {
    const cookies = parseCookies(req);
    return verifySession(cookies[cookieName]);
  }

  return {
    createToken,
    setCookie,
    clearCookie,
    getSessionFromRequest,
    cookieName,
  };
}
