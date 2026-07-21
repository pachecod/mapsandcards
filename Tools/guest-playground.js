/**
 * Guest / Public Playground helpers — same contract as WebxRide PublicPlayground:
 * - localStorage key: playground-{id}
 * - Project: { name, framework: "html", files: [{ id, name, type, content }] }
 * - No server save; share via client-side ZIP (Export Local Site)
 *
 * Used by mapsandcards guest mode so embedding into WebxRide /play/:id is straightforward.
 */
(function (global) {
  "use strict";

  var PREFIX = "playground-";

  function storageKey(id) {
    return PREFIX + String(id || "").trim();
  }

  function listIds() {
    var ids = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var id = k.slice(PREFIX.length);
          if (id) ids.push(id);
        }
      }
    } catch (e) {}
    ids.sort();
    return ids;
  }

  function loadProject(id) {
    if (!id) return null;
    try {
      var raw = localStorage.getItem(storageKey(id));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.files)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function saveProject(id, project) {
    if (!id || !project) return false;
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(project));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeProject(id) {
    if (!id) return;
    try {
      localStorage.removeItem(storageKey(id));
    } catch (e) {}
  }

  /** Prevent `</script>` inside embedded JSON from closing the HTML script element. */
  function jsonSafeForHtmlScript(jsonStr) {
    return String(jsonStr).replace(/<\/script/gi, "<\\/script");
  }

  function injectEmbeddedStoryJson(html, jsonStr) {
    var safe = jsonSafeForHtmlScript(jsonStr);
    var re =
      /(<script\s+type="application\/json"\s+id="scroll-map-story-embedded"[^>]*>)([\s\S]*?)(<\/script>)/i;
    if (re.test(html)) {
      return html.replace(re, function (_, open, _mid, close) {
        return open + "\n" + safe + "\n" + close;
      });
    }
    var block =
      '\n  <script type="application/json" id="scroll-map-story-embedded">\n' +
      safe +
      "\n  </script>\n";
    var idx = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/maplibre-gl');
    if (idx !== -1) {
      return html.slice(0, idx) + block + html.slice(idx);
    }
    return html.replace(/<\/body>/i, block + "\n</body>");
  }

  function findFile(project, name) {
    if (!project || !project.files) return null;
    var lower = String(name).toLowerCase();
    for (var i = 0; i < project.files.length; i++) {
      var f = project.files[i];
      if (
        (f.name && f.name.toLowerCase() === lower) ||
        (f.id && String(f.id).toLowerCase() === lower)
      ) {
        return f;
      }
    }
    return null;
  }

  function configFromProject(project) {
    if (!project) return null;
    var jsonFile = findFile(project, "scroll-map-story.json");
    if (jsonFile && jsonFile.content) {
      try {
        return JSON.parse(jsonFile.content);
      } catch (e) {}
    }
    var indexFile = findFile(project, "index.html");
    if (indexFile && indexFile.content) {
      var m = indexFile.content.match(
        /id=["']scroll-map-story-embedded["'][^>]*>([\s\S]*?)<\/script>/i
      );
      if (m && m[1]) {
        try {
          return JSON.parse(m[1].trim());
        } catch (e) {}
      }
    }
    return null;
  }

  /**
   * Build a WebxRide-compatible Project from story config + viewer HTML template.
   * @param {string} name - project / slug name
   * @param {object} config - scroll-map-story JSON
   * @param {string} viewerHtml - Tools/scroll-map-story.html template text
   */
  function projectFromStoryConfig(name, config, viewerHtml) {
    var jsonStr = JSON.stringify(config, null, 2);
    var compact = JSON.stringify(config);
    var html = injectEmbeddedStoryJson(viewerHtml, compact);
    return {
      name: name || "story",
      framework: "html",
      files: [
        {
          id: "index.html",
          name: "index.html",
          type: "html",
          content: html
        },
        {
          id: "scroll-map-story.json",
          name: "scroll-map-story.json",
          type: "custom",
          content: jsonStr
        }
      ]
    };
  }

  /**
   * Client-side ZIP download (same approach as WebxRide PublicPlayground Export Local Site).
   * Requires global JSZip.
   */
  function exportLocalSite(project) {
    if (!project || !project.files) {
      return Promise.reject(new Error("No project to export"));
    }
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("JSZip is not loaded"));
    }
    var zip = new JSZip();
    project.files.forEach(function (file) {
      zip.file(file.name, file.content != null ? file.content : "");
    });
    return zip.generateAsync({ type: "blob" }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (project.name || "project") + ".zip";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
    });
  }

  /** Open standalone story HTML in a new tab via blob URL (no Stories/ server). */
  function openProjectPreview(project) {
    if (!project) return null;
    var indexFile = findFile(project, "index.html");
    if (!indexFile || !indexFile.content) return null;
    var blob = new Blob([indexFile.content], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    return url;
  }

  global.MapsAndCardsGuest = {
    PREFIX: PREFIX,
    storageKey: storageKey,
    listIds: listIds,
    loadProject: loadProject,
    saveProject: saveProject,
    removeProject: removeProject,
    injectEmbeddedStoryJson: injectEmbeddedStoryJson,
    configFromProject: configFromProject,
    projectFromStoryConfig: projectFromStoryConfig,
    findFile: findFile,
    exportLocalSite: exportLocalSite,
    openProjectPreview: openProjectPreview
  };
})(typeof window !== "undefined" ? window : globalThis);
