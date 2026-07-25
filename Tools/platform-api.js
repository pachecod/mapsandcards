/** Platform API client — WebxRide-compatible fetch adapter for /api/platform/v1 */
const BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PLATFORM_API_URL) ||
  "/api/platform/v1";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export const platformApi = {
  adminLogin: (password) => request("/auth/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => request("/auth/admin/logout", { method: "POST" }),
  adminMe: () => request("/auth/admin/me"),
  studentLogin: (classId, studentId, password) =>
    request("/auth/student/login", {
      method: "POST",
      body: JSON.stringify({ classId, studentId, password }),
    }),
  studentLogout: () => request("/auth/student/logout", { method: "POST" }),
  studentMe: () => request("/auth/student/me"),
  studentHandoff: (token) =>
    request("/auth/student/handoff", { method: "POST", body: JSON.stringify({ token }) }),
  listClasses: () => request("/classes"),
  listStudentsInClass: (classId) => request(`/classes/${classId}/students`),
  listClassesAdmin: () => request("/admin/classes"),
  createClass: (body) => request("/admin/classes", { method: "POST", body: JSON.stringify(body) }),
  updateClass: (id, body) => request(`/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteClass: (id) => request(`/admin/classes/${id}`, { method: "DELETE" }),
  listStudentsAdmin: (classId) =>
    request(`/admin/students${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`),
  createStudent: (body) => request("/admin/students", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (id, password) =>
    request(`/admin/students/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  passwordReport: (classId) =>
    request(`/admin/students/password-report${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`),
  getSettings: () => request("/admin/settings"),
  updateSettings: (body) => request("/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
  getPublicSettings: () => request("/settings/public"),
  listCommonFiles: () => request("/admin/files/common"),
  uploadCommonFile: (filename, category, dataBase64) =>
    request("/admin/files/common", {
      method: "POST",
      body: JSON.stringify({ filename, category, dataBase64 }),
    }),
  deleteCommonFile: (id) => request(`/admin/files/common/${id}`, { method: "DELETE" }),
  listStudentFiles: () => request("/files/student"),
  uploadStudentFile: (filename, category, dataBase64) =>
    request("/files/student", {
      method: "POST",
      body: JSON.stringify({ filename, category, dataBase64 }),
    }),
  deleteStudentFile: (id) => request(`/files/student/${id}`, { method: "DELETE" }),
  listSubmissions: (classId) =>
    request(`/admin/submissions${classId ? `?classId=${encodeURIComponent(classId)}` : ""}`),
  reviewSubmission: (id, body) =>
    request(`/admin/submissions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  getLegalPage: (page) => request(`/admin/legal/${page}`),
  updateLegalPage: (page, body) =>
    request(`/admin/legal/${page}`, { method: "PUT", body: JSON.stringify(body) }),
  impersonateStudent: (studentId) =>
    request(`/admin/students/${studentId}/impersonate`, { method: "POST" }),
  listStudentStories: (studentId) => request(`/admin/students/${studentId}/stories`),
};

export default platformApi;
