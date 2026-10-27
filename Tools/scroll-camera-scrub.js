/**
 * Scroll-progress camera scrubbing for scroll-driven map stories.
 * Maps document scroll position to interpolated camera states (no timed flyTo).
 */
(function (global) {
  "use strict";

  var DEFAULT_ANCHOR_RATIO = 0.42;

  /* Hold zones: scroll ranges where the camera parks on a step instead of travelling. */
  var HOLD_VH_PER_SEC = 0.45; // one second of "pause" ≈ 45% of a viewport height scrolled
  var HOLD_ENTER_RATIO = 0.8; // hold begins once the card top rises past 80% of the viewport
  var HOLD_EXIT_RATIO = 0.2; // hold ends once the card bottom passes 20% of the viewport
  var MIN_TRAVEL_RATIO = 0.25; // never squeeze camera travel below this much viewport

  function pxPerHoldSecond() {
    return HOLD_VH_PER_SEC * window.innerHeight;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpBearing(a, b, t) {
    var delta = b - a;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return a + delta * t;
  }

  function lerpCamera(from, to, t) {
    t = clamp(t, 0, 1);
    return {
      lng: lerp(from.lng, to.lng, t),
      lat: lerp(from.lat, to.lat, t),
      zoom: lerp(from.zoom, to.zoom, t),
      pitch: lerp(from.pitch, to.pitch, t),
      bearing: lerpBearing(from.bearing, to.bearing, t),
    };
  }

  function cameraAlongTransition(from, to, peak, t, usePullback) {
    t = clamp(t, 0, 1);
    if (!usePullback || !peak) return lerpCamera(from, to, t);
    if (t <= 0.5) return lerpCamera(from, peak, t / 0.5);
    return lerpCamera(peak, to, (t - 0.5) / 0.5);
  }

  /*
    Anchor on the card, not the wrapper. They share a centre today, but a step with an extra
    hold pause gets bottom padding on its wrapper, which would drag a wrapper-based anchor
    away from the card the reader is actually looking at.
  */
  function anchorElement(block) {
    return block.querySelector(".card") || block;
  }

  function blockAnchorScrollY(block, anchorRatio) {
    var rect = anchorElement(block).getBoundingClientRect();
    var center = rect.top + rect.height / 2;
    var targetViewportY = window.innerHeight * anchorRatio;
    return window.scrollY + center - targetViewportY;
  }

  function computeAnchors(panel, anchorRatio) {
    if (!panel) return [];
    var blocks = panel.querySelectorAll(".step-block[data-step-index]");
    var anchors = [];
    for (var i = 0; i < blocks.length; i++) {
      var idx = parseInt(blocks[i].dataset.stepIndex, 10);
      if (isNaN(idx)) continue;
      anchors[idx] = blockAnchorScrollY(blocks[i], anchorRatio);
    }
    return anchors;
  }

  /**
   * Scroll ranges per step: [holdStart, holdEnd] parks the camera, the gap to the next
   * step's holdStart is where the camera travels. Steps without scrollHold collapse to a
   * zero-width hold at their anchor, which reproduces plain anchor-to-anchor interpolation.
   */
  function computeZones(panel, anchorRatio, stepCount, holdFn, extraFn) {
    var zones = [];
    if (!panel) return zones;
    var viewportH = window.innerHeight;
    var blocks = panel.querySelectorAll(".step-block[data-step-index]");

    for (var b = 0; b < blocks.length; b++) {
      var idx = parseInt(blocks[b].dataset.stepIndex, 10);
      if (isNaN(idx)) continue;
      var rect = anchorElement(blocks[b]).getBoundingClientRect();
      var topDoc = window.scrollY + rect.top;
      var anchor = topDoc + rect.height / 2 - viewportH * anchorRatio;
      var extraSec = extraFn ? extraFn(idx) : 0;
      var extraPx = extraSec > 0 ? extraSec * pxPerHoldSecond() : 0;
      var zone = { anchor: anchor, holdStart: anchor, holdEnd: anchor, extraHoldPx: extraPx };
      if (holdFn && holdFn(idx)) {
        zone.holdStart = Math.min(anchor, topDoc - HOLD_ENTER_RATIO * viewportH);
        zone.holdEnd = Math.max(anchor, topDoc + rect.height - HOLD_EXIT_RATIO * viewportH);
      }
      if (extraPx > 0) zone.holdEnd += extraPx;
      zones[idx] = zone;
    }

    // Keep a travel gap between neighbouring holds, shrinking whichever has room to give.
    // Never shrink below extraHoldPx — that portion is intentional pause-after-card time.
    var minTravel = MIN_TRAVEL_RATIO * viewportH;
    for (var i = 0; i < stepCount - 1; i++) {
      var a = zones[i];
      var c = zones[i + 1];
      if (!a || !c) continue;
      var deficit = minTravel - (c.holdStart - a.holdEnd);
      if (deficit <= 0) continue;
      var minAHoldEnd = a.anchor + (a.extraHoldPx || 0);
      var slackA = Math.max(0, a.holdEnd - minAHoldEnd);
      var slackC = Math.max(0, c.anchor - c.holdStart);
      var slack = slackA + slackC;
      if (slack <= 0) continue;
      a.holdEnd = Math.max(minAHoldEnd, a.holdEnd - deficit * (slackA / slack));
      c.holdStart = Math.min(c.anchor, c.holdStart + deficit * (slackC / slack));
    }
    return zones;
  }

  function segmentForZones(zones, scrollY, stepCount) {
    if (stepCount <= 1) {
      return { fromIndex: 0, toIndex: 0, t: 0, activeIndex: 0, mode: "hold" };
    }

    var first = zones[0];
    if (first && scrollY <= first.holdEnd) {
      return { fromIndex: 0, toIndex: 0, t: 0, activeIndex: 0, mode: "hold" };
    }

    for (var i = 0; i < stepCount - 1; i++) {
      var a = zones[i];
      var c = zones[i + 1];
      if (!a || !c) continue;
      if (scrollY >= a.holdEnd && scrollY < c.holdStart) {
        var span = c.holdStart - a.holdEnd;
        var t = span > 0 ? clamp((scrollY - a.holdEnd) / span, 0, 1) : 1;
        return {
          fromIndex: i,
          toIndex: i + 1,
          t: t,
          activeIndex: t >= 0.5 ? i + 1 : i,
          mode: "travel",
        };
      }
      if (scrollY >= c.holdStart && scrollY <= c.holdEnd) {
        return {
          fromIndex: i + 1,
          toIndex: i + 1,
          t: 0,
          activeIndex: i + 1,
          mode: "hold",
        };
      }
    }

    var last = stepCount - 1;
    return { fromIndex: last, toIndex: last, t: 0, activeIndex: last, mode: "hold" };
  }

  function segmentForScrollY(anchors, scrollY, stepCount) {
    if (stepCount <= 0) {
      return { fromIndex: 0, toIndex: 0, t: 0, activeIndex: 0 };
    }
    if (stepCount === 1) {
      return { fromIndex: 0, toIndex: 0, t: 0, activeIndex: 0 };
    }

    var firstAnchor = anchors[0];
    if (firstAnchor != null && scrollY <= firstAnchor) {
      return { fromIndex: 0, toIndex: 0, t: 0, activeIndex: 0 };
    }

    for (var i = 0; i < stepCount - 1; i++) {
      var a0 = anchors[i];
      var a1 = anchors[i + 1];
      if (a0 == null || a1 == null) continue;
      if (scrollY >= a0 && scrollY < a1) {
        var t = clamp((scrollY - a0) / (a1 - a0), 0, 1);
        return {
          fromIndex: i,
          toIndex: i + 1,
          t: t,
          activeIndex: t >= 0.5 ? i + 1 : i,
        };
      }
    }

    var last = stepCount - 1;
    return { fromIndex: last, toIndex: last, t: 0, activeIndex: last };
  }

  function scrollYForStepAnchor(panel, stepIndex, anchorRatio) {
    if (!panel) return null;
    var block = panel.querySelector('.step-block[data-step-index="' + stepIndex + '"]');
    if (!block) return null;
    return blockAnchorScrollY(block, anchorRatio);
  }

  function create(options) {
    options = options || {};
    var panel = options.panel;
    var anchorRatio =
      options.anchorRatio != null ? options.anchorRatio : DEFAULT_ANCHOR_RATIO;
    var getStepCount =
      options.getStepCount ||
      function () {
        return 0;
      };
    var stepScrollHoldFn = options.stepScrollHoldFn || null;
    var stepScrollHoldExtraFn = options.stepScrollHoldExtraFn || null;
    var onScrub = options.onScrub;
    var onSettled = options.onSettled;
    var enabled = options.enabled !== false;
    var settleMs = options.settleMs != null ? options.settleMs : 150;

    var anchors = [];
    var zones = [];
    var rafId = 0;
    var pending = false;
    var settleTimer = 0;
    var resizeObserver = null;
    var lastScrubScrollY = -1;

    function refreshAnchors() {
      zones = computeZones(
        panel,
        anchorRatio,
        getStepCount(),
        stepScrollHoldFn,
        stepScrollHoldExtraFn
      );
      anchors = [];
      for (var i = 0; i < zones.length; i++) {
        if (zones[i]) anchors[i] = zones[i].anchor;
      }
      return anchors;
    }

    function runScrub() {
      pending = false;
      rafId = 0;
      if (!enabled) return;
      var scrollY = window.scrollY;
      var stepCount = getStepCount();
      refreshAnchors();
      var seg = segmentForZones(zones, scrollY, stepCount);
      if (scrollY !== lastScrubScrollY) {
        lastScrubScrollY = scrollY;
        if (onScrub) onScrub(seg, scrollY);
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(function () {
        refreshAnchors();
        var settledSeg = segmentForZones(zones, window.scrollY, getStepCount());
        if (onSettled) onSettled(settledSeg);
      }, settleMs);
    }

    function scheduleScrub() {
      if (!enabled || pending) return;
      pending = true;
      rafId = window.requestAnimationFrame(runScrub);
    }

    function onScroll() {
      scheduleScrub();
    }

    function onResize() {
      refreshAnchors();
      scheduleScrub();
    }

    function scrollToStepIndex(stepIndex, smooth) {
      refreshAnchors();
      var y = scrollYForStepAnchor(panel, stepIndex, anchorRatio);
      if (y == null) return Promise.resolve();
      var top = Math.max(0, y);
      try {
        window.scrollTo({ top: top, left: 0, behavior: smooth ? "smooth" : "auto" });
      } catch (e) {
        window.scrollTo(0, top);
      }
      scheduleScrub();
      if (!smooth) return Promise.resolve();

      return new Promise(function (resolve) {
        var start = Date.now();
        var lastY = window.scrollY;
        var stableFrames = 0;
        function poll() {
          var yNow = window.scrollY;
          if (Math.abs(yNow - top) < 2) {
            scheduleScrub();
            resolve();
            return;
          }
          if (yNow === lastY) stableFrames += 1;
          else stableFrames = 0;
          lastY = yNow;
          if (stableFrames > 8 || Date.now() - start > 5000) {
            scheduleScrub();
            resolve();
            return;
          }
          window.requestAnimationFrame(poll);
        }
        window.requestAnimationFrame(poll);
      });
    }

    function attach() {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      if (typeof ResizeObserver !== "undefined" && panel) {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(panel);
      }
      refreshAnchors();
      scheduleScrub();
    }

    function detach() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (rafId) window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      rafId = 0;
      pending = false;
    }

    function setEnabled(v) {
      enabled = !!v;
      if (enabled) scheduleScrub();
    }

    return {
      refreshAnchors: refreshAnchors,
      scheduleScrub: scheduleScrub,
      scrollToStepIndex: scrollToStepIndex,
      segmentAtScroll: function () {
        refreshAnchors();
        return segmentForZones(zones, window.scrollY, getStepCount());
      },
      attach: attach,
      detach: detach,
      setEnabled: setEnabled,
    };
  }

  global.ScrollCameraScrub = {
    DEFAULT_ANCHOR_RATIO: DEFAULT_ANCHOR_RATIO,
    HOLD_VH_PER_SEC: HOLD_VH_PER_SEC,
    pxPerHoldSecond: pxPerHoldSecond,
    lerpCamera: lerpCamera,
    lerpBearing: lerpBearing,
    cameraAlongTransition: cameraAlongTransition,
    computeAnchors: computeAnchors,
    computeZones: computeZones,
    segmentForScrollY: segmentForScrollY,
    segmentForZones: segmentForZones,
    scrollYForStepAnchor: scrollYForStepAnchor,
    create: create,
  };
})(typeof window !== "undefined" ? window : this);
