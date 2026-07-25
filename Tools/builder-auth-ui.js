/**
 * Builder session UI — guest sign-out, guest→student upgrade overlay, student logout.
 * Patterns from WebXRIDE student-auth-ui.js (local reference).
 */
(function (global) {
  "use strict";

  var API = "/api/platform/v1";
  var STYLE_ID = "builder-auth-ui-styles";

  var CSS =
    ".builder-auth-overlay{position:fixed;inset:0;z-index:200001;display:flex!important;" +
    "align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;}" +
    ".builder-auth-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.82);}" +
    ".builder-auth-dialog{position:relative;z-index:1;width:min(100%,420px);max-height:min(88vh,560px);" +
    "overflow:auto;background:linear-gradient(135deg,#1a2332 0%,#0f1419 100%);border:1px solid rgba(255,255,255,.14);" +
    "border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#e8eaed;padding:1.25rem 1.35rem 1.35rem;}" +
    ".builder-auth-dialog h2{margin:0 0 .35rem;font-size:1.05rem;}" +
    ".builder-auth-subtitle{margin:0 0 1rem;font-size:.8rem;color:#9aa7b2;}" +
    ".builder-auth-error{margin:0 0 .75rem;font-size:.8rem;color:#dc3545;}" +
    ".builder-auth-back{background:none;border:none;color:#9aa7b2;cursor:pointer;padding:0;margin:0 0 .75rem;font-size:.8rem;}" +
    ".builder-auth-back:hover{color:#3d8bfd;}" +
    ".builder-auth-list{display:flex;flex-direction:column;gap:.45rem;}" +
    ".builder-auth-pick{width:100%;text-align:left;padding:.65rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,.14);" +
    "background:rgba(0,0,0,.22);color:#e8eaed;cursor:pointer;font:inherit;font-size:.9rem;}" +
    ".builder-auth-pick:hover{border-color:#3d8bfd;}" +
    ".builder-auth-pick small{display:block;color:#9aa7b2;font-size:.75rem;margin-top:.15rem;}" +
    ".builder-auth-field label{display:block;font-size:.8rem;color:#9aa7b2;margin-bottom:.35rem;}" +
    ".builder-auth-field input{width:100%;padding:.55rem .65rem;border-radius:6px;border:1px solid rgba(255,255,255,.18);" +
    "background:rgba(0,0,0,.25);color:#e8eaed;font:inherit;box-sizing:border-box;margin-bottom:.75rem;}" +
    ".builder-auth-submit{width:100%;padding:.6rem;border:none;border-radius:8px;background:#3d8bfd;color:#fff;" +
    "font:inherit;font-weight:600;cursor:pointer;}" +
    ".builder-auth-submit:hover{opacity:.92;}" +
    ".builder-auth-summary{background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);border-radius:8px;" +
    "padding:.65rem .75rem;margin-bottom:.85rem;font-size:.85rem;}" +
    ".builder-auth-summary dt{color:#9aa7b2;font-size:.72rem;margin-top:.35rem;}" +
    ".builder-auth-summary dt:first-child{margin-top:0;}" +
    ".builder-auth-summary dd{margin:.1rem 0 0;font-weight:600;}";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function api(path, options) {
    options = options || {};
    return fetch(API + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      method: options.method || "GET",
      body: options.body,
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!r.ok) throw new Error(data.error || r.statusText || "Request failed");
        return data;
      });
    });
  }

  function closeOverlay(id) {
    var el = document.getElementById(id || "builder-auth-overlay");
    if (el) el.remove();
    document.body.classList.remove("guest-agreement-open");
  }

  function promptGuestSignInWarning() {
    if (global.MapsAndCardsGuestAgreement && global.MapsAndCardsGuestAgreement.promptGuestSignInWarning) {
      return global.MapsAndCardsGuestAgreement.promptGuestSignInWarning();
    }
    return Promise.resolve(
      confirm(
        "Signing in does not upload guest work automatically.\n\n" +
          "You can import your current draft after sign-in, or use Export before signing in.\n\nContinue to sign in?"
      )
    );
  }

  function importGuestSlug(slug) {
    var Guest = global.MapsAndCardsGuest;
    if (!Guest || !slug) return Promise.reject(new Error("No guest draft to import."));
    var project = Guest.loadProject(slug);
    var config = project ? Guest.configFromProject(project) : null;
    if (!config) return Promise.reject(new Error("Invalid guest project."));
    return fetch("/__story-api/import-guest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug, config: config }),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || "Import failed");
        return d;
      });
    });
  }

  function offerGuestImport(slug) {
    if (!slug) return Promise.resolve(null);
    if (
      !confirm(
        'Import your guest draft "' +
          slug +
          '" to your student account?\n\nYou can then save to the server and submit to your admin.'
      )
    ) {
      return Promise.resolve(null);
    }
    return importGuestSlug(slug);
  }

  function showStudentLoginOverlay(options) {
    options = options || {};
    ensureStyles();
    closeOverlay();

    var overlay = document.createElement("div");
    overlay.id = "builder-auth-overlay";
    overlay.className = "builder-auth-overlay guest-agreement-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    var dialog = document.createElement("div");
    dialog.className = "builder-auth-dialog";
    var backdrop = document.createElement("div");
    backdrop.className = "builder-auth-backdrop";
    overlay.appendChild(backdrop);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);
    document.body.classList.add("guest-agreement-open");

    var classes = [];
    var students = [];
    var selectedClass = null;
    var selectedStudent = null;
    var errorEl = null;

    function showError(msg) {
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "builder-auth-error";
        dialog.insertBefore(errorEl, dialog.firstChild.nextSibling);
      }
      errorEl.textContent = msg || "";
      errorEl.hidden = !msg;
    }

    function renderClassStep() {
      selectedClass = null;
      selectedStudent = null;
      showError("");
      dialog.innerHTML =
        "<h2>Sign in to your class</h2>" +
        '<p class="builder-auth-subtitle">Step 1 of 3 — Choose your class</p>' +
        (options.guestUpgrade
          ? '<button type="button" class="builder-auth-back" id="builder-auth-cancel">← Back to guest editor</button>'
          : "") +
        '<div class="builder-auth-list" id="builder-auth-list"></div>';

      if (options.guestUpgrade) {
        document.getElementById("builder-auth-cancel").addEventListener("click", function () {
          closeOverlay();
          if (typeof options.onCancel === "function") options.onCancel();
        });
      }

      var list = document.getElementById("builder-auth-list");
      if (!classes.length) {
        list.innerHTML =
          '<p style="color:#9aa7b2;font-size:.85rem;margin:0;">No classes yet. Ask your teacher to add you.</p>';
        return;
      }
      classes.forEach(function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "builder-auth-pick";
        btn.innerHTML =
          escapeHtml(c.name) +
          "<small>" +
          (c.student_count || 0) +
          " student(s)</small>";
        btn.addEventListener("click", function () {
          selectedClass = c;
          renderStudentStep();
        });
        list.appendChild(btn);
      });
    }

    function renderStudentStep() {
      showError("");
      dialog.innerHTML =
        "<h2>Sign in to your class</h2>" +
        '<p class="builder-auth-subtitle">Step 2 of 3 — Choose your name (' +
        escapeHtml(selectedClass.name) +
        ")</p>" +
        '<button type="button" class="builder-auth-back" id="builder-auth-back-class">← Back to classes</button>' +
        '<div class="builder-auth-list" id="builder-auth-list"><p style="color:#9aa7b2;">Loading…</p></div>';

      document.getElementById("builder-auth-back-class").addEventListener("click", renderClassStep);

      api("/classes/" + encodeURIComponent(selectedClass.id) + "/students")
        .then(function (data) {
          students = data.students || [];
          var list = document.getElementById("builder-auth-list");
          list.innerHTML = "";
          if (!students.length) {
            list.innerHTML =
              '<p style="color:#9aa7b2;font-size:.85rem;margin:0;">No students in this class yet.</p>';
            return;
          }
          students.forEach(function (s) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "builder-auth-pick";
            btn.textContent = s.display_name;
            btn.addEventListener("click", function () {
              selectedStudent = s;
              renderPasswordStep();
            });
            list.appendChild(btn);
          });
        })
        .catch(function (e) {
          showError(e.message);
        });
    }

    function renderPasswordStep() {
      showError("");
      dialog.innerHTML =
        "<h2>Sign in to your class</h2>" +
        '<p class="builder-auth-subtitle">Step 3 of 3 — Enter your password</p>' +
        '<button type="button" class="builder-auth-back" id="builder-auth-back-student">← Back to names</button>' +
        '<dl class="builder-auth-summary">' +
        "<dt>Class</dt><dd>" +
        escapeHtml(selectedClass.name) +
        "</dd>" +
        "<dt>Name</dt><dd>" +
        escapeHtml(selectedStudent.display_name) +
        "</dd></dl>" +
        '<div class="builder-auth-field"><label for="builder-auth-password">Password you were given</label>' +
        '<input type="password" id="builder-auth-password" autocomplete="current-password" /></div>' +
        '<button type="button" class="builder-auth-submit" id="builder-auth-submit">Sign in</button>';

      document.getElementById("builder-auth-back-student").addEventListener("click", renderStudentStep);

      var passwordInput = document.getElementById("builder-auth-password");
      var submit = function () {
        showError("");
        var password = passwordInput.value;
        if (!password) {
          showError("Please enter your password.");
          return;
        }
        api("/auth/student/login", {
          method: "POST",
          body: JSON.stringify({
            classId: selectedClass.id,
            studentId: selectedStudent.id,
            password: password,
          }),
        })
          .then(function (data) {
            closeOverlay();
            if (typeof options.onSuccess === "function") options.onSuccess(data.student, data);
          })
          .catch(function (e) {
            showError(e.message);
            passwordInput.focus();
          });
      };

      document.getElementById("builder-auth-submit").addEventListener("click", submit);
      passwordInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") submit();
      });
      passwordInput.focus();
    }

    overlay.addEventListener("click", function (e) {
      if (e.target.classList.contains("builder-auth-backdrop") && options.guestUpgrade) {
        closeOverlay();
        if (typeof options.onCancel === "function") options.onCancel();
      }
    });

    api("/classes")
      .then(function (data) {
        classes = data.classes || [];
        renderClassStep();
      })
      .catch(function (e) {
        dialog.innerHTML =
          "<h2>Sign in</h2><p class=\"builder-auth-error\">" + escapeHtml(e.message) + "</p>";
      });
  }

  function bindGuestSessionBar(opts) {
    opts = opts || {};
    var signOutBtn = document.getElementById("builder-session-guest-signout");
    var signInBtn = document.getElementById("builder-session-guest-signin");
    if (signOutBtn && signOutBtn.dataset.bound !== "1") {
      signOutBtn.dataset.bound = "1";
      signOutBtn.addEventListener("click", function () {
        if (!confirm("Sign out of guest mode and return to the welcome screen?")) return;
        window.location.href = "/Tools/student-login.html";
      });
    }
    if (signInBtn && signInBtn.dataset.bound !== "1") {
      signInBtn.dataset.bound = "1";
      signInBtn.addEventListener("click", function () {
        promptGuestSignInWarning().then(function (proceed) {
          if (!proceed) return;
          var slug =
            typeof opts.getCurrentSlug === "function" ? opts.getCurrentSlug() : opts.currentSlug;
          showStudentLoginOverlay({
            guestUpgrade: true,
            onSuccess: function () {
              offerGuestImport(slug)
                .then(function (result) {
                  if (result && result.slug) {
                    window.location.href =
                      "/Tools/scroll-map-builder.html?story=" + encodeURIComponent(result.slug);
                  } else {
                    window.location.href = "/Tools/scroll-map-builder.html";
                  }
                })
                .catch(function (e) {
                  alert(e.message || "Import failed");
                  window.location.href = "/Tools/scroll-map-builder.html";
                });
            },
          });
        });
      });
    }
  }

  function bindStudentSessionBar() {
    var signOutBtn = document.getElementById("builder-session-signout");
    if (!signOutBtn || signOutBtn.dataset.bound === "1") return;
    signOutBtn.dataset.bound = "1";
    signOutBtn.addEventListener("click", function () {
      if (!confirm("Log out and return to the sign-in screen?")) return;
      api("/auth/student/logout", { method: "POST" }).then(function () {
        window.location.href =
          "/Tools/student-login.html?next=" +
          encodeURIComponent("/Tools/scroll-map-builder.html");
      });
    });
  }

  global.MapsAndCardsBuilderAuth = {
    promptGuestSignInWarning: promptGuestSignInWarning,
    showStudentLoginOverlay: showStudentLoginOverlay,
    importGuestSlug: importGuestSlug,
    offerGuestImport: offerGuestImport,
    bindGuestSessionBar: bindGuestSessionBar,
    bindStudentSessionBar: bindStudentSessionBar,
  };
})(typeof window !== "undefined" ? window : globalThis);
