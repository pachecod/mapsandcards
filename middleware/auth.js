import crypto from "crypto";
import { injectAnalyticsScript } from "./analytics.js";

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sign in — Scroll Map Builder</title>
<style>
  :root { --bg:#0f1419; --panel:#1a2332; --text:#e8eaed; --border:#2a3544; --accent:#3d8bfd; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; }
  form, .panel { background:var(--panel); border:1px solid var(--border); border-radius:12px;
         padding:2rem; width:100%; max-width:22rem; }
  h1 { margin:0 0 1.25rem; font-size:1.2rem; font-weight:600; text-align:center; }
  label { display:block; font-size:0.85rem; margin-bottom:0.35rem; }
  input { width:100%; padding:0.55rem 0.75rem; border-radius:6px; border:1px solid var(--border);
          background:var(--bg); color:var(--text); font-size:0.95rem; margin-bottom:1rem; }
  input:focus { outline:none; border-color:var(--accent); }
  button { width:100%; padding:0.55rem; border:none; border-radius:6px; background:var(--accent);
           color:#fff; font-size:0.95rem; cursor:pointer; font-weight:500; }
  button:hover { opacity:0.9; }
  .btn-guest {
    display:block; width:100%; margin-top:0.65rem; padding:0.55rem; border-radius:6px;
    border:1px solid var(--border); background:transparent; color:var(--text);
    font-size:0.95rem; font-weight:500; text-align:center; text-decoration:none;
    box-sizing:border-box;
  }
  .btn-guest:hover { border-color:var(--accent); color:var(--accent); }
  .err { color:#dc3545; font-size:0.85rem; text-align:center; margin-bottom:1rem; }
  .hint { margin:0 0 1rem; font-size:0.8rem; color:#9aa7b2; text-align:center; line-height:1.45; }
</style>
</head>
<body>
<div class="panel">
  <form method="POST" action="/__auth/login" style="background:transparent;border:none;padding:0;margin:0;max-width:none">
    <h1>Scroll Map Builder</h1>
    <p class="hint">Enter the password you were given to use the full editor. If you are a guest, click Guest Mode below. Guest mode keeps content in your browser on your own computer. You are fully responsible for that content.</p>
    %%ERROR%%
    <input type="hidden" name="next" value="%%NEXT%%"/>
    <label for="pw">Password</label>
    <input type="password" id="pw" name="password" autofocus required/>
    <button type="submit">Sign in</button>
  </form>
  <a class="btn-guest" href="/Tools/scroll-map-builder.html?guest=1">Try Guest Mode</a>
</div>
</body>
</html>`;

function makeToken(password) {
  return crypto.createHmac("sha256", password).update("mapsandcards-session").digest("hex").slice(0, 32);
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = v.join("=").trim();
  });
  return cookies;
}

function safeNextPath(raw) {
  if (typeof raw !== "string") return "/Tools/scroll-map-builder.html";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/Tools/scroll-map-builder.html";
  return t;
}

/** Paths that require a signed-in session when APP_PASSWORD is set. */
function requiresAuth(pathname, searchParams) {
  // Non-guest builder UI
  if (
    pathname === "/Tools/scroll-map-builder.html" ||
    pathname.endsWith("/scroll-map-builder.html")
  ) {
    const guest =
      searchParams.get("guest") === "1" || searchParams.get("mode") === "guest";
    return !guest;
  }

  // Story authoring API (reads stay public so home + viewers work)
  if (pathname.startsWith("/__story-api/")) {
    const action = pathname.slice("/__story-api/".length).split("/")[0];
    return ["create", "save", "delete", "export"].includes(action);
  }

  return false;
}

function renderLogin(res, { error = false, next = "/Tools/scroll-map-builder.html" } = {}) {
  const html = injectAnalyticsScript(
    LOGIN_PAGE
      .replace("%%ERROR%%", error ? '<p class="err">Wrong password.</p>' : "")
      .replace("%%NEXT%%", safeNextPath(next).replace(/"/g, "&quot;"))
  );
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function authMiddleware() {
  const password = (process.env.APP_PASSWORD || "").trim();
  if (!password) {
    return (_req, _res, next) => next();
  }

  const validToken = makeToken(password);

  return (req, res, next) => {
    const rawUrl = req.url || "/";
    const qIndex = rawUrl.indexOf("?");
    const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
    const search = qIndex === -1 ? "" : rawUrl.slice(qIndex + 1);
    const searchParams = new URLSearchParams(search);

    if (req.method === "POST" && pathname === "/__auth/login") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const attempt = (params.get("password") || "").trim();
        const next = safeNextPath(params.get("next"));
        if (attempt === password) {
          res.writeHead(302, {
            "Set-Cookie": `mc_auth=${validToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
            Location: next,
          });
          res.end();
        } else {
          renderLogin(res, { error: true, next });
        }
      });
      return;
    }

    if (pathname === "/__auth/logout") {
      res.writeHead(302, {
        "Set-Cookie": "mc_auth=; Path=/; HttpOnly; Max-Age=0",
        Location: "/",
      });
      res.end();
      return;
    }

    if (pathname === "/__auth/login") {
      renderLogin(res, { next: safeNextPath(searchParams.get("next")) });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    if (cookies.mc_auth === validToken) {
      return next();
    }

    if (!requiresAuth(pathname, searchParams)) {
      return next();
    }

    const nextPath = pathname + (search ? `?${search}` : "");
    renderLogin(res, { next: nextPath });
  };
}
