# Maps and Cards

Create **scroll-driven map stories**: as readers move through story cards, the map flies to each location, switches basemaps, and shows annotations (markers, labels, lines, and regions).

Built with [MapLibre GL](https://maplibre.org/). Licensed under the [MIT License](LICENSE) by [Dan Pacheco](https://danpacheco.com/).

**Current release: v1.8**

## What you get

| Piece | Purpose |
|--------|---------|
| **Home** (`index.html`) | Open the builder, browse example stories, edit / view / delete |
| **Builder** (`Tools/scroll-map-builder.html`) | Author locations, cards, overlays, and map options |
| **Story viewer** (`Tools/scroll-map-story.html`) | Published story page (also copied into each story folder on save) |

### Builder highlights

- **Locations** — add, reorder, and set camera, basemap, and map effects per step
- **Intro card** — optional welcome card at the top; its map view becomes the story’s opening camera
- **Starting location** — new stories require a place search (OpenStreetMap/Nominatim) so the Intro card opens on a real location
- **Camera control** — **Set Map Location** captures center, zoom, pitch, and bearing from the live map for street-level or oblique views
- **Fly transitions** — **Smooth transition** or **Zoom out and zoom in** when moving between cards; on the Intro card this controls the move to Location 1
- **Cards** — rich text (Quill) with optional background color and sources
- **Annotations** — markers, labels, lines, and polygons (draw or import GeoJSON)
- **Basemaps** — OpenFreeMap Bright & Dark, Carto Voyager / Positron / Dark Matter, Esri satellite & topo (optional place-name overlay on satellite)
- **Globe or flat** — globe is the default for new stories; Mercator also available
- **Globe starfield** — procedural stars behind the globe (on by default); per-step on/off/default override
- **3D buildings** — extruded building footprints on vector basemaps (on by default), with color presets (neutral, warm, cool, sandstone, slate)
- **Globe day/night** — optional live or fixed-date sun/shadow overlay on globe stories
- **Globe spin** — optional slow rotation while a card is active (globe projection only)
- **Optional 3D terrain** — MapLibre demo tiles (no API key); available in Map Options for existing stories
- **Preview** — opens the saved viewer in a new tab; unsaved map-option changes are flushed before preview
- **Export** — download a standalone ZIP that works offline
- **Guest Mode** — author locally in the browser (no server); same `localStorage` + ZIP pattern as WebxRide Public Playground

### Reader experience

- **Story mode** — scroll the cards; the map follows each location, pitch/bearing, basemap, and overlays
- **Explore mode** — free pan/zoom; annotations from all locations show at once
- **Restart at end** — when enabled, a final card offers **Start from beginning** (on by default for new stories)

More detail on overlay data: [Tools/STORY-OVERLAYS.md](Tools/STORY-OVERLAYS.md).

## Example stories

Bundled examples live under `Starter Templates/` and are **seeded automatically** when the home page loads (local filesystem) or on deploy (Postgres). They appear under **Example Stories** on the home page.

| Slug | Title | Notes |
|------|-------|--------|
| `earth` | Earth | Short global demo |
| `syracuse` | Syracuse | Upstate New York place-based tour |

To add a new public example:

1. Put `scroll-map-story.json` in `Starter Templates/<slug>/`
2. Add a display title in `services/seed-defaults.js` (`DEFAULT_TEMPLATE_TITLES`)
3. Commit the template folder (not `Stories/` or `Exports/` — those stay local)
4. Deploy; seeding sets `published = true` in production

In **Admin → Settings**, **Public guest templates** controls which bundled stories appear in Guest Mode’s **Start from** picker (comma-separated slugs, e.g. `earth, syracuse`).

## Quick start (local)

Requirements: Node.js 18+ recommended.

```bash
git clone https://github.com/pachecod/mapsandcards.git
cd mapsandcards
npm install
npm run dev
```

Vite opens the home page (default [http://localhost:5173](http://localhost:5173)). Create a story in the builder; saves write under `Stories/<slug>/` via the local story API.

> **Note:** `Stories/` is local-only and not committed to this repository.

### Guest Mode (WebxRide-compatible)

Open **Guest Mode** from the home page, or go to `/Tools/scroll-map-builder.html?guest=1`.

| Behavior | Detail |
|----------|--------|
| Persistence | Browser `localStorage` key `playground-{slug}` (same as WebxRide Public Playground) |
| Project shape | `{ name, framework: "html", files: [index.html, scroll-map-story.json] }` |
| New story | Pick a **starting location**, then create a blank draft or **Start from** a bundled template |
| Save | Local only — never calls `/__story-api` |
| Preview | Blob URL of standalone viewer HTML |
| Share | **Export Local Site** — client-side JSZip download |

Shared helpers live in [`Tools/guest-playground.js`](Tools/guest-playground.js) so embedding into WebxRide’s `/play/:templateId` path can reuse the same contract.

### Useful scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | Vite + local story API (filesystem) |
| `npm run build` | Production frontend build |
| `npm run preview` | Preview the Vite build |
| `npm start` | Express server (production-style; uses Postgres when configured) |
| `npm run db:migrate` | Apply Postgres schema |

## Production / deploy

The included [`render.yaml`](render.yaml) targets [Render](https://render.com/) with a Node web service and Postgres.

1. Set environment variables from [`.env.example`](.env.example):
   - `DATABASE_URL` / `DATABASE_SSL` — required for the production story API
   - `APP_PASSWORD` — optional; gates the non-guest builder and story write API (Guest Mode + story viewing stay public)
   - `GOOGLE_ANALYTICS_ID` — optional GA4 measurement ID (e.g. `G-XXXXXXXXXX`); leave blank to disable analytics
   - `B2_*` — optional Backblaze B2 keys (reserved for future media uploads)
   - `PORT` — set automatically on most hosts
2. Start with `npm run db:migrate && npm start` (as in `render.yaml`).

Render deploys from the **`main`** branch. After pushing to `main`, confirm the latest deploy finished before checking the live site.

Locally, stories live on disk under `Stories/`. In production, the same `/__story-api` shape is backed by Postgres.

## Project layout

```
index.html                 Home / story list
Tools/
  scroll-map-builder.html  Authoring UI (v1.8)
  scroll-map-story.html    Viewer template
  globe-stars.js           Globe starfield custom layer
  globe-3d-buildings.js    3D building extrusions overlay
  globe-daynight.js        Globe day/night sun overlay
  guest-playground.js      Guest Mode / WebxRide playground helpers
  STORY-OVERLAYS.md        Overlay schema notes
Starter Templates/         Bundled example stories (earth, syracuse, …)
story-api-plugin.js        Vite plugin: local story CRUD
server.js                  Express app for production
routes/  services/  db/    Production API + database
middleware/auth.js         Optional password protection
middleware/analytics.js    Optional Google Analytics (GOOGLE_ANALYTICS_ID)
Stories/                   Your stories (gitignored)
Exports/                   Export drop folder (gitignored)
```

## What's new in v1.8

- **Globe starfield** — stars render behind the globe with correct depth occlusion (including on dark basemaps like Carto Dark Matter)
- **3D buildings** — enabled by default on vector basemaps; five height-based color presets; per-step on/off/default
- **Per-step pitch & bearing** — capture oblique and street-level views with **Set Map Location**
- **New story flow** — required starting-location search sets the Intro card; defaults include 3D buildings, globe stars, and restart-at-end
- **Intro → Location 1 transition** — smooth fly option on the Intro card (**Move to next location**)
- **Preview reliability** — map options and step overrides save before preview opens (guest and signed-in)
- **Syracuse example** — bundled place-based tour alongside Earth
- **Globe interaction fixes** — right-drag pitch no longer fights globe spin or leaves rotation stuck

## Contributing

Issues and pull requests are welcome. Please keep story content, `.env` secrets, and anything under `inspiring/` out of commits — they are intentionally excluded from the repo.

## License

[MIT](LICENSE) — Copyright 2026 Dan Pacheco.
