import express from "express";
import platformRoutes from "./routes/platform/index.js";

/**
 * Vite dev/preview middleware — mirrors production Platform API.
 */
export function platformApiPlugin() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use("/api/platform/v1", platformRoutes);

  return {
    name: "platform-api",
    configureServer(server) {
      server.middlewares.use(app);
    },
    configurePreviewServer(server) {
      server.middlewares.use(app);
    },
  };
}
