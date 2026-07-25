import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { query } from "./db-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PAGES = [
  { page: "terms", file: "terms.html", title: "Terms of Use" },
  { page: "privacy", file: "privacy-policy.html", title: "Privacy Policy" },
  { page: "about", file: null, title: "About" },
];

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : html;
}

export async function seedLegalPagesIfEmpty(queryFn = query) {
  for (const spec of PAGES) {
    const { rows } = await queryFn(`SELECT 1 FROM legal_pages WHERE page = $1`, [spec.page]);
    if (rows.length) continue;
    let body = `<p>${spec.title} content not yet configured.</p>`;
    if (spec.file) {
      const path = join(ROOT, spec.file);
      if (existsSync(path)) {
        const html = await readFile(path, "utf8");
        body = extractBody(html);
      }
    }
    await queryFn(
      `INSERT INTO legal_pages (page, title, body_html) VALUES ($1, $2, $3)`,
      [spec.page, spec.title, body]
    );
  }
}
