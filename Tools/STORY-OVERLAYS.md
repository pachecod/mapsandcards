# Step map overlays (v1.1)

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

## GeoJSON conventions

| Role | Geometry | Suggested `properties` |
|------|-----------|------------------------|
| Placemark | `Point` | `kind`: `"marker"`, optional `color`, `radius` |
| Label | `Point` | `kind`: `"label"` or set `text` / `title`, optional `size`, `color`, `haloColor` |
| Region | `Polygon` / `MultiPolygon` | `kind`: `"region"`, optional `fillColor`, `fillOpacity`, `strokeColor`, `strokeWidth` |
| Line | `LineString` / `MultiLineString` | `kind`: `"line"`, optional `color`, `width` |

Coordinates are **longitude, latitude** per GeoJSON.

## Reader (scroll-map-story.html)

- **Story mode:** Overlays update when the active step changes (same timing as the map camera for that step).
- **Explore mode:** Overlays from **all locations** are shown at once, each at its own coordinates on the map/globe. Returning to Story mode shows only the active step’s overlays again.

## Builder

Use **Apply JSON to map**, **Import GeoJSON**, **Marker / Label at map center**, **Draw line / polygon / point** (Mapbox Draw), and the feature list **Remove** to edit overlays for the selected step.
