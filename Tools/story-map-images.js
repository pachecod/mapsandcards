/**
 * Georeferenced image overlays for scroll map stories.
 * Point features with kind:"image" render via MapLibre image sources.
 */
(function (global) {
  "use strict";

  var MIN_WIDTH_M = 10;
  var MAX_WIDTH_M = 50000;
  var DEFAULT_WIDTH_M = 2000;
  var DEFAULT_OPACITY = 1;
  var ID_PREFIX = "sov-img-";
  var LAYER_PREFIX = "story-ov-img-";
  var imageSourceUrls = {};

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function newImageFeatureId() {
    return "img-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function offsetToLngLat(lng, lat, eastM, northM) {
    var dist = Math.sqrt(eastM * eastM + northM * northM);
    if (dist < 0.001) return [lng, lat];
    var bearing = (Math.atan2(eastM, northM) * 180) / Math.PI;
    return destinationPoint(lng, lat, bearing, dist);
  }

  function destinationPoint(lng, lat, bearingDeg, distanceM) {
    var R = 6378137;
    var brng = (bearingDeg * Math.PI) / 180;
    var lat1 = (lat * Math.PI) / 180;
    var lng1 = (lng * Math.PI) / 180;
    var d = distanceM / R;
    var lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    var lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  function computeImageCorners(lng, lat, widthM, heightM, rotationDeg) {
    var hw = widthM / 2;
    var hh = heightM / 2;
    var rot = ((rotationDeg || 0) * Math.PI) / 180;
    var cos = Math.cos(rot);
    var sin = Math.sin(rot);
    var local = [
      [-hw, hh],
      [hw, hh],
      [hw, -hh],
      [-hw, -hh],
    ];
    return local.map(function (pair) {
      var e = pair[0] * cos - pair[1] * sin;
      var n = pair[0] * sin + pair[1] * cos;
      return offsetToLngLat(lng, lat, e, n);
    });
  }

  function isImageFeature(f) {
    return !!(
      f &&
      f.geometry &&
      f.geometry.type === "Point" &&
      f.properties &&
      f.properties.kind === "image" &&
      typeof f.properties.imageUrl === "string" &&
      f.properties.imageUrl.trim()
    );
  }

  function extractImageFeatures(fc) {
    var out = [];
    if (!fc || !Array.isArray(fc.features)) return out;
    fc.features.forEach(function (f) {
      if (isImageFeature(f)) out.push(f);
    });
    return out;
  }

  function normalizeImageFeature(f) {
    if (!f || !f.properties) return f;
    var p = f.properties;
    if (!p.id) p.id = newImageFeatureId();
    if (typeof p.widthM !== "number" || isNaN(p.widthM)) {
      p.widthM = DEFAULT_WIDTH_M;
    }
    p.widthM = clamp(p.widthM, MIN_WIDTH_M, MAX_WIDTH_M);
    if (typeof p.heightM !== "number" || isNaN(p.heightM) || p.heightM <= 0) {
      p.heightM = p.widthM * 0.75;
    }
    p.heightM = clamp(p.heightM, MIN_WIDTH_M, MAX_WIDTH_M);
    if (typeof p.aspectRatio === "number" && p.aspectRatio > 0) {
      p.heightM = clamp(p.widthM / p.aspectRatio, MIN_WIDTH_M, MAX_WIDTH_M);
    }
    if (typeof p.opacity !== "number" || isNaN(p.opacity)) {
      p.opacity = DEFAULT_OPACITY;
    }
    p.opacity = clamp(p.opacity, 0.05, 1);
    if (typeof p.rotation !== "number" || isNaN(p.rotation)) {
      delete p.rotation;
    }
    if (typeof p.imageLabel === "string" && !p.imageLabel.trim()) {
      delete p.imageLabel;
    }
    return f;
  }

  function featureSourceId(feature) {
    return ID_PREFIX + String(feature.properties.id);
  }

  function featureLayerId(feature) {
    return LAYER_PREFIX + String(feature.properties.id);
  }

  function activeImageLayerIds(map) {
    if (!map || !map.getStyle || !map.getStyle()) return [];
    return map
      .getStyle()
      .layers.filter(function (l) {
        return l.id.indexOf(LAYER_PREFIX) === 0;
      })
      .map(function (l) {
        return l.id;
      });
  }

  function removeImageLayer(map, layerId, sourceId) {
    if (!map) return;
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch (e) {}
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch (e2) {}
    delete imageSourceUrls[sourceId];
  }

  function removeAllImageOverlays(map) {
    activeImageLayerIds(map).forEach(function (layerId) {
      var sourceId = layerId.replace(LAYER_PREFIX, ID_PREFIX);
      removeImageLayer(map, layerId, sourceId);
    });
  }

  function findBeforeLayerId(map, preferred) {
    if (!map) return undefined;
    if (preferred && map.getLayer(preferred)) return preferred;
    var fallbacks = ["story-ov-fill", "story-ov-line", "story-ov-circle", "story-ov-symbol"];
    for (var i = 0; i < fallbacks.length; i++) {
      if (map.getLayer(fallbacks[i])) return fallbacks[i];
    }
    return undefined;
  }

  function syncImageOverlays(map, features, opts) {
    if (!map) return;
    opts = opts || {};
    var normalized = (features || []).map(function (f) {
      return normalizeImageFeature(JSON.parse(JSON.stringify(f)));
    });
    var want = {};
    normalized.forEach(function (f) {
      want[featureLayerId(f)] = f;
    });

    activeImageLayerIds(map).forEach(function (layerId) {
      if (!want[layerId]) {
        var sourceId = layerId.replace(LAYER_PREFIX, ID_PREFIX);
        removeImageLayer(map, layerId, sourceId);
      }
    });

    var beforeId = findBeforeLayerId(map, opts.beforeLayerId);
    normalized.forEach(function (f) {
      var coords = f.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      var lng = coords[0];
      var lat = coords[1];
      var p = f.properties;
      var corners = computeImageCorners(lng, lat, p.widthM, p.heightM, p.rotation || 0);
      var sourceId = featureSourceId(f);
      var layerId = featureLayerId(f);
      var sourceSpec = {
        type: "image",
        url: p.imageUrl,
        coordinates: corners,
      };
      try {
        if (map.getSource(sourceId)) {
          var urlChanged = imageSourceUrls[sourceId] !== p.imageUrl;
          if (urlChanged) {
            removeImageLayer(map, layerId, sourceId);
            map.addSource(sourceId, sourceSpec);
            imageSourceUrls[sourceId] = p.imageUrl;
            map.addLayer(
              {
                id: layerId,
                type: "raster",
                source: sourceId,
                paint: { "raster-opacity": p.opacity },
              },
              beforeId
            );
          } else {
            var src = map.getSource(sourceId);
            if (src && src.setCoordinates) {
              src.setCoordinates(corners);
            }
            if (map.getLayer(layerId)) {
              map.setPaintProperty(layerId, "raster-opacity", p.opacity);
            }
          }
        } else {
          map.addSource(sourceId, sourceSpec);
          imageSourceUrls[sourceId] = p.imageUrl;
          map.addLayer(
            {
              id: layerId,
              type: "raster",
              source: sourceId,
              paint: { "raster-opacity": p.opacity },
            },
            beforeId
          );
        }
      } catch (err) {
        console.warn("Image overlay:", p.imageUrl, err);
      }
    });
  }

  function extractImageFeaturesFromConfig(config) {
    if (!config || !Array.isArray(config.steps)) return [];
    var out = [];
    config.steps.forEach(function (step) {
      var feats =
        step &&
        step.overlays &&
        step.overlays.geojson &&
        step.overlays.geojson.features;
      if (!Array.isArray(feats)) return;
      feats.forEach(function (f) {
        if (isImageFeature(f)) out.push(f);
      });
    });
    return out;
  }

  function guessExtension(url) {
    var m = String(url || "").match(/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    if (String(url || "").indexOf("data:image/png") === 0) return "png";
    if (String(url || "").indexOf("data:image/jpeg") === 0) return "jpg";
    if (String(url || "").indexOf("data:image/webp") === 0) return "webp";
    if (String(url || "").indexOf("data:image/gif") === 0) return "gif";
    return "png";
  }

  function dataUrlToBuffer(dataUrl) {
    var m = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/);
    if (!m) return null;
    if (typeof Buffer !== "undefined") return Buffer.from(m[1], "base64");
    var binary = atob(m[1]);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /**
   * Rewrite image URLs in config for standalone export and return extra zip entries.
   * fetchFn(url) -> Promise<ArrayBuffer> for remote URLs.
   */
  function bundleImagesForStandaloneExport(config, fetchFn) {
    var cfg = JSON.parse(JSON.stringify(config));
    var entries = [];
    var usedNames = {};
    var index = 0;

    function uniqueName(base) {
      var name = base;
      var n = 1;
      while (usedNames[name]) {
        n += 1;
        name = base.replace(/(\.[a-z]+)$/i, "-" + n + "$1");
      }
      usedNames[name] = true;
      return name;
    }

    var tasks = [];
    if (!cfg.steps) return Promise.resolve({ config: cfg, entries: entries });

    cfg.steps.forEach(function (step) {
      if (!step.overlays || !step.overlays.geojson) return;
      (step.overlays.geojson.features || []).forEach(function (f) {
        if (!isImageFeature(f)) return;
        var url = f.properties.imageUrl;
        if (String(url).indexOf("data:") === 0) {
          var buf = dataUrlToBuffer(url);
          if (buf) {
            var ext = guessExtension(url);
            var fname = uniqueName("overlay-" + (f.properties.id || index) + "." + ext);
            entries.push({ name: "assets/" + fname, data: buf });
            f.properties.imageUrl = "assets/" + fname;
          }
          return;
        }
        if (/^https?:\/\//i.test(url) || String(url).indexOf("/") === 0) {
          tasks.push(
            Promise.resolve(fetchFn(url)).then(function (ab) {
              if (!ab) return;
              var ext = guessExtension(url);
              var fname = uniqueName("overlay-" + (f.properties.id || index) + "." + ext);
              var data =
                typeof Buffer !== "undefined" ? Buffer.from(ab) : new Uint8Array(ab);
              entries.push({ name: "assets/" + fname, data: data });
              f.properties.imageUrl = "assets/" + fname;
            })
          );
        }
        index += 1;
      });
    });

    return Promise.all(tasks).then(function () {
      return { config: cfg, entries: entries };
    });
  }

  global.StoryMapImages = {
    MIN_WIDTH_M: MIN_WIDTH_M,
    MAX_WIDTH_M: MAX_WIDTH_M,
    DEFAULT_WIDTH_M: DEFAULT_WIDTH_M,
    newImageFeatureId: newImageFeatureId,
    computeImageCorners: computeImageCorners,
    isImageFeature: isImageFeature,
    extractImageFeatures: extractImageFeatures,
    extractImageFeaturesFromConfig: extractImageFeaturesFromConfig,
    normalizeImageFeature: normalizeImageFeature,
    syncImageOverlays: syncImageOverlays,
    removeAllImageOverlays: removeAllImageOverlays,
    bundleImagesForStandaloneExport: bundleImagesForStandaloneExport,
  };
})(typeof window !== "undefined" ? window : globalThis);
