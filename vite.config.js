import "dotenv/config";
import { defineConfig } from "vite";
import { storyApiPlugin } from "./story-api-plugin.js";
import { authMiddleware } from "./middleware/auth.js";
import { analyticsMiddleware } from "./middleware/analytics.js";

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
  plugins: [appMiddlewarePlugin(), storyApiPlugin()],
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
