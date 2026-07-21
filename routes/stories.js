import { Router } from "express";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { deflateRawSync } from "zlib";
import { query } from "../services/db-service.js";
import {
  seedDefaultTemplatesDb,
  DEFAULT_TEMPLATE_TITLES,
} from "../services/seed-defaults.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VIEWER_TEMPLATE = join(ROOT, "Tools", "scroll-map-story.html");

/* ── Helpers ── */

function isValidSlug(s) {
  if (typeof s !== "string") return false;
  const t = s.trim().toLowerCase();
  if (t.length < 1 || t.length > 64) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) return false;
  const reserved = new Set(["list", "create", "save", "new", "api"]);
  return !reserved.has(t);
}

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

const DEFAULT_CONFIG = {
  version: 1,
  baseMap: "openfreemap-bright",
  terrain: false,
  projection: "globe",
  satelliteLabels: true,
  initialMap: { lat: 43.0481, lng: -76.1474, zoom: 11 },
  steps: [
    {
      id: "location-1",
      lat: 43.0481,
      lng: -76.1474,
      zoom: 11,
      html: "<p>Syracuse, NY</p>",
    },
    {
      id: "location-2",
      lat: 40.7128,
      lng: -74.006,
      zoom: 10,
      html: "<p>New York City, NY</p>",
    },
    {
      id: "location-3",
      lat: 38.9072,
      lng: -77.0369,
      zoom: 11,
      html: "<p>Washington, DC</p>",
    },
  ],
};

/* ── ZIP builder (same as vite plugin) ── */

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
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
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

const assetCache = new Map();

async function getCachedAsset(asset) {
  if (assetCache.has(asset.file)) return assetCache.get(asset.file);
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Failed to download ${asset.url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assetCache.set(asset.file, buf);
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

/* ── Routes ── */

const router = Router();

// List all stories
router.get("/list", async (_req, res) => {
  try {
    await seedDefaultTemplatesDb(query);
  } catch (e) {
    console.warn("[seed] DB seed on list failed:", e.message || e);
  }
  const { rows } = await query("SELECT slug, title FROM stories ORDER BY slug");
  const stories = rows.map((r) => r.slug);
  const titles = {};
  rows.forEach((r) => {
    const label = r.title || DEFAULT_TEMPLATE_TITLES[r.slug] || r.slug;
    if (label && label !== r.slug) titles[r.slug] = label;
  });
  // Ensure demo always displays as Demo even if title was stored as slug
  if (stories.includes("demo")) titles.demo = "Demo";
  res.json({ stories, titles });
});

// Create a new story
router.post("/create", async (req, res) => {
  const { slug, defaultJson } = req.body || {};
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug (use lowercase letters, numbers, hyphens)." });
  }

  const existing = await query("SELECT 1 FROM stories WHERE slug = $1", [slug]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "A story with that name already exists." });
  }

  const config =
    typeof defaultJson === "object" && defaultJson !== null ? defaultJson : DEFAULT_CONFIG;

  await query(
    "INSERT INTO stories (slug, title, config) VALUES ($1, $2, $3)",
    [slug, config.title || slug, config]
  );
  res.status(201).json({ slug, ok: true });
});

// Save / update a story
router.post("/save", async (req, res) => {
  const { slug, json: data } = req.body || {};
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug." });
  }
  if (typeof data !== "object" || data === null || !Array.isArray(data.steps)) {
    return res.status(400).json({ error: "Invalid json payload (need steps array)." });
  }

  const existing = await query("SELECT 1 FROM stories WHERE slug = $1", [slug]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Story not found. Create it first." });
  }

  await query(
    "UPDATE stories SET config = $2, title = $3, updated_at = now() WHERE slug = $1",
    [slug, data, data.title || slug]
  );
  res.json({ ok: true });
});

// Delete a story
router.post("/delete", async (req, res) => {
  const { slug } = req.body || {};
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug." });
  }

  const result = await query("DELETE FROM stories WHERE slug = $1", [slug]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Story not found." });
  }
  res.json({ ok: true });
});

// Export as standalone ZIP
router.post("/export", async (req, res) => {
  const { slug } = req.body || {};
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug." });
  }

  const { rows } = await query("SELECT config FROM stories WHERE slug = $1", [slug]);
  if (rows.length === 0) {
    return res.status(404).json({ error: "Story not found." });
  }

  if (!existsSync(VIEWER_TEMPLATE)) {
    return res.status(500).json({ error: "Missing viewer template." });
  }

  const jsonStr = JSON.stringify(rows[0].config, null, 2);
  let html = await readFile(VIEWER_TEMPLATE, "utf8");
  html = injectEmbeddedStoryJson(html, jsonStr);
  html = rewriteCdnToLocal(html);

  const assetBuffers = await Promise.all(CDN_ASSETS.map((a) => getCachedAsset(a)));

  const zipBuf = buildZip([
    { name: "index.html", data: Buffer.from(html, "utf8") },
    { name: "scroll-map-story.json", data: Buffer.from(jsonStr, "utf8") },
    { name: "assets/maplibre-gl.min.js", data: assetBuffers[0] },
    { name: "assets/maplibre-gl.css", data: assetBuffers[1] },
  ]);

  res.set("Content-Type", "application/zip");
  res.set("Content-Disposition", `attachment; filename="${slug}.zip"`);
  res.set("Content-Length", String(zipBuf.length));
  res.send(zipBuf);
});

/* ── Dynamic story file serving (replaces filesystem Stories/ folder) ── */

// Serve scroll-map-story.json for a story
router.get("/story-data/:slug/scroll-map-story.json", async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: "Invalid slug." });

  const { rows } = await query("SELECT config FROM stories WHERE slug = $1", [slug]);
  if (rows.length === 0) return res.status(404).json({ error: "Story not found." });

  res.json(rows[0].config);
});

// Serve rendered story HTML
router.get("/story-data/:slug/scroll-map-story.html", async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).send("Invalid slug.");

  const { rows } = await query("SELECT config FROM stories WHERE slug = $1", [slug]);
  if (rows.length === 0) return res.status(404).send("Story not found.");

  if (!existsSync(VIEWER_TEMPLATE)) return res.status(500).send("Viewer template missing.");

  const jsonStr = JSON.stringify(rows[0].config, null, 2);
  let html = await readFile(VIEWER_TEMPLATE, "utf8");
  html = injectEmbeddedStoryJson(html, jsonStr);
  res.type("html").send(html);
});

export default router;
