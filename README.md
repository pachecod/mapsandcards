# Maps and Cards

Create **scroll-driven map stories**: as readers move through story cards, the map flies to each location, switches basemaps, and shows annotations (markers, labels, lines, and regions).

Built with [MapLibre GL](https://maplibre.org/). Licensed under the [MIT License](LICENSE) by [Dan Pacheco](https://danpacheco.com/).

## What you get

| Piece | Purpose |
|--------|---------|
| **Home** (`index.html`) | Open the builder, list stories, edit / view / delete |
| **Builder** (`Tools/scroll-map-builder.html`) | Author locations, cards, overlays, and map options |
| **Story viewer** (`Tools/scroll-map-story.html`) | Published story page (also copied into each story folder on save) |

### Builder highlights

- **Locations** — add, reorder, and set camera / basemap per step
- **Cards** — rich text (Quill) with optional background color and sources
- **Annotations** — markers, labels, lines, and polygons (draw or import GeoJSON)
- **Basemaps** — OpenFreeMap Bright, Carto Voyager, Esri satellite (optional place-name overlay)
- **Globe or flat** — globe is the default for new stories; Mercator also available
- **Optional 3D terrain** — MapLibre demo tiles (no API key)
- **Export** — download a standalone ZIP that works offline

### Reader experience

- **Story mode** — scroll the cards; the map follows each location and its overlays
- **Explore mode** — free pan/zoom; annotations from all locations show at once

More detail on overlay data: [Tools/STORY-OVERLAYS.md](Tools/STORY-OVERLAYS.md).

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
   - `APP_PASSWORD` — optional site-wide password gate (leave blank to disable)
   - `B2_*` — optional Backblaze B2 keys (reserved for future media uploads)
   - `PORT` — set automatically on most hosts
2. Start with `npm run db:migrate && npm start` (as in `render.yaml`).

Locally, stories live on disk under `Stories/`. In production, the same `/__story-api` shape is backed by Postgres.

## Project layout

```
index.html                 Home / story list
Tools/
  scroll-map-builder.html  Authoring UI
  scroll-map-story.html    Viewer template
  STORY-OVERLAYS.md        Overlay schema notes
story-api-plugin.js        Vite plugin: local story CRUD
server.js                  Express app for production
routes/  services/  db/    Production API + database
middleware/auth.js         Optional password protection
Stories/                   Your stories (gitignored)
```

## Contributing

Issues and pull requests are welcome. Please keep story content, `.env` secrets, and anything under `inspiring/` out of commits — they are intentionally excluded from the repo.

## License

[MIT](LICENSE) — Copyright 2026 Dan Pacheco.
