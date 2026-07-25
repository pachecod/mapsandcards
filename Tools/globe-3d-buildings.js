/**
 * OpenFreeMap 3D building extrusions overlay for vector basemaps.
 */
(function (global) {
  var SOURCE_ID = "mc-3d-buildings-src";
  var LAYER_ID = "mc-3d-buildings";
  var PLANET_URL = "https://tiles.openfreemap.org/planet";
  var DEFAULT_COLOR_PRESET = "neutral";
  var BUILDINGS_ATTRIBUTION =
    "Building data \u00a9 OpenFreeMap \u00a9 OpenStreetMap contributors";

  var VECTOR_BASEMAP_IDS = {
    "openfreemap-bright": true,
    "openfreemap-dark": true,
    "carto-voyager": true,
    "carto-positron": true,
    "carto-dark-matter": true,
  };

  /* Height-based gradients: short → tall */
  var COLOR_PRESETS = {
    neutral: {
      label: "Neutral gray",
      stops: ["#b8c0cc", "#8a95a8", "#5c6b82", "#3d4d66"],
    },
    warm: {
      label: "Warm clay",
      stops: ["#e8c4a8", "#d4956a", "#b86a3a", "#8f4520"],
    },
    cool: {
      label: "Cool blue",
      stops: ["#b8d4e8", "#7eb0d4", "#4a85b0", "#2d5f8a"],
    },
    sandstone: {
      label: "Sandstone",
      stops: ["#e8dcc8", "#d4c4a0", "#b8a070", "#9a8050"],
    },
    slate: {
      label: "Slate green",
      stops: ["#c8d4cc", "#98b0a4", "#688878", "#456058"],
    },
  };

  function baseMapSupports3dBuildings(baseMapId) {
    if (!baseMapId || baseMapId === "esri-topo" || baseMapId === "esri-satellite") {
      return false;
    }
    return !!VECTOR_BASEMAP_IDS[baseMapId];
  }

  function wants3dBuildings(config, baseMapId) {
    return !!(config && config.show3dBuildings === true && baseMapSupports3dBuildings(baseMapId));
  }

  function resolveColorPreset(config) {
    if (!config || typeof config.buildingsColorPreset !== "string") {
      return DEFAULT_COLOR_PRESET;
    }
    return COLOR_PRESETS[config.buildingsColorPreset]
      ? config.buildingsColorPreset
      : DEFAULT_COLOR_PRESET;
  }

  function buildingColorExpression(presetId) {
    var preset = COLOR_PRESETS[presetId] || COLOR_PRESETS[DEFAULT_COLOR_PRESET];
    var stops = preset.stops;
    return [
      "interpolate",
      ["linear"],
      ["get", "render_height"],
      0,
      stops[0],
      80,
      stops[1],
      200,
      stops[2],
      400,
      stops[3],
    ];
  }

  function buildingPitchForZoom(config, stepZoom, baseMapId) {
    if (!config) return 0;
    if (config.terrain) return 42;
    var zoom = typeof stepZoom === "number" ? stepZoom : 0;
    if (
      config.show3dBuildings &&
      zoom >= 15 &&
      baseMapSupports3dBuildings(baseMapId)
    ) {
      return 45;
    }
    if (config.projection === "globe") return 28;
    return 0;
  }

  function findLabelLayerId(map) {
    if (!map || !map.getStyle) return null;
    var style = map.getStyle();
    if (!style || !style.layers) return null;
    for (var i = 0; i < style.layers.length; i++) {
      var layer = style.layers[i];
      if (
        layer.type === "symbol" &&
        layer.layout &&
        layer.layout["text-field"]
      ) {
        return layer.id;
      }
    }
    return null;
  }

  function removeBuildings(map) {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    } catch (e) {}
    try {
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    } catch (e) {}
  }

  function ensureSource(map) {
    if (map.getSource(SOURCE_ID)) return;
    map.addSource(SOURCE_ID, {
      type: "vector",
      url: PLANET_URL,
    });
  }

  function buildingLayerDef(config) {
    var presetId = resolveColorPreset(config);
    return {
      id: LAYER_ID,
      source: SOURCE_ID,
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 15,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": buildingColorExpression(presetId),
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "render_height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          15.05,
          ["get", "render_min_height"],
        ],
        "fill-extrusion-opacity": 0.72,
      },
    };
  }

  function applyBuildingColor(map, config) {
    if (!map || !map.getLayer(LAYER_ID)) return;
    try {
      map.setPaintProperty(
        LAYER_ID,
        "fill-extrusion-color",
        buildingColorExpression(resolveColorPreset(config))
      );
    } catch (e) {
      console.warn("[Globe3dBuildings] setPaintProperty failed:", e);
    }
  }

  function addBuildings(map, config) {
    if (map.getLayer(LAYER_ID)) {
      applyBuildingColor(map, config);
      return;
    }
    ensureSource(map);
    var beforeId = findLabelLayerId(map);
    var layer = buildingLayerDef(config);
    if (beforeId) map.addLayer(layer, beforeId);
    else map.addLayer(layer);
  }

  function apply(map, config, baseMapId) {
    if (!map) return;
    if (!wants3dBuildings(config, baseMapId)) {
      removeBuildings(map);
      return;
    }
    if (!map.isStyleLoaded || !map.isStyleLoaded()) {
      map.once("load", function () {
        apply(map, config, baseMapId);
      });
      return;
    }
    addBuildings(map, config);
  }

  function syncAfterStyleLoad(map, config, baseMapId) {
    if (!map) return;
    removeBuildings(map);
    if (!wants3dBuildings(config, baseMapId)) return;
    addBuildings(map, config);
  }

  function normalize3dBuildingsConfig(data) {
    if (!data || typeof data !== "object") return;
    if (data.show3dBuildings !== true) {
      delete data.show3dBuildings;
      delete data.buildingsColorPreset;
      return;
    }
    data.show3dBuildings = true;
    var preset = data.buildingsColorPreset;
    if (typeof preset !== "string" || !COLOR_PRESETS[preset] || preset === DEFAULT_COLOR_PRESET) {
      delete data.buildingsColorPreset;
    } else {
      data.buildingsColorPreset = preset;
    }
  }

  function getColorPresets() {
    return Object.keys(COLOR_PRESETS).map(function (id) {
      return { id: id, label: COLOR_PRESETS[id].label };
    });
  }

  function isLayerActive(map) {
    return !!(map && map.getLayer && map.getLayer(LAYER_ID));
  }

  global.Globe3dBuildings = {
    SOURCE_ID: SOURCE_ID,
    LAYER_ID: LAYER_ID,
    BUILDINGS_ATTRIBUTION: BUILDINGS_ATTRIBUTION,
    DEFAULT_COLOR_PRESET: DEFAULT_COLOR_PRESET,
    baseMapSupports3dBuildings: baseMapSupports3dBuildings,
    wants3dBuildings: wants3dBuildings,
    resolveColorPreset: resolveColorPreset,
    getColorPresets: getColorPresets,
    buildingPitchForZoom: buildingPitchForZoom,
    apply: apply,
    syncAfterStyleLoad: syncAfterStyleLoad,
    remove: removeBuildings,
    normalize3dBuildingsConfig: normalize3dBuildingsConfig,
    isLayerActive: isLayerActive,
  };
})(typeof window !== "undefined" ? window : globalThis);
