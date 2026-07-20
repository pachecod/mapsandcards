import { defineConfig } from "vite";
import { storyApiPlugin } from "./story-api-plugin.js";

export default defineConfig({
  root: ".",
  plugins: [storyApiPlugin()],
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
