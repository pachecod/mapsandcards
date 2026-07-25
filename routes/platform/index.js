import { Router } from "express";
import {
  listPublicClasses,
  listPublicStudentsInClass,
  listClassesAdmin,
  createClass,
  updateClass,
  deleteClass,
  listStudentsAdmin,
  createStudent,
  updateStudent,
  deleteStudent,
  resetStudentPassword,
  passwordReport,
  getSiteSettings,
  updateSiteSettings,
  listCommonAssets,
  uploadCommonAsset,
  deleteCommonAsset,
  listStudentAssets,
  uploadStudentAsset,
  deleteStudentAsset,
  deleteStudentAssetAdmin,
  platformDbRequired,
  getLegalPage,
  updateLegalPage,
  listSubmissions,
  reviewSubmission,
  createPlatformAuthToken,
  redeemPlatformAuthToken,
  listAdminStudentStories,
} from "../../services/platform-service.js";
import {
  requireAdminApi,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminMe,
} from "../../middleware/admin-auth.js";
import {
  requireStudentApi,
  handleStudentLogin,
  handleStudentLogout,
  handleStudentMe,
  getStudentSession,
  studentSession,
} from "../../middleware/student-auth.js";

const router = Router();

function corsPlatform(req, res, next) {
  const origins = (process.env.PLATFORM_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

router.use(corsPlatform);

router.post("/auth/admin/login", (req, res) => handleAdminLogin(req, res));
router.post("/auth/admin/logout", (req, res) => handleAdminLogout(req, res));
router.get("/auth/admin/me", (req, res) => handleAdminMe(req, res));

router.post("/auth/student/login", (req, res) => handleStudentLogin(req, res));
router.post("/auth/student/logout", (req, res) => handleStudentLogout(req, res));
router.get("/auth/student/me", (req, res) => handleStudentMe(req, res));

router.get("/classes", async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ classes: await listPublicClasses() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/classes/:classId/students", async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ students: await listPublicStudentsInClass(req.params.classId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/settings/public", async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const settings = await getSiteSettings();
    res.json({
      main_footer_html: settings.main_footer_html || "",
      export_help_html: settings.export_help_html || "",
      public_template_slugs: settings.public_template_slugs || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/classes", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ classes: await listClassesAdmin() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/classes", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const cls = await createClass(req.body || {});
    res.status(201).json({ class: cls });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/admin/classes/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const cls = await updateClass(req.params.id, req.body || {});
    res.json({ class: cls });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/admin/classes/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    await deleteClass(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/students", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ students: await listStudentsAdmin(req.query.classId || null) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/students", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const { student, plainPassword } = await createStudent(req.body || {});
    res.status(201).json({ student, plainPassword });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/admin/students/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const student = await updateStudent(req.params.id, req.body || {});
    res.json({ student });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/admin/students/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    await deleteStudent(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/admin/students/:id/reset-password", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const result = await resetStudentPassword(req.params.id, req.body?.password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/students/password-report", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const rows = await passwordReport(req.query.classId || null);
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/settings", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ settings: await getSiteSettings() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/settings", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ settings: await updateSiteSettings(req.body || {}) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/files/common", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ assets: await listCommonAssets() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/files/common", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const { filename, category, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: "filename and dataBase64 required" });
    }
    const settings = await getSiteSettings();
    const buffer = Buffer.from(dataBase64, "base64");
    const asset = await uploadCommonAsset({
      category,
      filename,
      buffer,
      blocked: settings.blocked_extensions || [],
    });
    res.status(201).json({ asset });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/admin/files/common/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    await deleteCommonAsset(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/files/student", requireStudentApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ assets: await listStudentAssets(req.studentSession.studentId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/files/student", requireStudentApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const { filename, category, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: "filename and dataBase64 required" });
    }
    const settings = await getSiteSettings();
    const buffer = Buffer.from(dataBase64, "base64");
    const asset = await uploadStudentAsset({
      studentId: req.studentSession.studentId,
      classSlug: req.studentSession.classSlug,
      category,
      filename,
      buffer,
      blocked: settings.blocked_extensions || [],
    });
    res.status(201).json({ asset });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/files/student/:id", requireStudentApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    await deleteStudentAsset(req.params.id, req.studentSession.studentId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/files/student/:studentId", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ assets: await listStudentAssets(req.params.studentId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/admin/files/student/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    await deleteStudentAssetAdmin(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/legal/:page", async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const page = await getLegalPage(req.params.page);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json({ page });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/legal/:page", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const page = await getLegalPage(req.params.page);
    res.json({ page: page || { page: req.params.page, title: "", body_html: "" } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/legal/:page", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const page = await updateLegalPage(req.params.page, {
      title: req.body?.title,
      bodyHtml: req.body?.bodyHtml,
    });
    res.json({ page });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/submissions", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ submissions: await listSubmissions({ classId: req.query.classId || null }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/submissions/:id", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const submission = await reviewSubmission(req.params.id, {
      adminComment: req.body?.adminComment,
      reviewed: req.body?.reviewed !== false,
    });
    res.json({ submission });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/admin/students/:studentId/stories", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    res.json({ stories: await listAdminStudentStories(req.params.studentId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/students/:studentId/impersonate", requireAdminApi, async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const { token, expiresAt } = await createPlatformAuthToken({
      studentId: req.params.studentId,
      ttlSeconds: 600,
    });
    res.json({
      ok: true,
      builderUrl: `/Tools/scroll-map-builder.html?handoff=${encodeURIComponent(token)}`,
      token,
      expiresAt,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/auth/student/handoff", async (req, res) => {
  if (!platformDbRequired(res)) return;
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "token required" });
    const student = await redeemPlatformAuthToken(token);
    if (!student) return res.status(401).json({ error: "Invalid or expired token" });
    const sessToken = studentSession.createToken({
      studentId: student.id,
      classId: student.class_id,
      displayName: student.display_name,
      username: student.username,
      className: student.class_name,
      classSlug: student.class_slug,
    });
    studentSession.setCookie(res, sessToken);
    res.json({
      ok: true,
      student: {
        id: student.id,
        displayName: student.display_name,
        username: student.username,
        classId: student.class_id,
        className: student.class_name,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
