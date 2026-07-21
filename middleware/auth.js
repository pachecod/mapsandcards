import crypto from "crypto";

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
  form { background:var(--panel); border:1px solid var(--border); border-radius:12px;
         padding:2rem; width:100%; max-width:22rem; }
  h1 { margin:0 0 1.25rem; font-size:1.2rem; font-weight:600; text-align:center; }
  label { display:block; font-size:0.85rem; margin-bottom:0.35rem; }
  input { width:100%; padding:0.55rem 0.75rem; border-radius:6px; border:1px solid var(--border);
          background:var(--bg); color:var(--text); font-size:0.95rem; margin-bottom:1rem; }
  input:focus { outline:none; border-color:var(--accent); }
  button { width:100%; padding:0.55rem; border:none; border-radius:6px; background:var(--accent);
           color:#fff; font-size:0.95rem; cursor:pointer; font-weight:500; }
  button:hover { opacity:0.9; }
  .err { color:#dc3545; font-size:0.85rem; text-align:center; margin-bottom:1rem; }
</style>
</head>
<body>
<form method="POST" action="/__auth/login">
  <h1>Scroll Map Builder</h1>
  %%ERROR%%
  <label for="pw">Password</label>
  <input type="password" id="pw" name="password" autofocus required/>
  <button type="submit">Sign in</button>
</form>
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

export function authMiddleware() {
  const password = (process.env.APP_PASSWORD || "").trim();
  if (!password) {
    return (_req, _res, next) => next();
  }

  const validToken = makeToken(password);

  return (req, res, next) => {
    const url = req.url.split("?")[0];

    if (req.method === "POST" && url === "/__auth/login") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const attempt = (params.get("password") || "").trim();
        if (attempt === password) {
          res.writeHead(302, {
            "Set-Cookie": `mc_auth=${validToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
            Location: "/",
          });
          res.end();
        } else {
          const html = LOGIN_PAGE.replace("%%ERROR%%", '<p class="err">Wrong password.</p>');
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        }
      });
      return;
    }

    if (url === "/__auth/logout") {
      res.writeHead(302, {
        "Set-Cookie": "mc_auth=; Path=/; HttpOnly; Max-Age=0",
        Location: "/__auth/login",
      });
      res.end();
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    if (cookies.mc_auth === validToken) {
      return next();
    }

    const html = LOGIN_PAGE.replace("%%ERROR%%", "");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  };
}
