import { readFile, mkdir, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEMPLATES_DIR = join(ROOT, "default_templates");

/** Display titles for known template slugs (home page / lists). */
export const DEFAULT_TEMPLATE_TITLES = {
  earth: "Earth",
};

/** Former default template slugs to drop from the DB when seeding. */
const RETIRED_DEFAULT_SLUGS = ["demo"];

function jsonSafeForHtmlScript(jsonStr) {
  return String(jsonStr).replace(/<\/script/gi, "<\\/script");
}

function injectEmbeddedStoryJson(html, jsonStr) {
  const safe = jsonSafeForHtmlScript(jsonStr);
  const re =
    /(<script\s+type="application\/json"\s+id="scroll-map-story-embedded"[^>]*>)([\s\S]*?)(<\/script>)/i;
  if (re.test(html)) {
    return html.replace(re, (_, open, _mid, close) => open + "\n" + safe + "\n" + close);
  }
  const block =
    `\n  <script type="application/json" id="scroll-map-story-embedded">\n${safe}\n  </script>\n`;
  const idx = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/maplibre-gl');
  if (idx !== -1) {
    return html.slice(0, idx) + block + html.slice(idx);
  }
  return html.replace(/<\/body>/i, block + "\n</body>");
}

/**
 * List template folders under default_templates/ that contain scroll-map-story.json.
 * @returns {Promise<Array<{ slug: string, title: string, configPath: string }>>}
 */
export async function listDefaultTemplates() {
  if (!existsSync(TEMPLATES_DIR)) return [];
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const slug = ent.name.trim().toLowerCase();
    const configPath = join(TEMPLATES_DIR, ent.name, "scroll-map-story.json");
    if (!existsSync(configPath)) continue;
    out.push({
      slug,
      title: DEFAULT_TEMPLATE_TITLES[slug] || slug,
      configPath,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Seed missing default templates into Stories/<slug>/ (Vite / local filesystem).
 * Does not overwrite an existing story folder.
 */
export async function seedDefaultTemplatesFs(rootDir = ROOT) {
  const storiesRoot = join(rootDir, "Stories");
  const viewerPath = join(rootDir, "Tools", "scroll-map-story.html");
  const templates = await listDefaultTemplates();
  if (!templates.length) return { created: [], skipped: [] };

  if (!existsSync(viewerPath)) {
    console.warn("[seed] Missing Tools/scroll-map-story.html — skipping filesystem seed.");
    return { created: [], skipped: templates.map((t) => t.slug) };
  }

  const viewerHtml = await readFile(viewerPath, "utf8");
  await mkdir(storiesRoot, { recursive: true });

  const created = [];
  const skipped = [];

  for (const t of templates) {
    const dir = join(storiesRoot, t.slug);
    if (existsSync(dir)) {
      skipped.push(t.slug);
      continue;
    }
    const configRaw = await readFile(t.configPath, "utf8");
    const config = JSON.parse(configRaw);
    const jsonStr = JSON.stringify(config, null, 2);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "scroll-map-story.json"), jsonStr + "\n", "utf8");
    const html = injectEmbeddedStoryJson(viewerHtml, jsonStr);
    await writeFile(join(dir, "scroll-map-story.html"), html, "utf8");
    created.push(t.slug);
  }

  if (created.length) {
    console.log(`[seed] Created default stories: ${created.join(", ")}`);
  }
  return { created, skipped };
}

/**
 * Seed missing default templates into Postgres.
 * @param {typeof import("./db-service.js").query} queryFn
 */
export async function seedDefaultTemplatesDb(queryFn) {
  const templates = await listDefaultTemplates();
  const created = [];
  const skipped = [];
  const retired = [];

  for (const slug of RETIRED_DEFAULT_SLUGS) {
    const result = await queryFn("DELETE FROM stories WHERE slug = $1 RETURNING slug", [slug]);
    if (result.rows.length) retired.push(slug);
  }
  if (retired.length) {
    console.log(`[seed] Removed retired default stories: ${retired.join(", ")}`);
  }

  if (!templates.length) return { created, skipped, retired };

  for (const t of templates) {
    const existing = await queryFn("SELECT 1 FROM stories WHERE slug = $1", [t.slug]);
    if (existing.rows.length > 0) {
      skipped.push(t.slug);
      continue;
    }
    const config = JSON.parse(await readFile(t.configPath, "utf8"));
    await queryFn(
      "INSERT INTO stories (slug, title, config, published) VALUES ($1, $2, $3, true)",
      [t.slug, t.title, config]
    );
    created.push(t.slug);
  }

  if (created.length) {
    console.log(`[seed] Created default stories in DB: ${created.join(", ")}`);
  }
  return { created, skipped, retired };
}

export function displayTitleForSlug(slug, titlesMap) {
  if (titlesMap && titlesMap[slug]) return titlesMap[slug];
  if (DEFAULT_TEMPLATE_TITLES[slug]) return DEFAULT_TEMPLATE_TITLES[slug];
  return slug;
}
