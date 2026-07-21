import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isDbEnabled, closePool, query } from "./services/db-service.js";
import { authMiddleware } from "./middleware/auth.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { seedDefaultTemplatesDb } from "./services/seed-defaults.js";
import storyRoutes from "./routes/stories.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 3000;

const app = express();

app.use(analyticsMiddleware());
app.use(authMiddleware());
app.use(express.json({ limit: "5mb" }));

// Story API (same prefix the Vite plugin uses, so the builder HTML works unchanged)
app.use("/__story-api", storyRoutes);

// Dynamic route: /Stories/<slug>/<file> → proxy to DB-backed story data
app.get("/Stories/:slug/:file", (req, res, next) => {
  const { slug, file } = req.params;
  if (file === "scroll-map-story.json" || file === "scroll-map-story.html") {
    return res.redirect(307, `/__story-api/story-data/${slug}/${file}`);
  }
  next();
});

// Static files — serve everything in the project root (index.html, Tools/, etc.)
// In production the Vite build output lives in dist/, but for now we serve the source directly.
const staticRoot = process.env.STATIC_ROOT || __dirname;
app.use(express.static(staticRoot));

// SPA fallback for index.html
app.get("/", (_req, res) => res.sendFile(join(staticRoot, "index.html")));

// Start
async function start() {
  if (!isDbEnabled()) {
    console.warn("DATABASE_URL not set — the server will start but API calls will fail.");
  } else {
    try {
      await seedDefaultTemplatesDb(query);
    } catch (e) {
      console.warn("[seed] DB seed on startup failed:", e.message || e);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`mapsandcards server listening on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      console.log(`\n${sig} received, shutting down...`);
      server.close();
      await closePool();
      process.exit(0);
    });
  }
}

start();
