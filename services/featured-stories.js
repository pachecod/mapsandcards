import { DEFAULT_TEMPLATE_TITLES } from "./seed-defaults.js";
import { query, isDbEnabled } from "./db-service.js";

/**
 * Featured stories are rows in the stories table flagged with `featured = true`
 * and ordered by `featured_rank`. Without a database (filesystem mode) there is
 * nowhere to store the flag, so the bundled starters stand in.
 */
export const DEFAULT_FEATURED_STORY_SLUGS = ["earth", "syracuse"];

const FEATURED_ORDER = "ORDER BY featured_rank NULLS LAST, id ASC";

/**
 * @param {{ publishedOnly?: boolean }} [options]
 * @returns {Promise<Array<{ slug: string, title: string, published: boolean, featured_rank: number|null }>>}
 */
export async function listFeaturedStories(options = {}) {
  if (!isDbEnabled()) return [];
  const publishedOnly = !!options.publishedOnly;
  const { rows } = await query(
    `SELECT slug, title, published, featured_rank, updated_at
     FROM stories
     WHERE featured = true ${publishedOnly ? "AND published = true" : ""}
     ${FEATURED_ORDER}`
  );
  return rows;
}

export async function getFeaturedStorySlugs() {
  if (!isDbEnabled()) {
    return [...DEFAULT_FEATURED_STORY_SLUGS];
  }
  try {
    const rows = await listFeaturedStories();
    return rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

export async function isFeaturedStorySlug(slug) {
  if (!slug) return false;
  const normalized = String(slug).trim().toLowerCase();
  if (!isDbEnabled()) return DEFAULT_FEATURED_STORY_SLUGS.includes(normalized);
  try {
    const { rows } = await query(
      "SELECT 1 FROM stories WHERE slug = $1 AND featured = true",
      [normalized]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Add or remove a story from the featured queue. Appends to the end when featuring. */
export async function setStoryFeatured(slug, featured) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) throw new Error("Story slug is required.");
  const { rows } = featured
    ? await query(
        `UPDATE stories
         SET featured = true,
             featured_rank = COALESCE(
               (SELECT MAX(featured_rank) FROM stories WHERE featured = true), 0
             ) + 1,
             updated_at = now()
         WHERE slug = $1 AND featured = false
         RETURNING slug, title, published, featured, featured_rank`,
        [normalized]
      )
    : await query(
        `UPDATE stories
         SET featured = false, featured_rank = NULL, updated_at = now()
         WHERE slug = $1
         RETURNING slug, title, published, featured, featured_rank`,
        [normalized]
      );
  if (rows.length) return rows[0];

  // Featuring an already-featured story is a no-op rather than an error.
  const { rows: current } = await query(
    "SELECT slug, title, published, featured, featured_rank FROM stories WHERE slug = $1",
    [normalized]
  );
  if (!current.length) throw new Error(`Story "${normalized}" was not found.`);
  return current[0];
}

/**
 * Rewrite the home page order. Slugs not in the list keep their relative order
 * after the ones that are.
 */
export async function reorderFeatured(slugs) {
  const wanted = (Array.isArray(slugs) ? slugs : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);

  const existing = await listFeaturedStories();
  const known = new Set(existing.map((r) => r.slug));
  const ordered = wanted.filter((s) => known.has(s));
  for (const row of existing) {
    if (!ordered.includes(row.slug)) ordered.push(row.slug);
  }

  for (let i = 0; i < ordered.length; i++) {
    await query("UPDATE stories SET featured_rank = $2 WHERE slug = $1", [ordered[i], i + 1]);
  }
  return listFeaturedStories();
}

export function titleForFeaturedSlug(slug, titlesMap) {
  if (titlesMap && titlesMap[slug]) return titlesMap[slug];
  if (DEFAULT_TEMPLATE_TITLES[slug]) return DEFAULT_TEMPLATE_TITLES[slug];
  return slug;
}
