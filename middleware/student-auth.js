import crypto from "crypto";
import bcrypt from "bcrypt";
import { createSessionHelpers } from "../lib/session.js";
import { query, isDbEnabled } from "../services/db-service.js";

const STUDENT_SESSION_SECRET =
  process.env.STUDENT_SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(process.env.APP_PASSWORD || "mapsandcards-student-dev")
    .digest("hex");

const studentSession = createSessionHelpers({
  cookieName: "mc_student_session",
  secret: STUDENT_SESSION_SECRET,
  role: "student",
});

const SALT_ROUNDS = 10;

export function getStudentSession(req) {
  return studentSession.getSessionFromRequest(req);
}

export function requireStudentApi(req, res, next) {
  const sess = getStudentSession(req);
  if (!sess?.studentId) {
    return res.status(401).json({ error: "Student authentication required" });
  }
  req.studentSession = sess;
  return next();
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyStudentPassword(classId, studentId, password) {
  const { rows } = await query(
    `SELECT s.id, s.class_id, s.display_name, s.username, s.password_hash, s.is_active,
            c.name AS class_name, c.slug AS class_slug
     FROM students s
     JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.class_id = $2 AND s.is_active = TRUE`,
    [studentId, classId]
  );
  if (!rows.length) return null;
  const student = rows[0];
  if (!student.password_hash) return null;
  const ok = await bcrypt.compare(password, student.password_hash);
  if (!ok) return null;
  return student;
}

export async function handleStudentLogin(req, res) {
  if (!isDbEnabled()) {
    return res.status(503).json({ error: "Database not configured" });
  }
  const { classId, studentId, password } = req.body || {};
  if (!classId || !studentId || !password) {
    return res.status(400).json({ error: "classId, studentId, and password are required" });
  }
  try {
    const student = await verifyStudentPassword(classId, studentId, password);
    if (!student) {
      return res.status(401).json({ error: "Invalid class, student, or password" });
    }
    const token = studentSession.createToken({
      studentId: student.id,
      classId: student.class_id,
      displayName: student.display_name,
      username: student.username,
      className: student.class_name,
      classSlug: student.class_slug,
    });
    studentSession.setCookie(res, token);
    return res.json({
      ok: true,
      student: {
        id: student.id,
        displayName: student.display_name,
        username: student.username,
        classId: student.class_id,
        className: student.class_name,
      },
    });
  } catch (err) {
    console.error("[student-auth] login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
}

export function handleStudentLogout(_req, res) {
  studentSession.clearCookie(res);
  res.json({ ok: true });
}

export function handleStudentMe(req, res) {
  const sess = getStudentSession(req);
  if (!sess?.studentId) {
    return res.status(401).json({ error: "Not signed in" });
  }
  return res.json({
    ok: true,
    student: {
      id: sess.studentId,
      displayName: sess.displayName,
      username: sess.username,
      classId: sess.classId,
      className: sess.className,
    },
  });
}

export { studentSession };
