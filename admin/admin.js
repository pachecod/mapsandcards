const API = "/api/platform/v1";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginError = document.getElementById("login-error");

let classesCache = [];

async function ensureAdmin() {
  try {
    await api("/auth/admin/me");
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    clearBootstrapError();
    try {
      await bootstrap();
    } catch (e) {
      showBootstrapError(e.message);
    }
  } catch {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
}

function showBootstrapError(message) {
  let el = document.getElementById("bootstrap-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "bootstrap-error";
    el.className = "error";
    document.querySelector(".content")?.prepend(el);
  }
  el.textContent = message.includes("Database not configured")
    ? "Database not configured. Set DATABASE_URL in .env and run npm run db:migrate."
    : `Could not load admin data: ${message}`;
  el.classList.remove("hidden");
}

function clearBootstrapError() {
  document.getElementById("bootstrap-error")?.classList.add("hidden");
}

async function bootstrap() {
  await loadClasses();
  await loadStudents();
  await loadSettings();
  await loadCommonFiles();
  await loadSubmissions();
  await loadLegalPage();
  fillClassSelects();
  fillAdminStudentSelect();
}

document.getElementById("btn-admin-login").addEventListener("click", async () => {
  loginError.classList.add("hidden");
  try {
    await api("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: document.getElementById("admin-password").value }),
    });
    await ensureAdmin();
  } catch (e) {
    loginError.textContent = e.message;
    loginError.classList.remove("hidden");
  }
});

document.getElementById("btn-admin-logout").addEventListener("click", async () => {
  await api("/auth/admin/logout", { method: "POST" });
  location.reload();
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

async function loadClasses() {
  const { classes } = await api("/admin/classes");
  classesCache = classes;
  const list = document.getElementById("classes-list");
  list.innerHTML = classes.length
    ? classes
        .map(
          (c) => `<div class="card" data-id="${c.id}">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="meta">${escapeHtml(c.description || "No description")} · ${c.student_count} students</span>
        <button type="button" data-action="edit-class">Edit</button>
        <button type="button" class="danger" data-action="delete-class">Delete</button>
      </div>`
        )
        .join("")
    : `<p class="meta">No classes yet. Add one to get started.</p>`;

  list.querySelectorAll("[data-action=edit-class]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card");
      const cls = classesCache.find((c) => c.id === card.dataset.id);
      if (!cls) return;
      document.getElementById("class-form").classList.remove("hidden");
      document.getElementById("class-id").value = cls.id;
      document.getElementById("class-name").value = cls.name;
      document.getElementById("class-description").value = cls.description || "";
    });
  });
  list.querySelectorAll("[data-action=delete-class]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      if (!confirm("Delete this class and all its students?")) return;
      await api(`/admin/classes/${id}`, { method: "DELETE" });
      await loadClasses();
      fillClassSelects();
    });
  });
}

document.getElementById("btn-add-class").addEventListener("click", () => {
  document.getElementById("class-form").classList.remove("hidden");
  document.getElementById("class-id").value = "";
  document.getElementById("class-name").value = "";
  document.getElementById("class-description").value = "";
});

document.getElementById("class-form-cancel").addEventListener("click", () => {
  document.getElementById("class-form").classList.add("hidden");
});

document.getElementById("class-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("class-id").value;
  const body = {
    name: document.getElementById("class-name").value,
    description: document.getElementById("class-description").value,
  };
  if (id) await api(`/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(body) });
  else await api("/admin/classes", { method: "POST", body: JSON.stringify(body) });
  document.getElementById("class-form").classList.add("hidden");
  await loadClasses();
  fillClassSelects();
});

function fillClassSelects() {
  const filter = document.getElementById("student-class-filter");
  const formSelect = document.getElementById("student-class-id");
  const subFilter = document.getElementById("submission-class-filter");
  const opts = classesCache
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");
  if (filter) filter.innerHTML = `<option value="">All classes</option>${opts}`;
  if (formSelect) formSelect.innerHTML = opts;
  if (subFilter) subFilter.innerHTML = `<option value="">All classes</option>${opts}`;
}

async function loadStudents() {
  const classId = document.getElementById("student-class-filter").value;
  const q = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  const { students } = await api(`/admin/students${q}`);
  const list = document.getElementById("students-list");
  list.innerHTML = students.length
    ? students
        .map(
          (s) => `<div class="card" data-id="${s.id}">
        <strong>${escapeHtml(s.display_name)}</strong>
        <span class="meta">${escapeHtml(s.class_name)} · @${escapeHtml(s.username)}${s.is_active ? "" : " · inactive"}</span>
        <button type="button" data-action="reset-pw">Reset password</button>
        <button type="button" data-action="impersonate">Open as student</button>
        <button type="button" class="danger" data-action="delete-student">Remove</button>
      </div>`
        )
        .join("")
    : `<p class="meta">No students in this view.</p>`;

  list.querySelectorAll("[data-action=reset-pw]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      const { plainPassword, student } = await api(`/admin/students/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      alert(`New password for ${student.display_name}: ${plainPassword}`);
    });
  });
  list.querySelectorAll("[data-action=impersonate]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      const data = await api(`/admin/students/${id}/impersonate`, { method: "POST" });
      window.open(data.builderUrl, "_blank");
    });
  });
  list.querySelectorAll("[data-action=delete-student]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      if (!confirm("Remove this student?")) return;
      await api(`/admin/students/${id}`, { method: "DELETE" });
      await loadStudents();
    });
  });
}

document.getElementById("student-class-filter").addEventListener("change", loadStudents);

document.getElementById("btn-add-student").addEventListener("click", () => {
  if (!classesCache.length) {
    alert("Create a class first.");
    return;
  }
  document.getElementById("student-form").classList.remove("hidden");
  document.getElementById("student-display-name").value = "";
  document.getElementById("student-password-optional").value = "";
});

document.getElementById("student-form-cancel").addEventListener("click", () => {
  document.getElementById("student-form").classList.add("hidden");
});

document.getElementById("student-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    classId: document.getElementById("student-class-id").value,
    displayName: document.getElementById("student-display-name").value,
    password: document.getElementById("student-password-optional").value || undefined,
  };
  const { plainPassword, student } = await api("/admin/students", {
    method: "POST",
    body: JSON.stringify(body),
  });
  document.getElementById("student-form").classList.add("hidden");
  alert(`Added ${student.display_name}. Password: ${plainPassword}`);
  await loadStudents();
});

document.getElementById("btn-password-report").addEventListener("click", async () => {
  const classId = document.getElementById("student-class-filter").value;
  const q = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  const { rows } = await api(`/admin/students/password-report${q}`);
  const pre = document.getElementById("password-report");
  pre.classList.remove("hidden");
  pre.textContent = rows.length
    ? rows.map((r) => `${r.class_name}\t${r.display_name}\t${r.username}`).join("\n")
    : "No students.";
});

async function loadSettings() {
  const { settings } = await api("/admin/settings");
  document.getElementById("setting-footer").value = settings.main_footer_html || "";
  document.getElementById("setting-export-help").value = settings.export_help_html || "";
  document.getElementById("setting-blocked").value = (settings.blocked_extensions || []).join(", ");
  document.getElementById("setting-templates").value = (settings.public_template_slugs || []).join(", ");
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  const status = document.getElementById("settings-status");
  status.textContent = "Saving…";
  try {
    await api("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        main_footer_html: document.getElementById("setting-footer").value,
        export_help_html: document.getElementById("setting-export-help").value,
        blocked_extensions: document
          .getElementById("setting-blocked")
          .value.split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
        public_template_slugs: document
          .getElementById("setting-templates")
          .value.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    status.textContent = "Saved.";
  } catch (e) {
    status.textContent = e.message;
  }
});

async function loadCommonFiles() {
  const { assets } = await api("/admin/files/common");
  const list = document.getElementById("common-files-list");
  list.innerHTML = assets.length
    ? assets
        .map(
          (a) => `<div class="card" data-id="${a.id}">
        <strong>${escapeHtml(a.filename)}</strong>
        <span class="meta">${escapeHtml(a.category)} · ${formatBytes(a.size_bytes)}</span>
        <a href="${escapeHtml(a.public_url)}" target="_blank" rel="noopener">Open</a>
        <button type="button" class="danger" data-action="delete-file">Delete</button>
      </div>`
        )
        .join("")
    : `<p class="meta">No common files yet.</p>`;

  list.querySelectorAll("[data-action=delete-file]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      if (!confirm("Delete this file?")) return;
      await api(`/admin/files/common/${id}`, { method: "DELETE" });
      await loadCommonFiles();
    });
  });
}

function fillAdminStudentSelect() {
  const sel = document.getElementById("admin-student-files-select");
  if (!sel) return;
  api("/admin/students")
    .then(({ students }) => {
      sel.innerHTML =
        '<option value="">Choose student…</option>' +
        students
          .map(
            (s) =>
              `<option value="${s.id}">${escapeHtml(s.display_name)} (${escapeHtml(s.class_name)})</option>`
          )
          .join("");
    })
    .catch(() => {});
}

async function loadSubmissions() {
  const classId = document.getElementById("submission-class-filter")?.value || "";
  const q = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  const { submissions } = await api(`/admin/submissions${q}`);
  const list = document.getElementById("submissions-list");
  if (!list) return;
  list.innerHTML = submissions.length
    ? submissions
        .map(
          (s) => `<div class="card" data-id="${s.id}">
        <strong>${escapeHtml(s.story_title || s.story_slug)}</strong>
        <span class="meta">${escapeHtml(s.student_name)} · ${escapeHtml(s.class_name)} · ${new Date(s.submitted_at).toLocaleString()}</span>
        <a href="/Stories/${encodeURIComponent(s.story_slug)}/scroll-map-story.html" target="_blank" rel="noopener">View</a>
        <button type="button" data-review>Mark reviewed</button>
      </div>`
        )
        .join("")
    : `<p class="meta">No submissions yet.</p>`;
  list.querySelectorAll("[data-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      const comment = prompt("Admin comment (optional):") || "";
      await api(`/admin/submissions/${id}`, {
        method: "PUT",
        body: JSON.stringify({ adminComment: comment }),
      });
      await loadSubmissions();
    });
  });
}

document.getElementById("submission-class-filter")?.addEventListener("change", loadSubmissions);

async function loadLegalPage() {
  const page = document.getElementById("legal-page-select")?.value || "terms";
  const { page: data } = await api(`/admin/legal/${page}`);
  document.getElementById("legal-title").value = data.title || "";
  document.getElementById("legal-body").value = data.body_html || "";
}

document.getElementById("legal-page-select")?.addEventListener("change", loadLegalPage);

document.getElementById("btn-save-legal")?.addEventListener("click", async () => {
  const page = document.getElementById("legal-page-select").value;
  const status = document.getElementById("legal-status");
  status.textContent = "Saving…";
  try {
    await api(`/admin/legal/${page}`, {
      method: "PUT",
      body: JSON.stringify({
        title: document.getElementById("legal-title").value,
        bodyHtml: document.getElementById("legal-body").value,
      }),
    });
    status.textContent = "Saved.";
  } catch (e) {
    status.textContent = e.message;
  }
});

document.getElementById("admin-student-files-select")?.addEventListener("change", async (e) => {
  const id = e.target.value;
  const filesList = document.getElementById("admin-student-files-list");
  const storiesList = document.getElementById("admin-student-stories-list");
  if (!id) {
    filesList.innerHTML = "";
    storiesList.innerHTML = "";
    return;
  }
  const [{ assets }, { stories }] = await Promise.all([
    api(`/admin/files/student/${id}`),
    api(`/admin/students/${id}/stories`),
  ]);
  filesList.innerHTML = assets.length
    ? assets
        .map(
          (a) => `<div class="card"><strong>${escapeHtml(a.filename)}</strong>
        <a href="${escapeHtml(a.public_url)}" target="_blank">Open</a></div>`
        )
        .join("")
    : `<p class="meta">No files.</p>`;
  storiesList.innerHTML = stories.length
    ? stories
        .map(
          (s) => `<div class="card"><strong>${escapeHtml(s.title)}</strong>
        <span class="meta">${escapeHtml(s.slug)} · ${escapeHtml(s.status)}</span>
        <a href="/Stories/${encodeURIComponent(s.slug)}/scroll-map-story.html" target="_blank">View</a></div>`
        )
        .join("")
    : `<p class="meta">No stories.</p>`;
});

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

document.getElementById("common-file-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const dataBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const category = file.type.startsWith("image/") ? "images" : file.name.endsWith(".geojson") ? "geojson" : "other";
  await api("/admin/files/common", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, category, dataBase64 }),
  });
  e.target.value = "";
  await loadCommonFiles();
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

ensureAdmin();
