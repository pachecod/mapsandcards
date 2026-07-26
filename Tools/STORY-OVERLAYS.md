# Step map overlays and camera (v1.85)

## Schema

Each story step may include optional `overlays`:

```json
"overlays": {
  "geojson": {
    "type": "FeatureCollection",
    "features": [ /* GeoJSON features */ ]
  }
}
```

Stories without `overlays` are normalized to an empty FeatureCollection. At most **500** features per step are kept when loading.

### Step camera fields

| Field | Type | Notes |
|-------|------|--------|
| `lat`, `lng`, `zoom` | number | Required for location steps |
| `pitch` | number (0–85) | Optional oblique tilt; captured via **Set Map Location** |
| `bearing` | number | Optional map rotation in degrees |
| `baseMap` | string | Optional per-step basemap override |
| `show3dBuildings` | boolean | Per-step 3D buildings on/off (omit = use story default) |
| `globeStars` | boolean | Per-step starfield on/off (omit = use story default) |
| `flyTransition` | `"smooth"` \| `"pullback"` | How the map moves to this step |
| `spin` | boolean | Slow globe rotation while this card is active (globe only) |
| `type` | `"intro"` | Marks the welcome card (always first when present) |

Story-level fields (in the root JSON):

| Field | Notes |
|-------|--------|
| `baseMap` | Default basemap for all steps |
| `projection` | `"globe"` or `"mercator"` |
| `globeStars` | Starfield behind globe (default on for new stories) |
| `show3dBuildings` | 3D building extrusions on vector basemaps (default on) |
| `buildingsColorPreset` | `neutral`, `warm`, `cool`, `sandstone`, or `slate` |
| `globeDayNight` | Enable day/night overlay on globe |
| `dayNightMode` | `"live"` or `"fixed"` |
| `dayNightTime` | ISO datetime when mode is `"fixed"` |
| `restartAtEnd` | Show **Start from beginning** card at end (default on) |
| `initialMap` | Opening camera `{ lat, lng, zoom }` (from Intro step) |

## GeoJSON conventions

| Role | Geometry | Suggested `properties` |
|------|-----------|------------------------|
| Placemark | `Point` | `kind`: `"marker"`, optional `color`, `radius` |
| Label | `Point` | `kind`: `"label"` or set `text` / `title`, optional `size`, `color`, `haloColor` |
| Region | `Polygon` / `MultiPolygon` | `kind`: `"region"`, optional `fillColor`, `fillOpacity`, `strokeColor`, `strokeWidth` |
| Line | `LineString` / `MultiLineString` | `kind`: `"line"`, optional `color`, `width` |

Coordinates are **longitude, latitude** per GeoJSON.

## Reader (scroll-map-story.html)

- **Story mode (scroll scrub):** While scrolling between cards, the map camera is driven by scroll progress — not independent timed `flyTo` animations. Camera position is interpolated between step anchors (card center at ~42% viewport height) using each step’s smooth or pullback transition path. Releasing scroll at any point leaves the map at the matching camera.
- **Story mode (reduced motion):** When the OS prefers reduced motion, Story mode falls back to discrete `flyTo` flights on step change.
- **Story mode:** Overlays update when the active step changes (at the midpoint between cards during scroll, or when settled on a step).
- **Explore mode:** Overlays from **all locations** are shown at once, each at its own coordinates on the map/globe. Returning to Story mode shows only the active step’s overlays again.
- **Pitch & bearing:** Interpolated while scrolling between steps; applied directly when settled on a step.
- **3D buildings:** Shown on supported vector basemaps from zoom 13+ when enabled globally or for the active step.
- **Globe stars:** Procedural starfield behind the globe when globe projection and stars are enabled.
- **Globe spin:** A step may set `"spin": true`. Spin starts only when scroll settles on that step (not mid-transition). Spin stops when you leave the card, switch to Explore, interact with the map, or zoom in past ~5.
- **Restart:** If the story sets `"restartAtEnd": true`, a final card offers **Start from beginning** (scrolls to the top and returns the map to the first location).

## Builder

Use **Apply JSON to map**, **Import GeoJSON**, **Marker / Label at map center**, **Draw line / polygon / point** (Mapbox Draw), and the feature list **Remove** to edit overlays for the selected step.

Use **Set Map Location** on the map to save center, zoom, pitch, and bearing for the selected step. On the **Intro** card, this also updates the story’s global opening view (`initialMap`).

Per-step **Options** (collapsible panel):

- **Stars** / **3D buildings** — default, on, or off
- **Spin globe while this card is active**
- **Move to this location** / **Move to next location** (Intro only) — smooth vs pullback fly
