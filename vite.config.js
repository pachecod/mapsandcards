import "dotenv/config";
import { defineConfig } from "vite";
import { storyApiPlugin } from "./story-api-plugin.js";
import { authMiddleware } from "./middleware/auth.js";

/** Apply APP_PASSWORD gate in Vite (same rules as Express production). */
function authPlugin() {
  return {
    name: "app-auth",
    configureServer(server) {
      server.middlewares.use(authMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(authMiddleware());
    }
  };
}

export default defineConfig({
  root: ".",
  plugins: [authPlugin(), storyApiPlugin()],
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
