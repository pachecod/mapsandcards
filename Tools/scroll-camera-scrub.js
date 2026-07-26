/**
 * Scroll-progress camera scrubbing for scroll-driven map stories.
 * Maps document scroll position to interpolated camera states (no timed flyTo).
 */
(function (global) {
  "use strict";

  var DEFAULT_ANCHOR_RATIO = 0.42;

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

  function blockAnchorScrollY(block, anchorRatio) {
    var rect = block.getBoundingClientRect();
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
    var onScrub = options.onScrub;
    var onSettled = options.onSettled;
    var enabled = options.enabled !== false;
    var settleMs = options.settleMs != null ? options.settleMs : 150;

    var anchors = [];
    var rafId = 0;
    var pending = false;
    var settleTimer = 0;
    var resizeObserver = null;

    function refreshAnchors() {
      anchors = computeAnchors(panel, anchorRatio);
      return anchors;
    }

    function runScrub() {
      pending = false;
      rafId = 0;
      if (!enabled) return;
      var scrollY = window.scrollY;
      var stepCount = getStepCount();
      refreshAnchors();
      var seg = segmentForScrollY(anchors, scrollY, stepCount);
      if (onScrub) onScrub(seg, scrollY);

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(function () {
        refreshAnchors();
        var settledSeg = segmentForScrollY(anchors, window.scrollY, getStepCount());
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
        return segmentForScrollY(anchors, window.scrollY, getStepCount());
      },
      attach: attach,
      detach: detach,
      setEnabled: setEnabled,
    };
  }

  global.ScrollCameraScrub = {
    DEFAULT_ANCHOR_RATIO: DEFAULT_ANCHOR_RATIO,
    lerpCamera: lerpCamera,
    lerpBearing: lerpBearing,
    cameraAlongTransition: cameraAlongTransition,
    computeAnchors: computeAnchors,
    segmentForScrollY: segmentForScrollY,
    scrollYForStepAnchor: scrollYForStepAnchor,
    create: create,
  };
})(typeof window !== "undefined" ? window : this);
