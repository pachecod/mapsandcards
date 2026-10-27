# CLAUDE.md

Maps and Cards: scroll-driven map stories built on MapLibre GL. Readers scroll story cards; the map flies to each location, switches basemaps, and shows overlays. See [README.md](README.md) for the user-facing feature list.

## Never commit or push local-only content

Never stage, commit, or push any of the following:

- **`Stories/`** — all story folders and their generated HTML/JSON
- **Environment variables** — `.env`, `.env.*`, credentials, secrets (`.env.example` templates only are OK)
- **`inspiring/`** — reference/inspiration code and assets

Exclude these paths even if they appear modified or untracked. Prefer updating `.gitignore` over adding them to the repo. If any are already tracked, untrack with `git rm --cached` and leave the local files intact. (`Exports/`, `uploads/`, `.reference/`, and `Starter Templates/**/assets/` are also gitignored.)

## Commands

- `npm run dev` — Vite dev server on :5173 with the local story API (filesystem under `Stories/`)
- `npm start` — Express production server (`server.js`), Postgres-backed when `DATABASE_URL` is set
- `npm run db:migrate` — apply `db/schema.sql` (idempotent; uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`)
- `npm run build` — Vite build to `dist/`

There are no automated tests or linters. Verify changes by running `npm run dev` and exercising the builder, viewer, and home page in the browser.

## Architecture

The main app is vanilla HTML/JS with libraries loaded from jsDelivr (MapLibre 5.24, Mapbox GL Draw, Quill 1.3.7, JSZip). There is no bundling step for these pages; Vite serves them as static files.

- `index.html` — home page: story list, example stories, Guest Mode entry
- `Tools/scroll-map-builder.html` — the authoring UI (one ~8,800-line file; HTML, CSS, and script inline)
- `Tools/scroll-map-story.html` — the reader/viewer template
- `Tools/*.js` — shared IIFE modules attached to `window`, loaded by builder and/or viewer: `globe-stars`, `globe-3d-buildings`, `globe-daynight`, `scroll-camera-scrub`, `story-map-images`, `map-compass`, `guest-playground`, `guest-agreement`, `builder-auth-ui`, `app-nav`, `platform-api`
- `admin/` — admin dashboard (`admin.js` vanilla; `main.jsx` is a small React shell, the only React in the app)

### Story data

Each story is a `scroll-map-story.json`: `{ title, steps: [...], ...map options }`. Each step has `id`, `lat`, `lng`, `zoom`, optional `pitch`/`bearing`, `baseMap`, card `html`, `overlays.geojson` (FeatureCollection), and per-step flags like `spin` and `scrollHold`. Overlay schema: [Tools/STORY-OVERLAYS.md](Tools/STORY-OVERLAYS.md).

On save, the viewer template is copied to `Stories/<slug>/scroll-map-story.html` with the story JSON embedded in `<script type="application/json" id="scroll-map-story-embedded">`. Changes to `Tools/scroll-map-story.html` only reach an existing story when it is re-saved. `Starter Templates/earth/index.html` is also a viewer copy.

### Storage modes (same `/__story-api/*` shape everywhere)

1. **Local dev, no DB** — `story-api-plugin.js` (Vite plugin) reads/writes `Stories/<slug>/` on disk. Vite's watcher ignores `Stories/` so saves don't reload the builder.
2. **DB (dev with `DATABASE_URL`, or production)** — `routes/stories.js` backed by Postgres (`services/db-service.js`). `/Stories/:slug/:file` redirects to `/__story-api/story-data/...`. `vite.config.js` mirrors `server.js` routing so dev and prod behave the same; keep them in sync when changing routes or middleware.
3. **Guest Mode** (`?guest=1`) — browser `localStorage` key `playground-{slug}`, ZIP export via JSZip; never calls the server. Contract lives in `Tools/guest-playground.js` (kept compatible with WebxRide's playground).

### Auth and platform

- `middleware/auth.js` — optional `APP_PASSWORD` gate for the full builder and write actions (`create`, `save`, `delete`, `export`, `submit`, `import-guest`). Reads and story viewing stay public.
- `routes/platform/index.js` + `services/platform-service.js` — `/api/platform/v1`: admin/student login, classes, students, settings, files, legal pages, submissions, impersonation, WebxRide handoff.
- `middleware/story-access.js` — read/write rules: admins see all; students own their stories and see published ones in their class; anonymous sees published only. Featured stories are admin-write-only. Student slugs are prefixed `<class>-<username>-`.
- `services/file-storage.js` — Backblaze B2 when configured, else local `uploads/`.

### Example stories

Bundled examples are in `Starter Templates/<slug>/scroll-map-story.json`, titled in `services/seed-defaults.js` (`DEFAULT_TEMPLATE_TITLES`), and seeded on startup. Featured ordering: `services/featured-stories.js`.

## Deploy

Render (`render.yaml`) deploys from `main`. Feature work happens on `feature/*` branches and is merged into `main`. After pushing to `main`, confirm the Render deploy finished before checking https://mapsandcards.com. Env vars are documented in `.env.example`.
