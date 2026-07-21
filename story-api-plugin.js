import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { deflateRawSync } from "zlib";

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

async function writeStoryHtmlWithEmbeddedJson(storyHtmlPath, jsonStr, templatePath) {
  let html;
  if (templatePath && existsSync(templatePath)) {
    html = await fs.readFile(templatePath, "utf8");
  } else {
    html = await fs.readFile(storyHtmlPath, "utf8");
  }
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

/* ── Minimal ZIP builder using Node built-ins ── */

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);      // signature
    local.writeUInt16LE(20, 4);               // version needed
    local.writeUInt16LE(0, 6);                // flags
    local.writeUInt16LE(8, 8);                // compression: deflate
    local.writeUInt16LE(0, 10);               // mod time
    local.writeUInt16LE(0, 12);               // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);               // extra length
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    localHeaders.push(Buffer.concat([local, compressed]));
    centralHeaders.push(central);
    offset += local.length + compressed.length;
  }
  const centralDir = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

/* ── CDN asset cache for export ── */

const MAPLIBRE_VERSION = "4.7.1";
const CDN_ASSETS = [
  {
    url: `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.min.js`,
    file: "maplibre-gl.min.js",
  },
  {
    url: `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`,
    file: "maplibre-gl.css",
  },
];

async function getCachedAsset(cacheDir, asset) {
  const cached = path.join(cacheDir, asset.file);
  if (existsSync(cached)) return fs.readFile(cached);
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Failed to download ${asset.url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cached, buf);
  return buf;
}

function rewriteCdnToLocal(html) {
  return html
    .replace(
      /href="https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@[^"]*\/dist\/maplibre-gl\.css"/,
      'href="assets/maplibre-gl.css"'
    )
    .replace(
      /src="https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@[^"]*\/dist\/maplibre-gl\.min\.js"/,
      'src="assets/maplibre-gl.min.js"'
    );
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
        await writeStoryHtmlWithEmbeddedJson(
          path.join(dir, "scroll-map-story.html"),
          jsonStr,
          viewerTemplate
        );
        return sendJson(200, { ok: true });
      }

      if (req.method === "POST" && url === "/__story-api/delete") {
        const body = await readJsonBody(req);
        const slug = body && body.slug;
        if (!isValidSlug(slug)) {
          return sendJson(400, { error: "Invalid slug." });
        }
        const dir = path.join(storiesRoot, slug);
        if (!existsSync(dir)) {
          return sendJson(404, { error: "Story not found." });
        }
        await fs.rm(dir, { recursive: true, force: true });
        return sendJson(200, { ok: true });
      }

      if (req.method === "POST" && url === "/__story-api/export") {
        const body = await readJsonBody(req);
        const slug = body && body.slug;
        if (!isValidSlug(slug)) {
          return sendJson(400, { error: "Invalid slug." });
        }
        const dir = path.join(storiesRoot, slug);
        const jsonPath = path.join(dir, "scroll-map-story.json");
        if (!existsSync(dir) || !existsSync(jsonPath)) {
          return sendJson(404, { error: "Story not found. Save it first." });
        }
        if (!existsSync(viewerTemplate)) {
          return sendJson(500, { error: "Missing viewer template." });
        }

        const jsonStr = (await fs.readFile(jsonPath, "utf8")).trim();
        let html = await fs.readFile(viewerTemplate, "utf8");
        html = injectEmbeddedStoryJson(html, jsonStr);
        html = rewriteCdnToLocal(html);

        const cacheDir = path.join(rootDir, ".cache", "maplibre");
        const assetBuffers = await Promise.all(
          CDN_ASSETS.map((a) => getCachedAsset(cacheDir, a))
        );

        const zipBuf = buildZip([
          { name: "index.html", data: Buffer.from(html, "utf8") },
          { name: "scroll-map-story.json", data: Buffer.from(jsonStr, "utf8") },
          { name: "assets/maplibre-gl.min.js", data: assetBuffers[0] },
          { name: "assets/maplibre-gl.css", data: assetBuffers[1] },
        ]);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${slug}.zip"`
        );
        res.setHeader("Content-Length", zipBuf.length);
        res.end(zipBuf);
        return;
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
