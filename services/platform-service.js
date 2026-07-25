import { query, isDbEnabled } from "./db-service.js";
import crypto from "crypto";
import {
  slugify,
  generateUsername,
  generateRandomPassword,
} from "../lib/slug.js";
import { hashPassword } from "../middleware/student-auth.js";
import { storeFile, removeFile } from "./file-storage.js";

const DEFAULT_SITE = {
  main_footer_html: "",
  export_help_html: "",
  blocked_extensions: ["exe", "bat", "sh", "cmd", "com", "heic", "heif"],
  public_template_slugs: ["earth"],
};

export async function getSiteSettings() {
  const { rows } = await query(`SELECT value FROM site_settings WHERE key = 'site'`);
  if (!rows.length) return { ...DEFAULT_SITE };
  return { ...DEFAULT_SITE, ...rows[0].value };
}

export async function updateSiteSettings(partial) {
  const current = await getSiteSettings();
  const next = { ...current, ...partial };
  await query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('site', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)]
  );
  return next;
}

export async function listPublicClasses() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.description, c.slug,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id AND s.is_active = TRUE) AS student_count
     FROM classes c
     ORDER BY c.name ASC`
  );
  return rows;
}

export async function listPublicStudentsInClass(classId) {
  const { rows } = await query(
    `SELECT id, display_name, username FROM students
     WHERE class_id = $1 AND is_active = TRUE
     ORDER BY display_name ASC`,
    [classId]
  );
  return rows;
}

export async function listClassesAdmin() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.description, c.slug, c.created_at, c.updated_at,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count
     FROM classes c
     ORDER BY c.name ASC`
  );
  return rows;
}

export async function createClass({ name, description }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Class name is required");
  let slug = slugify(trimmed);
  const { rows: existing } = await query(`SELECT id FROM classes WHERE slug = $1`, [slug]);
  if (existing.length) slug = `${slug}-${Date.now().toString(36)}`;
  const { rows } = await query(
    `INSERT INTO classes (name, slug, description) VALUES ($1, $2, $3) RETURNING *`,
    [trimmed, slug, description || null]
  );
  return rows[0];
}

export async function updateClass(id, { name, description }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Class name is required");
  const { rows } = await query(
    `UPDATE classes SET name = $1, description = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [trimmed, description || null, id]
  );
  if (!rows.length) throw new Error("Class not found");
  return rows[0];
}

export async function deleteClass(id) {
  const { rowCount } = await query(`DELETE FROM classes WHERE id = $1`, [id]);
  if (!rowCount) throw new Error("Class not found");
}

export async function listStudentsAdmin(classId) {
  const params = [];
  let sql = `SELECT s.id, s.class_id, s.display_name, s.username, s.is_active, s.password_set_at,
                    s.created_at, c.name AS class_name
             FROM students s
             JOIN classes c ON c.id = s.class_id`;
  if (classId) {
    params.push(classId);
    sql += ` WHERE s.class_id = $1`;
  }
  sql += ` ORDER BY c.name ASC, s.display_name ASC`;
  const { rows } = await query(sql, params);
  return rows;
}

export async function createStudent({ classId, displayName, password }) {
  const name = String(displayName || "").trim();
  if (!classId || !name) throw new Error("classId and displayName are required");
  const { rows: usernames } = await query(
    `SELECT username FROM students WHERE class_id = $1`,
    [classId]
  );
  const taken = new Set(usernames.map((r) => r.username));
  const username = generateUsername(name, taken);
  const plainPassword = password || generateRandomPassword();
  const password_hash = await hashPassword(plainPassword);
  const { rows } = await query(
    `INSERT INTO students (class_id, display_name, username, password_hash, password_set_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING *`,
    [classId, name, username, password_hash]
  );
  return { student: rows[0], plainPassword };
}

export async function updateStudent(id, { displayName, classId, isActive }) {
  const fields = [];
  const params = [];
  let i = 1;
  if (displayName != null) {
    fields.push(`display_name = $${i++}`);
    params.push(String(displayName).trim());
  }
  if (classId != null) {
    fields.push(`class_id = $${i++}`);
    params.push(classId);
  }
  if (isActive != null) {
    fields.push(`is_active = $${i++}`);
    params.push(!!isActive);
  }
  if (!fields.length) throw new Error("Nothing to update");
  fields.push(`updated_at = now()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE students SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  if (!rows.length) throw new Error("Student not found");
  return rows[0];
}

export async function deleteStudent(id) {
  const { rowCount } = await query(`DELETE FROM students WHERE id = $1`, [id]);
  if (!rowCount) throw new Error("Student not found");
}

export async function resetStudentPassword(id, password) {
  const plainPassword = password || generateRandomPassword();
  const password_hash = await hashPassword(plainPassword);
  const { rows } = await query(
    `UPDATE students SET password_hash = $1, password_set_at = now(), updated_at = now()
     WHERE id = $2 RETURNING id, display_name, username, class_id`,
    [password_hash, id]
  );
  if (!rows.length) throw new Error("Student not found");
  return { student: rows[0], plainPassword };
}

export async function passwordReport(classId) {
  const params = [];
  let sql = `SELECT s.display_name, s.username, c.name AS class_name,
                    s.password_set_at
             FROM students s
             JOIN classes c ON c.id = s.class_id
             WHERE s.is_active = TRUE`;
  if (classId) {
    params.push(classId);
    sql += ` AND s.class_id = $1`;
  }
  sql += ` ORDER BY c.name, s.display_name`;
  const { rows } = await query(sql, params);
  return rows;
}

function validateExtension(filename, blocked) {
  const ext = String(filename || "").split(".").pop()?.toLowerCase() || "";
  if (blocked.includes(ext)) {
    throw new Error(`File type .${ext} is not allowed`);
  }
}

export async function listCommonAssets() {
  const { rows } = await query(
    `SELECT id, category, filename, public_url, size_bytes, created_at FROM common_assets ORDER BY created_at DESC`
  );
  return rows;
}

export async function uploadCommonAsset({ category, filename, buffer, blocked }) {
  validateExtension(filename, blocked);
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `common-assets/${category || "other"}/${Date.now()}-${safeName}`;
  const stored = await storeFile(storageKey, buffer);
  const { rows } = await query(
    `INSERT INTO common_assets (category, filename, storage_key, public_url, size_bytes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [category || "other", safeName, stored.storageKey, stored.publicUrl, buffer.length]
  );
  return rows[0];
}

export async function deleteCommonAsset(id) {
  const { rows } = await query(`SELECT storage_key FROM common_assets WHERE id = $1`, [id]);
  if (!rows.length) throw new Error("Asset not found");
  await removeFile(rows[0].storage_key);
  await query(`DELETE FROM common_assets WHERE id = $1`, [id]);
}

export async function listStudentAssets(studentId) {
  const { rows } = await query(
    `SELECT id, category, filename, public_url, size_bytes, created_at
     FROM student_assets WHERE student_id = $1 ORDER BY created_at DESC`,
    [studentId]
  );
  return rows;
}

export async function uploadStudentAsset({ studentId, classSlug, category, filename, buffer, blocked }) {
  validateExtension(filename, blocked);
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `student-assets/${classSlug}/${studentId}/${category || "other"}/${Date.now()}-${safeName}`;
  const stored = await storeFile(storageKey, buffer);
  const { rows } = await query(
    `INSERT INTO student_assets (student_id, category, filename, storage_key, public_url, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [studentId, category || "other", safeName, stored.storageKey, stored.publicUrl, buffer.length]
  );
  return rows[0];
}

export async function deleteStudentAsset(id, studentId) {
  const { rows } = await query(
    `SELECT storage_key FROM student_assets WHERE id = $1 AND student_id = $2`,
    [id, studentId]
  );
  if (!rows.length) throw new Error("Asset not found");
  await removeFile(rows[0].storage_key);
  await query(`DELETE FROM student_assets WHERE id = $1`, [id]);
}

export async function deleteStudentAssetAdmin(id) {
  const { rows } = await query(`SELECT storage_key FROM student_assets WHERE id = $1`, [id]);
  if (!rows.length) throw new Error("Asset not found");
  await removeFile(rows[0].storage_key);
  await query(`DELETE FROM student_assets WHERE id = $1`, [id]);
}

export function platformDbRequired(res) {
  if (!isDbEnabled()) {
    res.status(503).json({ error: "Database not configured (DATABASE_URL missing)" });
    return false;
  }
  return true;
}

/* ── Legal CMS ── */

export async function getLegalPage(page) {
  const { rows } = await query(`SELECT page, title, body_html, updated_at FROM legal_pages WHERE page = $1`, [
    page,
  ]);
  return rows[0] || null;
}

export async function updateLegalPage(page, { title, bodyHtml }) {
  const { rows } = await query(
    `INSERT INTO legal_pages (page, title, body_html, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (page) DO UPDATE SET title = EXCLUDED.title, body_html = EXCLUDED.body_html, updated_at = now()
     RETURNING page, title, body_html, updated_at`,
    [page, title || page, bodyHtml || ""]
  );
  return rows[0];
}

/* ── Submissions ── */

export async function listSubmissions({ classId } = {}) {
  const params = [];
  let sql = `SELECT ss.id, ss.story_id, ss.student_id, ss.student_comment, ss.admin_comment,
                    ss.submitted_at, ss.reviewed_at,
                    s.slug AS story_slug, s.title AS story_title,
                    st.display_name AS student_name, c.name AS class_name
             FROM story_submissions ss
             JOIN stories s ON s.id = ss.story_id
             JOIN students st ON st.id = ss.student_id
             JOIN classes c ON c.id = st.class_id`;
  if (classId) {
    params.push(classId);
    sql += ` WHERE st.class_id = $1`;
  }
  sql += ` ORDER BY ss.submitted_at DESC`;
  const { rows } = await query(sql, params);
  return rows;
}

export async function reviewSubmission(id, { adminComment, reviewed = true }) {
  const { rows } = await query(
    `UPDATE story_submissions SET admin_comment = $1, reviewed_at = CASE WHEN $2 THEN now() ELSE reviewed_at END
     WHERE id = $3 RETURNING *`,
    [adminComment || null, reviewed, id]
  );
  if (!rows.length) throw new Error("Submission not found");
  return rows[0];
}

export async function submitStoryForReview({ storySlug, studentId, studentComment }) {
  const { rows: stories } = await query(
    `SELECT id, owner_student_id FROM stories WHERE slug = $1`,
    [storySlug]
  );
  if (!stories.length) throw new Error("Story not found");
  const story = stories[0];
  if (story.owner_student_id !== studentId) throw new Error("Not your story");
  await query(`UPDATE stories SET status = 'submitted', updated_at = now() WHERE id = $1`, [story.id]);
  const { rows } = await query(
    `INSERT INTO story_submissions (story_id, student_id, student_comment)
     VALUES ($1, $2, $3) RETURNING *`,
    [story.id, studentId, studentComment || null]
  );
  return rows[0];
}

/* ── Cross-host auth tokens (Phase 6 bridge) ── */

export async function createPlatformAuthToken({ studentId, ttlSeconds = 300 }) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + ttlSeconds * 1000);
  await query(
    `INSERT INTO platform_auth_tokens (token, student_id, expires_at) VALUES ($1, $2, $3)`,
    [token, studentId, expires]
  );
  return { token, expiresAt: expires.toISOString() };
}

export async function redeemPlatformAuthToken(token) {
  const { rows } = await query(
    `SELECT token, student_id, expires_at, used_at FROM platform_auth_tokens WHERE token = $1`,
    [token]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (row.used_at || new Date(row.expires_at) < new Date()) return null;
  await query(`UPDATE platform_auth_tokens SET used_at = now() WHERE token = $1`, [token]);
  const { rows: students } = await query(
    `SELECT s.id, s.class_id, s.display_name, s.username, c.name AS class_name, c.slug AS class_slug
     FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1 AND s.is_active = TRUE`,
    [row.student_id]
  );
  return students[0] || null;
}

export async function listAdminStudentStories(studentId) {
  const { rows } = await query(
    `SELECT slug, title, status, published, updated_at FROM stories
     WHERE owner_student_id = $1 ORDER BY updated_at DESC`,
    [studentId]
  );
  return rows;
}

