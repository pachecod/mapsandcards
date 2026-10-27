import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { deflateRawSync } from "zlib";
import express from "express";
import {
  seedDefaultTemplatesFs,
  DEFAULT_TEMPLATE_TITLES,
  listDefaultTemplates,
} from "./services/seed-defaults.js";
import { isDbEnabled } from "./services/db-service.js";
import { isAdminRequest } from "./middleware/admin-auth.js";
import {
  getFeaturedStorySlugs,
  titleForFeaturedSlug,
} from "./services/featured-stories.js";
import storyRoutes from "./routes/stories.js";

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
  const reserved = new Set(["list", "create", "save", "new", "api", "templates"]);
  if (reserved.has(t)) return false;
  return true;
}

async function readStoryTitleFromJson(storiesRoot, slug) {
  try {
    const raw = await fs.readFile(path.join(storiesRoot, slug, "scroll-map-story.json"), "utf8");
    const json = JSON.parse(raw);
    if (json.title && String(json.title).trim()) return String(json.title).trim();
  } catch {
    /* ignore */
  }
  return null;
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

const MAPLIBRE_VERSION = "5.24.0";
const NIGHTLAYER_VERSION = "1.0.0-alpha.16";
const CDN_ASSETS = [
  {
    url: `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.min.js`,
    file: "maplibre-gl.min.js",
  },
  {
    url: `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`,
    file: "maplibre-gl.css",
  },
  {
    url: `https://cdn.jsdelivr.net/npm/maplibre-gl-nightlayer@${NIGHTLAYER_VERSION}/dist/nightlayer.min.js`,
    file: "nightlayer.min.js",
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
    )
    .replace(
      /src="https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl-nightlayer@[^"]*\/dist\/nightlayer\.min\.js"/,
      'src="assets/nightlayer.min.js"'
    )
    .replace(/src="\/Tools\/globe-daynight\.js"/, 'src="assets/globe-daynight.js"')
    .replace(/src="\/Tools\/globe-stars\.js"/, 'src="assets/globe-stars.js"')
    .replace(/src="\/Tools\/globe-3d-buildings\.js"/, 'src="assets/globe-3d-buildings.js"')
    .replace(/src="\/Tools\/scroll-camera-scrub\.js"/, 'src="assets/scroll-camera-scrub.js"')
    .replace(/src="\/Tools\/story-map-images\.js"/, 'src="assets/story-map-images.js"')
    .replace(/src="\/Tools\/map-compass\.js"/, 'src="assets/map-compass.js"');
}

/** The analytics tag is served by this app's middleware, so it only 404s in a standalone bundle. */
function stripServerOnlyScripts(html) {
  return html.replace(
    /[ \t]*<script[^>]*src="\/__analytics\.js"[^>]*><\/script>[ \t]*\r?\n?/gi,
    ""
  );
}

function markStandaloneExport(html) {
  return stripServerOnlyScripts(html);
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
      if (req.method === "GET" && url === "/__story-api/templates") {
        const templates = await listDefaultTemplates();
        return sendJson(200, {
          templates: templates.map((t) => ({ slug: t.slug, title: t.title })),
        });
      }

      if (req.method === "GET" && url === "/__story-api/list") {
        await seedDefaultTemplatesFs(rootDir);
        await fs.mkdir(storiesRoot, { recursive: true });
        const names = await fs.readdir(storiesRoot, { withFileTypes: true });
        const allStories = names
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .map((d) => d.name)
          .sort();
        const featuredSlugs = await getFeaturedStorySlugs();
        const isAdmin = isAdminRequest(req);
        const stories = isAdmin ? allStories : featuredSlugs.filter((s) => allStories.includes(s));
        const titles = {};
        await Promise.all(
          allStories.map(async (slug) => {
            const fromJson = await readStoryTitleFromJson(storiesRoot, slug);
            titles[slug] = fromJson || titleForFeaturedSlug(slug, titles);
          })
        );
        const featuredStories = featuredSlugs
          .filter((slug) => allStories.includes(slug))
          .map((slug) => ({
            slug,
            title: titleForFeaturedSlug(slug, titles),
            published: true,
          }));
        // Filesystem mode has no publish state; anything on disk is live.
        const published = {};
        allStories.forEach((slug) => {
          published[slug] = true;
        });
        return sendJson(200, {
          stories,
          titles,
          published,
          featuredSlugs,
          featuredStories,
          role: isAdmin ? "admin" : "anonymous",
        });
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
              projection: "globe",
              globeStars: true,
              show3dBuildings: true,
              satelliteLabels: true,
              restartAtEnd: true,
              initialMap: { lat: 43.0481, lng: -76.1474, zoom: 11 },
              steps: [
                {
                  id: "intro",
                  type: "intro",
                  lat: 43.0481,
                  lng: -76.1474,
                  zoom: 11,
                  html:
                    "<h2>Welcome</h2>" +
                    "<p>Scroll down to explore this story. Each card moves the map to a new place.</p>" +
                    "<p>Use <strong>Story</strong> mode to follow along, or switch to <strong>Explore</strong> to jump between locations and pan or zoom freely.</p>"
                },
                {
                  id: "location-1",
                  lat: 43.0481,
                  lng: -76.1474,
                  zoom: 11,
                  html: "<p>Syracuse, NY</p>",
                  flyTransition: "smooth"
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

        let jsonStr = (await fs.readFile(jsonPath, "utf8")).trim();
        let parsedConfig = JSON.parse(jsonStr);
        const imageEntries = [];
        const usedNames = {};
        let imgIndex = 0;
        function uniqueImgName(base) {
          let name = base;
          let n = 1;
          while (usedNames[name]) {
            n += 1;
            name = base.replace(/(\.[a-z]+)$/i, "-" + n + "$1");
          }
          usedNames[name] = true;
          return name;
        }
        if (parsedConfig.steps) {
          for (const step of parsedConfig.steps) {
            const feats = step?.overlays?.geojson?.features;
            if (!Array.isArray(feats)) continue;
            for (const f of feats) {
              if (!f?.properties || f.properties.kind !== "image") continue;
              const url = f.properties.imageUrl;
              if (!url || String(url).indexOf("data:") !== 0) continue;
              const m = String(url).match(/^data:[^;]+;base64,(.+)$/);
              if (!m) continue;
              const fname = uniqueImgName("overlay-" + (f.properties.id || imgIndex) + ".png");
              imgIndex += 1;
              imageEntries.push({
                name: "assets/" + fname,
                data: Buffer.from(m[1], "base64"),
              });
              f.properties.imageUrl = "assets/" + fname;
            }
          }
        }
        jsonStr = JSON.stringify(parsedConfig, null, 2);

        let html = await fs.readFile(viewerTemplate, "utf8");
        html = injectEmbeddedStoryJson(html, jsonStr);
        html = rewriteCdnToLocal(html);
        html = markStandaloneExport(html);

        const cacheDir = path.join(rootDir, ".cache", "maplibre");
        const assetBuffers = await Promise.all(
          CDN_ASSETS.map((a) => getCachedAsset(cacheDir, a))
        );
        const globeDayNightJs = await fs.readFile(path.join(toolsDir, "globe-daynight.js"));
        const globeStarsJs = await fs.readFile(path.join(toolsDir, "globe-stars.js"));
        const globe3dBuildingsJs = await fs.readFile(path.join(toolsDir, "globe-3d-buildings.js"));
        const scrollCameraScrubJs = await fs.readFile(path.join(toolsDir, "scroll-camera-scrub.js"));
        const storyMapImagesJs = await fs.readFile(path.join(toolsDir, "story-map-images.js"));
        const mapCompassJs = await fs.readFile(path.join(toolsDir, "map-compass.js"));

        const zipBuf = buildZip([
          { name: "index.html", data: Buffer.from(html, "utf8") },
          { name: "scroll-map-story.json", data: Buffer.from(jsonStr, "utf8") },
          { name: "assets/maplibre-gl.min.js", data: assetBuffers[0] },
          { name: "assets/maplibre-gl.css", data: assetBuffers[1] },
          { name: "assets/nightlayer.min.js", data: assetBuffers[2] },
          { name: "assets/globe-daynight.js", data: globeDayNightJs },
          { name: "assets/globe-stars.js", data: globeStarsJs },
          { name: "assets/globe-3d-buildings.js", data: globe3dBuildingsJs },
          { name: "assets/scroll-camera-scrub.js", data: scrollCameraScrubJs },
          { name: "assets/story-map-images.js", data: storyMapImagesJs },
          { name: "assets/map-compass.js", data: mapCompassJs },
          ...imageEntries,
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
  if (isDbEnabled()) {
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use("/__story-api", storyRoutes);
    return {
      name: "story-api-db",
      configureServer(server) {
        server.middlewares.use(app);
      },
      configurePreviewServer(server) {
        server.middlewares.use(app);
      },
    };
  }

  const rootDir = path.resolve(__dirname);
  const mw = storyApiMiddleware(rootDir);
  return {
    name: "story-api",
    async configureServer(server) {
      try {
        await seedDefaultTemplatesFs(rootDir);
      } catch (e) {
        console.warn("[seed] Filesystem seed failed:", e.message || e);
      }
      server.middlewares.use(mw);
    },
    async configurePreviewServer(server) {
      try {
        await seedDefaultTemplatesFs(rootDir);
      } catch (e) {
        console.warn("[seed] Filesystem seed failed:", e.message || e);
      }
      server.middlewares.use(mw);
    }
  };
}
