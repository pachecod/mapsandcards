import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isDbEnabled, closePool, query } from "./services/db-service.js";
import { authMiddleware } from "./middleware/auth.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { seedDefaultTemplatesDb } from "./services/seed-defaults.js";
import { seedLegalPagesIfEmpty } from "./services/seed-legal.js";
import storyRoutes from "./routes/stories.js";
import platformRoutes from "./routes/platform/index.js";
import { getLegalPage } from "./services/platform-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 3000;

const app = express();

app.use(analyticsMiddleware());
app.use(authMiddleware());
app.use(express.json({ limit: "15mb" }));

app.use("/__story-api", storyRoutes);
app.use("/api/platform/v1", platformRoutes);

// Local file uploads when B2 is not configured
app.use("/uploads", express.static(join(__dirname, "uploads")));

// Dynamic route: /Stories/<slug>/<file> → proxy to DB-backed story data
app.get("/Stories/:slug/:file", (req, res, next) => {
  const { slug, file } = req.params;
  if (file === "scroll-map-story.json" || file === "scroll-map-story.html") {
    return res.redirect(307, `/__story-api/story-data/${slug}/${file}`);
  }
  next();
});

const staticRoot = process.env.STATIC_ROOT || __dirname;
app.use(express.static(staticRoot));

app.get("/", (_req, res) => res.sendFile(join(staticRoot, "index.html")));
app.get(["/admin", "/admin/"], (_req, res) =>
  res.sendFile(join(staticRoot, "admin", "index.html"))
);

async function serveLegalPage(page, res, fallbackFile) {
  if (isDbEnabled()) {
    try {
      const row = await getLegalPage(page);
      if (row && row.body_html) {
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${row.title || page}</title><link rel="stylesheet" href="/index.html" /></head><body style="font-family:system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem">${row.body_html}<p><a href="/">Home</a></p></body></html>`;
        return res.type("html").send(html);
      }
    } catch {
      /* fallback */
    }
  }
  if (fallbackFile) {
    return res.sendFile(join(staticRoot, fallbackFile));
  }
  res.status(404).send("Not found");
}

app.get("/terms.html", (req, res) => serveLegalPage("terms", res, "terms.html"));
app.get("/privacy-policy.html", (req, res) => serveLegalPage("privacy", res, "privacy-policy.html"));
app.get("/about.html", (req, res) => serveLegalPage("about", res, null));

// Start
async function start() {
  if (!isDbEnabled()) {
    console.warn("DATABASE_URL not set — the server will start but API calls will fail.");
  } else {
    try {
      await seedDefaultTemplatesDb(query);
      await seedLegalPagesIfEmpty(query);
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
