/**
 * Bottom-right N/E/S/W compass for MapLibre maps.
 * The dial rotates so N always points to geographic north.
 */
(function (global) {
  "use strict";

  var STYLE_ID = "map-compass-styles";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".map-compass.maplibregl-ctrl {" +
      "margin: 0 10px 10px 0 !important;" +
      "background: transparent;" +
      "box-shadow: none;" +
      "}" +
      ".map-compass-btn {" +
      "position: relative;" +
      "display: block;" +
      "width: 52px;" +
      "height: 52px;" +
      "margin: 0;" +
      "padding: 0;" +
      "border: 0;" +
      "border-radius: 50%;" +
      "background: rgba(255, 255, 255, 0.92);" +
      "box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);" +
      "cursor: default;" +
      "color: #374151;" +
      "}" +
      ".map-compass-btn.is-interactive {" +
      "cursor: pointer;" +
      "}" +
      ".map-compass-btn.is-interactive:hover," +
      ".map-compass-btn.is-interactive:focus-visible {" +
      "background: #fff;" +
      "outline: 2px solid rgba(37, 99, 235, 0.45);" +
      "outline-offset: 1px;" +
      "}" +
      ".map-compass-dial {" +
      "position: absolute;" +
      "inset: 4px;" +
      "border-radius: 50%;" +
      "border: 1px solid rgba(0, 0, 0, 0.12);" +
      "transform: rotate(0deg);" +
      "will-change: transform;" +
      "}" +
      ".map-compass-label {" +
      "position: absolute;" +
      "font-size: 0.58rem;" +
      "font-weight: 700;" +
      "line-height: 1;" +
      "letter-spacing: 0.02em;" +
      "user-select: none;" +
      "pointer-events: none;" +
      "}" +
      ".map-compass-n {" +
      "top: 3px;" +
      "left: 50%;" +
      "transform: translateX(-50%);" +
      "color: #b42318;" +
      "}" +
      ".map-compass-e {" +
      "top: 50%;" +
      "right: 3px;" +
      "transform: translateY(-50%);" +
      "}" +
      ".map-compass-s {" +
      "bottom: 3px;" +
      "left: 50%;" +
      "transform: translateX(-50%);" +
      "}" +
      ".map-compass-w {" +
      "top: 50%;" +
      "left: 3px;" +
      "transform: translateY(-50%);" +
      "}" +
      ".map-compass-needle {" +
      "position: absolute;" +
      "top: 50%;" +
      "left: 50%;" +
      "width: 2px;" +
      "height: 38%;" +
      "margin-left: -1px;" +
      "transform: translateY(-100%);" +
      "transform-origin: center bottom;" +
      "background: linear-gradient(to top, #374151 0%, #b42318 100%);" +
      "border-radius: 1px;" +
      "pointer-events: none;" +
      "}";
    document.head.appendChild(style);
  }

  function MapCompassControl(options) {
    this._options = options || {};
    this._resetEnabled = this._options.resetBearingOnClick !== false;
  }

  MapCompassControl.prototype.getDefaultPosition = function () {
    return "bottom-right";
  };

  MapCompassControl.prototype.setResetEnabled = function (enabled) {
    this._resetEnabled = !!enabled;
    this._syncInteractiveState();
  };

  MapCompassControl.prototype._syncInteractiveState = function () {
    if (!this._btn) return;
    var interactive = !!this._resetEnabled;
    this._btn.classList.toggle("is-interactive", interactive);
    this._btn.title = interactive ? "Reset north (N up)" : "Map bearing";
    this._btn.setAttribute(
      "aria-label",
      interactive ? "Reset map bearing to north" : "Map bearing compass"
    );
  };

  MapCompassControl.prototype.onAdd = function (map) {
    ensureStyles();
    this._map = map;
    var self = this;

    var wrap = document.createElement("div");
    wrap.className = "map-compass maplibregl-ctrl";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-compass-btn";

    var dial = document.createElement("div");
    dial.className = "map-compass-dial";
    dial.innerHTML =
      '<span class="map-compass-label map-compass-n">N</span>' +
      '<span class="map-compass-label map-compass-e">E</span>' +
      '<span class="map-compass-label map-compass-s">S</span>' +
      '<span class="map-compass-label map-compass-w">W</span>' +
      '<span class="map-compass-needle" aria-hidden="true"></span>';

    btn.appendChild(dial);
    wrap.appendChild(btn);
    this._btn = btn;
    this._dial = dial;

    this._update = function () {
      if (!self._dial || !map) return;
      self._dial.style.transform = "rotate(" + -map.getBearing() + "deg)";
    };

    map.on("rotate", this._update);
    map.on("move", this._update);
    this._update();

    btn.addEventListener("click", function () {
      if (!self._resetEnabled || !map) return;
      map.easeTo({ bearing: 0, duration: 300 });
    });

    this._syncInteractiveState();
    this._container = wrap;
    return wrap;
  };

  MapCompassControl.prototype.onRemove = function () {
    if (this._map && this._update) {
      this._map.off("rotate", this._update);
      this._map.off("move", this._update);
    }
    this._map = undefined;
    this._btn = undefined;
    this._dial = undefined;
  };

  global.MapCompassControl = MapCompassControl;
})(typeof window !== "undefined" ? window : globalThis);
