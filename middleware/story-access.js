import { isDbEnabled, query } from "../services/db-service.js";
import { getStudentSession } from "./student-auth.js";
import { isAdminRequest } from "./admin-auth.js";

export function isPlatformRosterEnabled() {
  return isDbEnabled() && process.env.STUDENT_AUTH_REQUIRED === "true";
}

export async function getStoryAccessContext(req) {
  const admin = isAdminRequest(req);
  const student = getStudentSession(req);
  const impersonating = req.headers["x-impersonate-student-id"] || null;

  if (admin && impersonating) {
    const { rows } = await query(
      `SELECT s.id, s.class_id, s.display_name, s.username, c.slug AS class_slug, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`,
      [impersonating]
    );
    if (rows.length) {
      return {
        role: "student",
        studentId: rows[0].id,
        classId: rows[0].class_id,
        classSlug: rows[0].class_slug,
        displayName: rows[0].display_name,
        username: rows[0].username,
        impersonating: true,
      };
    }
  }

  if (student?.studentId) {
    return {
      role: "student",
      studentId: student.studentId,
      classId: student.classId,
      classSlug: student.classSlug,
      displayName: student.displayName,
      username: student.username,
      impersonating: false,
    };
  }

  if (admin) {
    return { role: "admin" };
  }

  return { role: "anonymous" };
}

export function storyListSql(ctx) {
  if (ctx.role === "admin") {
    return {
      sql: `SELECT slug, title, published, status, owner_student_id, class_id FROM stories ORDER BY updated_at DESC`,
      params: [],
    };
  }
  if (ctx.role === "student") {
    return {
      sql: `SELECT slug, title, published, status, owner_student_id, class_id FROM stories
            WHERE owner_student_id = $1
               OR (class_id = $2 AND published = TRUE)
            ORDER BY updated_at DESC`,
      params: [ctx.studentId, ctx.classId],
    };
  }
  return {
    sql: `SELECT slug, title, published, status, owner_student_id, class_id FROM stories
          WHERE published = TRUE ORDER BY slug`,
    params: [],
  };
}

export async function canReadStory(ctx, slug) {
  const { rows } = await query(
    `SELECT slug, published, owner_student_id, class_id FROM stories WHERE slug = $1`,
    [slug]
  );
  if (!rows.length) return { ok: false, reason: "not_found" };
  const story = rows[0];
  if (ctx.role === "admin") return { ok: true, story };
  if (ctx.role === "student") {
    if (story.owner_student_id === ctx.studentId) return { ok: true, story };
    if (story.published && story.class_id === ctx.classId) return { ok: true, story };
    return { ok: false, reason: "forbidden" };
  }
  if (story.published) return { ok: true, story };
  return { ok: false, reason: "forbidden" };
}

export async function canWriteStory(ctx, slug) {
  if (ctx.role === "admin") return { ok: true };
  if (ctx.role !== "student") return { ok: false, reason: "auth_required" };
  if (!slug) return { ok: true };
  const { rows } = await query(
    `SELECT owner_student_id FROM stories WHERE slug = $1`,
    [slug]
  );
  if (!rows.length) return { ok: true };
  if (rows[0].owner_student_id === ctx.studentId) return { ok: true };
  return { ok: false, reason: "forbidden" };
}

export function buildStudentSlug(ctx, baseSlug) {
  const prefix = `${ctx.classSlug}-${ctx.username}-`;
  const raw = String(baseSlug || "story").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "story";
  if (cleaned.startsWith(prefix)) return cleaned.slice(0, 64);
  return `${prefix}${cleaned}`.slice(0, 64);
}
