/**
 * Procedural screen-fixed starfield behind globe projection (MapLibre custom layer + dark sky).
 */
(function (global) {
  var LAYER_ID = "mc-globe-stars";
  var STAR_COUNT = 2200;

  var mapState = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var fallbackState = {};

  function getState(map) {
    if (mapState) {
      if (!mapState.has(map)) mapState.set(map, { layer: null, skyApplied: false });
      return mapState.get(map);
    }
    var key = map && map._container && map._container.id ? map._container.id : "_default";
    if (!fallbackState[key]) fallbackState[key] = { layer: null, skyApplied: false };
    return fallbackState[key];
  }

  function effectiveGlobeStars(config, step) {
    if (step && typeof step.globeStars === "boolean") {
      return step.globeStars;
    }
    return !!(config && config.globeStars === true);
  }

  function wantsStars(config, step) {
    return !!(
      config &&
      config.projection === "globe" &&
      effectiveGlobeStars(config, step)
    );
  }

  function findBottomLayerId(map) {
    if (!map || !map.getStyle) return undefined;
    var style = map.getStyle();
    if (!style || !style.layers || !style.layers.length) return undefined;
    return style.layers[0].id;
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("[GlobeStars] shader compile:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[GlobeStars] program link:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function buildStarLayer() {
    var layer = {
      id: LAYER_ID,
      type: "custom",
      /* 3d pass: not draped onto the globe (2d custom layers are). Never write
         depth — writing far z here previously broke globe rendering. */
      renderingMode: "3d",
      program: null,
      buffer: null,
      sizes: null,
      opacities: null,
      onAdd: function (map, gl) {
        this.map = map;
        var vert =
          "attribute vec2 a_pos;" +
          "attribute float a_size;" +
          "attribute float a_opacity;" +
          "varying float v_opacity;" +
          "void main() {" +
          "  v_opacity = a_opacity;" +
          /* Far clip, screen-fixed. Depth writes stay off in render(). */
          "  gl_Position = vec4(a_pos, 0.999, 1.0);" +
          "  gl_PointSize = a_size;" +
          "}";
        var frag =
          "precision mediump float;" +
          "varying float v_opacity;" +
          "void main() {" +
          "  vec2 c = gl_PointCoord - vec2(0.5);" +
          "  float d = length(c);" +
          "  if (d > 0.5) discard;" +
          "  float alpha = smoothstep(0.5, 0.08, d) * v_opacity;" +
          "  gl_FragColor = vec4(0.95, 0.97, 1.0, alpha);" +
          "}";
        this.program = createProgram(gl, vert, frag);
        if (!this.program) return;

        var positions = new Float32Array(STAR_COUNT * 2);
        var sizes = new Float32Array(STAR_COUNT);
        var opacities = new Float32Array(STAR_COUNT);
        for (var i = 0; i < STAR_COUNT; i++) {
          var i2 = i * 2;
          positions[i2] = Math.random() * 2 - 1;
          positions[i2 + 1] = Math.random() * 2 - 1;
          sizes[i] = 1.2 + Math.random() * 2.4;
          opacities[i] = 0.2 + Math.random() * 0.8;
        }
        this.sizes = sizes;
        this.opacities = opacities;

        this.buffer = gl.createBuffer();
        this.sizeBuffer = gl.createBuffer();
        this.opacityBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.opacityBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, opacities, gl.STATIC_DRAW);
      },
      render: function (gl, _args) {
        if (!this.program || !this.buffer) return;

        var depthTest = gl.isEnabled(gl.DEPTH_TEST);
        var blend = gl.isEnabled(gl.BLEND);
        var depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        var depthFunc = gl.getParameter(gl.DEPTH_FUNC);

        gl.useProgram(this.program);

        var posLoc = gl.getAttribLocation(this.program, "a_pos");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        var sizeLoc = gl.getAttribLocation(this.program, "a_size");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
        gl.enableVertexAttribArray(sizeLoc);
        gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

        var opLoc = gl.getAttribLocation(this.program, "a_opacity");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.opacityBuffer);
        gl.enableVertexAttribArray(opLoc);
        gl.vertexAttribPointer(opLoc, 1, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        /* Globe depth is filled before the 3d custom pass. Test against it so
           stars only appear in space — without this, bright stars sit on top of
           the earth and read as "through the map" on dark basemaps (Dark Matter).
           Never write depth (far z writes previously flattened the globe). */
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, STAR_COUNT);

        gl.depthMask(depthMask);
        gl.depthFunc(depthFunc);
        if (depthTest) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        if (blend) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);
      },
      onRemove: function (_map, gl) {
        if (this.buffer) gl.deleteBuffer(this.buffer);
        if (this.sizeBuffer) gl.deleteBuffer(this.sizeBuffer);
        if (this.opacityBuffer) gl.deleteBuffer(this.opacityBuffer);
        if (this.program) gl.deleteProgram(this.program);
        this.program = null;
        this.buffer = null;
        this.sizeBuffer = null;
        this.opacityBuffer = null;
      },
    };

    return layer;
  }

  function applyDarkSky(map) {
    if (!map || typeof map.setSky !== "function") return;
    try {
      map.setSky({
        "sky-color": "#02020a",
        "horizon-color": "#040414",
        "sky-horizon-blend": 0.12,
        "atmosphere-blend": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.1,
          4,
          0.45,
          8,
          0.88,
        ],
      });
    } catch (e) {
      console.warn("[GlobeStars] setSky failed:", e);
    }
  }

  function clearSky(map) {
    if (!map || typeof map.setSky !== "function") return;
    try {
      map.setSky(undefined);
    } catch (e) {
      console.warn("[GlobeStars] clearSky failed:", e);
    }
  }

  function removeLayer(map) {
    if (!map) return;
    var state = getState(map);
    try {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    } catch (e) {}
    state.layer = null;
    if (state.skyApplied) {
      clearSky(map);
      state.skyApplied = false;
    }
  }

  function addLayer(map) {
    var state = getState(map);
    var hasLayer = false;
    try {
      hasLayer = !!map.getLayer(LAYER_ID);
    } catch (e) {
      hasLayer = false;
    }
    if (!hasLayer) {
      /* Always build a fresh custom layer — reused objects can keep dead GL
         state after setStyle / setProjection, so stars never come back. */
      state.layer = buildStarLayer();
      try {
        var beforeId = findBottomLayerId(map);
        if (beforeId) map.addLayer(state.layer, beforeId);
        else map.addLayer(state.layer);
        hasLayer = true;
      } catch (e) {
        console.warn("[GlobeStars] addLayer failed:", e);
        state.layer = null;
        hasLayer = false;
      }
    }
    /* Sky is cleared by setProjection / style swaps even when the custom
       layer survives — always re-assert the dark star sky when enabled. */
    if (hasLayer) {
      applyDarkSky(map);
      state.skyApplied = true;
    }
  }

  function apply(map, config, step) {
    if (!map) return;
    if (!wantsStars(config, step)) {
      removeLayer(map);
      return;
    }
    if (!map.isStyleLoaded || !map.isStyleLoaded()) {
      map.once("load", function () {
        apply(map, config, step);
      });
      return;
    }
    addLayer(map);
    if (typeof map.triggerRepaint === "function") map.triggerRepaint();
  }

  function syncAfterStyleLoad(map, config, step) {
    if (!map) return;
    removeLayer(map);
    apply(map, config, step);
  }

  /** Force remove + re-add after projection flips that leave a dead layer. */
  function refresh(map, config, step) {
    if (!map) return;
    removeLayer(map);
    apply(map, config, step);
  }

  function normalizeStepGlobeStars(step) {
    if (!step || typeof step !== "object") return;
    if (step.globeStars === true) step.globeStars = true;
    else if (step.globeStars === false) step.globeStars = false;
    else delete step.globeStars;
  }

  function normalizeGlobeStarsConfig(data) {
    if (!data || typeof data !== "object") return;
    if (data.projection !== "globe") {
      delete data.globeStars;
      return;
    }
    if (data.globeStars === true) data.globeStars = true;
    else delete data.globeStars;
  }

  global.GlobeStars = {
    LAYER_ID: LAYER_ID,
    apply: apply,
    syncAfterStyleLoad: syncAfterStyleLoad,
    refresh: refresh,
    remove: removeLayer,
    wantsStars: wantsStars,
    effectiveGlobeStars: effectiveGlobeStars,
    normalizeGlobeStarsConfig: normalizeGlobeStarsConfig,
    normalizeStepGlobeStars: normalizeStepGlobeStars,
  };
})(typeof window !== "undefined" ? window : globalThis);
