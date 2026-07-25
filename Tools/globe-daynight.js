/**
 * Globe day/night terminator overlay (requires maplibre-gl-nightlayer on window.nightLayer).
 */
(function (global) {
  var DEFAULT_OPACITY = 0.5;
  var TWILIGHT_STEPS = 3;
  var UPDATE_INTERVAL_MS = 10000;

  var mapState = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var fallbackState = {};

  function getNightLayerCtor() {
    if (global.nightLayer && global.nightLayer.NightLayer) return global.nightLayer.NightLayer;
    return null;
  }

  function getState(map) {
    if (mapState) {
      if (!mapState.has(map)) mapState.set(map, { layer: null });
      return mapState.get(map);
    }
    var key = map && map._container && map._container.id ? map._container.id : "_default";
    if (!fallbackState[key]) fallbackState[key] = { layer: null };
    return fallbackState[key];
  }

  function wantsDayNight(config) {
    return !!(config && config.projection === "globe" && config.globeDayNight === true);
  }

  function clampOpacity(value) {
    if (typeof value !== "number" || isNaN(value)) return DEFAULT_OPACITY;
    return Math.max(0.2, Math.min(0.8, value));
  }

  function resolveDate(config) {
    if (!config || config.dayNightMode !== "fixed") return null;
    var raw = config.dayNightTime;
    if (!raw) return null;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function layerOptions(config) {
    return {
      date: resolveDate(config),
      opacity: clampOpacity(
        typeof config.dayNightOpacity === "number" ? config.dayNightOpacity : DEFAULT_OPACITY
      ),
      twilightSteps: TWILIGHT_STEPS,
      twilightAttenuation: 0.5,
      updateInterval: UPDATE_INTERVAL_MS,
    };
  }

  function removeLayer(map) {
    if (!map) return;
    var state = getState(map);
    if (!state.layer) return;
    try {
      var id = state.layer.id || "nightlayer";
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (e) {}
    state.layer = null;
  }

  function updateExistingLayer(layer, config) {
    if (!layer) return;
    if (typeof layer.setDate === "function") layer.setDate(resolveDate(config));
    if (typeof layer.setOpacity === "function") {
      layer.setOpacity(
        clampOpacity(
          typeof config.dayNightOpacity === "number" ? config.dayNightOpacity : DEFAULT_OPACITY
        )
      );
    }
  }

  function addLayer(map, config) {
    var Ctor = getNightLayerCtor();
    if (!Ctor) {
      console.warn("[GlobeDayNight] maplibre-gl-nightlayer not loaded");
      return;
    }
    var state = getState(map);
    if (!state.layer) {
      state.layer = new Ctor(layerOptions(config));
    } else {
      updateExistingLayer(state.layer, config);
    }
    try {
      var id = state.layer.id || "nightlayer";
      if (map.getLayer(id)) return;
      map.addLayer(state.layer);
    } catch (e) {
      console.warn("[GlobeDayNight] addLayer failed:", e);
    }
  }

  function apply(map, config) {
    if (!map) return;
    if (!wantsDayNight(config)) {
      removeLayer(map);
      return;
    }
    if (!map.isStyleLoaded || !map.isStyleLoaded()) {
      map.once("load", function () {
        apply(map, config);
      });
      return;
    }
    addLayer(map, config);
  }

  function syncAfterStyleLoad(map, config) {
    if (!map) return;
    removeLayer(map);
    if (!wantsDayNight(config)) return;
    addLayer(map, config);
  }

  function normalizeDayNightConfig(data) {
    if (!data || typeof data !== "object") return;
    if (data.projection !== "globe") {
      delete data.globeDayNight;
      delete data.dayNightMode;
      delete data.dayNightTime;
      delete data.dayNightOpacity;
      return;
    }
    if (data.globeDayNight !== true) {
      delete data.globeDayNight;
      delete data.dayNightMode;
      delete data.dayNightTime;
      delete data.dayNightOpacity;
      return;
    }
    data.globeDayNight = true;
    if (data.dayNightMode === "fixed") {
      var raw = data.dayNightTime;
      var d = raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) {
        data.dayNightMode = "live";
        delete data.dayNightTime;
      } else {
        data.dayNightMode = "fixed";
        data.dayNightTime = d.toISOString();
      }
    } else {
      data.dayNightMode = "live";
      delete data.dayNightTime;
    }
    if (typeof data.dayNightOpacity === "number" && !isNaN(data.dayNightOpacity)) {
      var o = clampOpacity(data.dayNightOpacity);
      if (Math.abs(o - DEFAULT_OPACITY) < 0.001) delete data.dayNightOpacity;
      else data.dayNightOpacity = o;
    } else {
      delete data.dayNightOpacity;
    }
  }

  global.GlobeDayNight = {
    apply: apply,
    syncAfterStyleLoad: syncAfterStyleLoad,
    remove: removeLayer,
    wantsDayNight: wantsDayNight,
    normalizeDayNightConfig: normalizeDayNightConfig,
    DEFAULT_OPACITY: DEFAULT_OPACITY,
  };
})(typeof window !== "undefined" ? window : globalThis);
