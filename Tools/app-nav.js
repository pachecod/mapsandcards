/**
 * Signed-in side navigation for the home page (and other app shells).
 * Matches the builder nav rail so users can return to their stories.
 */
(function (global) {
  "use strict";

  var BUILDER_URL = "/Tools/scroll-map-builder.html";
  var ICONS = {
    home:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>',
    editor:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    stories:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    account:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>',
  };

  function lastStorySlug() {
    try {
      return localStorage.getItem("mapsandcards-active-story-slug") || "";
    } catch (e) {
      return "";
    }
  }

  function builderUrl(slug) {
    var q = slug ? "?story=" + encodeURIComponent(slug) : "";
    return BUILDER_URL + q;
  }

  function detectSession() {
    return fetch("/api/platform/v1/auth/admin/me", { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error();
        return { role: "admin", summary: "Admin — featured stories save live to the site." };
      })
      .catch(function () {
        return fetch("/api/platform/v1/auth/student/me", { credentials: "include" })
          .then(function (r) {
            if (!r.ok) throw new Error();
            return r.json();
          })
          .then(function (data) {
            if (!data || !data.student) return null;
            return {
              role: "student",
              student: data.student,
              summary:
                "Signed in as " + data.student.displayName + " · " + data.student.className,
            };
          });
      })
      .catch(function () {
        return null;
      });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init(opts) {
    opts = opts || {};
    var layout = document.getElementById("app-layout");
    if (!layout) return;

    detectSession().then(function (session) {
      if (!session) return;
      mountNav(layout, session, opts);
    });
  }

  function mountNav(layout, session, opts) {
    var activePage = opts.page || "home";
    var lastSlug = lastStorySlug();

    var rail = document.createElement("nav");
    rail.className = "app-nav-rail";
    rail.setAttribute("aria-label", "App navigation");
    rail.innerHTML =
      '<a href="/index.html" class="nav-rail-btn' +
      (activePage === "home" ? " active" : "") +
      '" data-label="Home" title="Home">' +
      ICONS.home +
      "</a>" +
      '<div class="nav-rail-divider" aria-hidden="true"></div>' +
      '<a href="' +
      escapeHtml(builderUrl(lastSlug)) +
      '" class="nav-rail-btn' +
      (activePage === "builder" ? " active" : "") +
      '" data-label="Editor" title="Open editor">' +
      ICONS.editor +
      "</a>" +
      '<button type="button" class="nav-rail-btn" id="app-nav-stories-toggle" data-label="My Stories" title="My stories" aria-expanded="false" aria-controls="app-nav-stories-panel">' +
      ICONS.stories +
      "</button>" +
      '<button type="button" class="nav-rail-btn" id="app-nav-account-toggle" data-label="Account" title="Account" aria-expanded="false" aria-controls="app-nav-account-panel" aria-label="Account">' +
      ICONS.account +
      "</button>";

    var storiesPanel = document.createElement("aside");
    storiesPanel.className = "app-nav-flyout";
    storiesPanel.id = "app-nav-stories-panel";
    storiesPanel.hidden = true;
    storiesPanel.setAttribute("aria-label", "My stories");
    storiesPanel.innerHTML =
      '<div class="app-nav-flyout-head">' +
      "<h2>My stories</h2>" +
      '<button type="button" class="app-nav-panel-close" id="app-nav-stories-close" aria-label="Close stories panel">&times;</button>' +
      "</div>" +
      '<div class="app-nav-flyout-body">' +
      '<p class="app-nav-field-hint">Open a story in the editor or start a new one.</p>' +
      '<a class="app-nav-flyout-btn btn-primary" id="app-nav-open-editor" href="' +
      escapeHtml(builderUrl(lastSlug)) +
      '">Open editor</a>' +
      '<a class="app-nav-flyout-btn" id="app-nav-new-story" href="' +
      escapeHtml(BUILDER_URL) +
      '">New story</a>' +
      '<div class="app-nav-divider" aria-hidden="true"></div>' +
      '<div class="app-nav-story-list" id="app-nav-story-list"><p class="app-nav-field-hint">Loading…</p></div>' +
      "</div>";

    var accountPanel = document.createElement("aside");
    accountPanel.className = "app-nav-flyout";
    accountPanel.id = "app-nav-account-panel";
    accountPanel.hidden = true;
    accountPanel.setAttribute("aria-label", "Account");
    accountPanel.innerHTML =
      '<div class="app-nav-flyout-head">' +
      "<h2>Account</h2>" +
      '<button type="button" class="app-nav-panel-close" id="app-nav-account-close" aria-label="Close account panel">&times;</button>' +
      "</div>" +
      '<div class="app-nav-flyout-body">' +
      '<p class="app-nav-account-summary" id="app-nav-account-summary">' +
      escapeHtml(session.summary) +
      "</p>" +
      '<button type="button" class="app-nav-flyout-btn btn-danger" id="nav-account-signout">Sign out</button>' +
      "</div>";

    layout.insertBefore(rail, layout.firstChild);
    layout.insertBefore(storiesPanel, layout.children[1] || null);
    layout.insertBefore(accountPanel, layout.children[2] || null);

    wireFlyouts();
    loadStoryList(session);
    bindSessionActions(session);
  }

  function wireFlyouts() {
    var flyouts = [
      { panelId: "app-nav-stories-panel", toggleId: "app-nav-stories-toggle", closeId: "app-nav-stories-close" },
      { panelId: "app-nav-account-panel", toggleId: "app-nav-account-toggle", closeId: "app-nav-account-close" },
    ];

    function closeExcept(exceptPanelId) {
      flyouts.forEach(function (entry) {
        if (entry.panelId === exceptPanelId) return;
        var panel = document.getElementById(entry.panelId);
        var toggle = document.getElementById(entry.toggleId);
        if (panel) panel.hidden = true;
        if (toggle) {
          toggle.classList.remove("active");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    function setOpen(panelId, toggleId, open) {
      var panel = document.getElementById(panelId);
      var toggle = document.getElementById(toggleId);
      if (!panel || !toggle) return;
      if (open) closeExcept(panelId);
      panel.hidden = !open;
      toggle.classList.toggle("active", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    flyouts.forEach(function (entry) {
      var panel = document.getElementById(entry.panelId);
      var toggle = document.getElementById(entry.toggleId);
      var closeBtn = document.getElementById(entry.closeId);
      if (toggle && panel) {
        toggle.addEventListener("click", function (e) {
          e.stopPropagation();
          setOpen(entry.panelId, entry.toggleId, panel.hidden);
        });
      }
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          setOpen(entry.panelId, entry.toggleId, false);
        });
      }
    });

    document.addEventListener("click", function (e) {
      flyouts.forEach(function (entry) {
        var panel = document.getElementById(entry.panelId);
        var toggle = document.getElementById(entry.toggleId);
        if (
          panel &&
          !panel.hidden &&
          !e.target.closest("#" + entry.panelId) &&
          !e.target.closest("#" + entry.toggleId)
        ) {
          setOpen(entry.panelId, entry.toggleId, false);
        }
      });
    });
  }

  function loadStoryList(session) {
    var listEl = document.getElementById("app-nav-story-list");
    if (!listEl) return;

    fetch("/__story-api/list", { cache: "no-store", credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(function (data) {
        var stories = (data && data.stories) || [];
        var titles = (data && data.titles) || {};
        if (!stories.length) {
          listEl.innerHTML =
            '<p class="app-nav-field-hint" style="margin:0">No stories yet. Use <strong>New story</strong> to create one in the editor.</p>';
          return;
        }
        listEl.innerHTML = stories
          .map(function (slug) {
            var title = titles[slug] || slug;
            return (
              '<a class="app-nav-story-item" href="' +
              escapeHtml(builderUrl(slug)) +
              '"><strong>' +
              escapeHtml(title) +
              "</strong><span>" +
              escapeHtml(slug) +
              "</span></a>"
            );
          })
          .join("");
      })
      .catch(function () {
        listEl.innerHTML =
          '<p class="app-nav-field-hint" style="margin:0">Could not load stories. Try opening the editor directly.</p>';
      });
  }

  function bindSessionActions(session) {
    var Auth = global.MapsAndCardsBuilderAuth;
    if (!Auth) return;
    if (session.role === "admin" && typeof Auth.bindAdminSessionBar === "function") {
      Auth.bindAdminSessionBar();
    } else if (session.role === "student" && typeof Auth.bindStudentSessionBar === "function") {
      Auth.bindStudentSessionBar();
    }
  }

  global.MapsAndCardsAppNav = {
    init: init,
    detectSession: detectSession,
    builderUrl: builderUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
