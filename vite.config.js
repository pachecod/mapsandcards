import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { storyApiPlugin } from "./story-api-plugin.js";
import { platformApiPlugin } from "./platform-api-plugin.js";
import { authMiddleware } from "./middleware/auth.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { isDbEnabled } from "./services/db-service.js";

/** Match production server.js: /Stories/:slug/:file → DB-backed story data in dev. */
function storiesRoutePlugin() {
  const handler = (req, res, next) => {
    if (!isDbEnabled()) return next();
    const rawUrl = (req.url || "/").split("?")[0];
    const match = rawUrl.match(
      /^\/Stories\/([^/]+)\/(scroll-map-story\.(?:html|json))$/
    );
    if (!match) return next();
    const slug = match[1];
    const file = match[2];
    const search = (req.url || "").includes("?") ? "?" + req.url.split("?")[1] : "";
    res.writeHead(307, {
      Location: `/__story-api/story-data/${slug}/${file}${search}`,
    });
    res.end();
  };
  return {
    name: "stories-route",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/** Match production server.js: /admin → admin dashboard (not site home). */
function adminRoutePlugin() {
  const handler = (req, res, next) => {
    const rawUrl = req.url || "/";
    const qIndex = rawUrl.indexOf("?");
    const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
    const search = qIndex === -1 ? "" : rawUrl.slice(qIndex);
    if (pathname === "/admin") {
      res.writeHead(301, { Location: `/admin/${search}` });
      res.end();
      return;
    }
    next();
  };
  return {
    name: "admin-route",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/** Optional GA + APP_PASSWORD gate in Vite (same as Express production). */
function appMiddlewarePlugin() {
  return {
    name: "app-middleware",
    configureServer(server) {
      server.middlewares.use(analyticsMiddleware());
      server.middlewares.use(authMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(analyticsMiddleware());
      server.middlewares.use(authMiddleware());
    }
  };
}

export default defineConfig({
  root: ".",
  plugins: [
    react(),
    adminRoutePlugin(),
    storiesRoutePlugin(),
    appMiddlewarePlugin(),
    storyApiPlugin(),
    platformApiPlugin(),
  ],
  server: {
    port: 5173,
    strictPort: false,
    open: "/index.html",
    // Story saves write under Stories/; watching them reloads the dev server and resets the builder UI.
    watch: {
      ignored: ["**/Stories/**"]
    }
  }
});
