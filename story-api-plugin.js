import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Prevent `</script>` inside embedded JSON from closing the HTML script element. */
function jsonSafeForHtmlScript(jsonStr) {
  return jsonStr.replace(/<\/script/gi, "<\\/script");
}

function injectEmbeddedStoryJson(html, jsonStr) {
  const safe = jsonSafeForHtmlScript(jsonStr);
  const re =
    /(<script\s+type="application\/json"\s+id="scroll-map-story-embedded"[^>]*>)([\s\S]*?)(<\/script>)/i;
  if (re.test(html)) {
    return html.replace(re, (_, open, _mid, close) => open + "\n" + safe + "\n" + close);
  }
  const block = `\n  <script type="application/json" id="scroll-map-story-embedded">\n${safe}\n  </script>\n`;
  const idx = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/maplibre-gl');
  if (idx !== -1) {
    return html.slice(0, idx) + block + html.slice(idx);
  }
  return html.replace(/<\/body>/i, block + "\n</body>");
}

async function writeStoryHtmlWithEmbeddedJson(storyHtmlPath, jsonStr) {
  let html = await fs.readFile(storyHtmlPath, "utf8");
  html = injectEmbeddedStoryJson(html, jsonStr);
  await fs.writeFile(storyHtmlPath, html, "utf8");
}

function isValidSlug(s) {
  if (typeof s !== "string") return false;
  const t = s.trim().toLowerCase();
  if (t.length < 1 || t.length > 64) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) return false;
  const reserved = new Set(["list", "create", "save", "new", "api"]);
  if (reserved.has(t)) return false;
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storyApiMiddleware(rootDir) {
  const storiesRoot = path.join(rootDir, "Stories");
  const toolsDir = path.join(rootDir, "Tools");
  const viewerTemplate = path.join(toolsDir, "scroll-map-story.html");

  return async function storyApi(req, res, next) {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/__story-api/")) return next();

    const sendJson = (code, obj) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(obj));
    };

    try {
      if (req.method === "GET" && url === "/__story-api/list") {
        await fs.mkdir(storiesRoot, { recursive: true });
        const names = await fs.readdir(storiesRoot, { withFileTypes: true });
        const stories = names
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .map((d) => d.name)
          .sort();
        return sendJson(200, { stories });
      }

      if (req.method === "POST" && url === "/__story-api/create") {
        const body = await readJsonBody(req);
        const slug = body && body.slug;
        if (!isValidSlug(slug)) {
          return sendJson(400, { error: "Invalid slug (use lowercase letters, numbers, hyphens)." });
        }
        const dir = path.join(storiesRoot, slug);
        if (existsSync(dir)) {
          return sendJson(409, { error: "A story with that name already exists." });
        }
        await fs.mkdir(dir, { recursive: true });
        if (!existsSync(viewerTemplate)) {
          return sendJson(500, { error: "Missing Tools/scroll-map-story.html viewer template." });
        }
        const html = await fs.readFile(viewerTemplate, "utf8");
        await fs.writeFile(path.join(dir, "scroll-map-story.html"), html, "utf8");
        const defaultJson = body.defaultJson;
        let jsonStr;
        if (typeof defaultJson === "object" && defaultJson !== null) {
          jsonStr = JSON.stringify(defaultJson, null, 2);
        } else {
          jsonStr = JSON.stringify(
            {
              version: 1,
              baseMap: "openfreemap-bright",
              terrain: false,
              satelliteLabels: true,
              initialMap: { lat: 20, lng: 0, zoom: 2 },
              steps: [
                {
                  id: "step-1",
                  lat: 20,
                  lng: 0,
                  zoom: 2,
                  html: "<p>First card — edit in the builder.</p>"
                }
              ]
            },
            null,
            2
          );
        }
        await fs.writeFile(path.join(dir, "scroll-map-story.json"), jsonStr + "\n", "utf8");
        await writeStoryHtmlWithEmbeddedJson(path.join(dir, "scroll-map-story.html"), jsonStr.trimEnd());
        return sendJson(201, { slug, ok: true });
      }

      if (req.method === "POST" && url === "/__story-api/save") {
        const body = await readJsonBody(req);
        const slug = body && body.slug;
        const data = body && body.json;
        if (!isValidSlug(slug)) {
          return sendJson(400, { error: "Invalid slug." });
        }
        if (typeof data !== "object" || data === null || !Array.isArray(data.steps)) {
          return sendJson(400, { error: "Invalid json payload (need steps array)." });
        }
        const dir = path.join(storiesRoot, slug);
        if (!existsSync(dir)) {
          return sendJson(404, { error: "Story folder does not exist. Create the story first." });
        }
        const jsonStr = JSON.stringify(data, null, 2);
        await fs.writeFile(path.join(dir, "scroll-map-story.json"), jsonStr + "\n", "utf8");
        await writeStoryHtmlWithEmbeddedJson(path.join(dir, "scroll-map-story.html"), jsonStr);
        return sendJson(200, { ok: true });
      }

      return sendJson(404, { error: "Unknown story API route." });
    } catch (e) {
      console.error("[story-api]", e);
      return sendJson(500, { error: e.message || "Server error" });
    }
  };
}

export function storyApiPlugin() {
  const rootDir = path.resolve(__dirname);
  const mw = storyApiMiddleware(rootDir);
  return {
    name: "story-api",
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    }
  };
}
