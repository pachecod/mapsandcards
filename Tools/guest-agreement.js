/**
 * Guest Mode agreement modal — same UX as WebxRide / hotspot guest agreement:
 * Cancel / I Agree before entering Guest Mode.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mapsandcards-guest-agreement-accepted";
  var STYLE_ID = "guest-agreement-styles";

  var TITLE = "Guest Mode";
  var CONTENT_HTML =
    "<p>You are entering <strong>Guest Mode</strong> in Maps &amp; Cards.</p>" +
    "<ul>" +
    "<li>Your work is <strong>not saved</strong> to our online storage.</li>" +
    "<li>Drafts stay in <strong>this browser only</strong> (local storage).</li>" +
    "<li>You use Guest Mode <strong>at your own risk</strong>.</li>" +
    "<li>Any content you export or host yourself is <strong>your responsibility</strong>.</li>" +
    "</ul>" +
    "<p>By continuing, you agree to our " +
    '<a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms of Use</a>' +
    " and " +
    '<a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>';

  var CSS_TEXT =
    "body.guest-agreement-open{overflow:hidden;}" +
    ".guest-agreement-overlay{position:fixed;inset:0;z-index:200000;display:flex!important;" +
    "align-items:center;justify-content:center;padding:16px;" +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}' +
    ".guest-agreement-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.82);}" +
    ".guest-agreement-dialog{position:relative;z-index:1;width:min(100%,460px);" +
    "max-height:min(82vh,520px);background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);" +
    "border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);display:flex;" +
    "flex-direction:column;overflow:hidden;color:#fff;}" +
    ".guest-agreement-title{margin:0;padding:18px 20px 10px;font-size:1.125rem;" +
    "line-height:1.3;color:#fff;font-weight:700;}" +
    ".guest-agreement-content{padding:0 20px 16px;overflow-y:auto;font-size:14px;" +
    "line-height:1.55;color:#f0f0f0;text-align:left;}" +
    ".guest-agreement-content p,.guest-agreement-content li{color:#f0f0f0;}" +
    ".guest-agreement-content ul{margin:0 0 .75rem;padding-left:1.25rem;}" +
    ".guest-agreement-content p{margin:0 0 .75rem;}" +
    ".guest-agreement-content p:last-child{margin-bottom:0;}" +
    ".guest-agreement-content a{color:#fff;text-decoration:underline;text-underline-offset:2px;}" +
    ".guest-agreement-content a:hover{color:rgba(255,255,255,.9);}" +
    ".guest-agreement-actions{display:flex;gap:10px;justify-content:flex-end;" +
    "padding:14px 20px 18px;border-top:1px solid rgba(255,255,255,.22);" +
    "background:rgba(0,0,0,.12);}" +
    ".guest-agreement-btn{padding:9px 16px;border-radius:8px;font-size:14px;" +
    "font-weight:700;cursor:pointer;border:1px solid transparent;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.2);font-family:inherit;}" +
    ".guest-agreement-cancel{background:transparent;border-color:rgba(255,255,255,.45);color:#fff;}" +
    ".guest-agreement-cancel:hover{background:rgba(255,255,255,.1);}" +
    ".guest-agreement-agree{background:#fff;color:#667eea;border-color:#fff;}" +
    ".guest-agreement-agree:hover{background:rgba(255,255,255,.92);}";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
  }

  function hasAgreed() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return !!global.__guestAgreementAccepted;
    }
  }

  function setAgreed(value) {
    global.__guestAgreementAccepted = !!value;
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, "1");
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function closeOverlay() {
    var overlay = document.getElementById("guest-agreement-overlay");
    if (overlay) overlay.remove();
    document.body.classList.remove("guest-agreement-open");
  }

  function showGuestAgreementOverlay() {
    return new Promise(function (resolve) {
      ensureStyles();
      closeOverlay();

      var overlay = document.createElement("div");
      overlay.id = "guest-agreement-overlay";
      overlay.className = "guest-agreement-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "guest-agreement-title");
      overlay.innerHTML =
        '<div class="guest-agreement-backdrop" data-action="cancel"></div>' +
        '<div class="guest-agreement-dialog">' +
        '<h2 id="guest-agreement-title" class="guest-agreement-title">' +
        TITLE +
        "</h2>" +
        '<div class="guest-agreement-content">' +
        CONTENT_HTML +
        "</div>" +
        '<div class="guest-agreement-actions">' +
        '<button type="button" class="guest-agreement-btn guest-agreement-cancel" data-action="cancel">Cancel</button>' +
        '<button type="button" class="guest-agreement-btn guest-agreement-agree" data-action="agree">I Agree</button>' +
        "</div>" +
        "</div>";

      function finish(agreed) {
        if (agreed) setAgreed(true);
        closeOverlay();
        document.removeEventListener("keydown", onKeyDown, true);
        resolve(agreed);
      }

      function onKeyDown(ev) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          finish(false);
        }
      }

      overlay.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-action");
        if (action === "agree") finish(true);
        if (action === "cancel") finish(false);
      });

      document.addEventListener("keydown", onKeyDown, true);
      document.body.appendChild(overlay);
      document.body.classList.add("guest-agreement-open");
      var agreeBtn = overlay.querySelector(".guest-agreement-agree");
      if (agreeBtn) agreeBtn.focus();
    });
  }

  function promptGuestAgreementIfNeeded() {
    if (hasAgreed()) return Promise.resolve(true);
    return showGuestAgreementOverlay();
  }

  /**
   * Navigate to a Guest Mode URL after agreement (or immediately if already agreed).
   */
  function goToGuestMode(href) {
    return promptGuestAgreementIfNeeded().then(function (ok) {
      if (ok) window.location.href = href;
      return ok;
    });
  }

  /**
   * Intercept clicks on links that open Guest Mode (href contains guest=1).
   */
  function interceptGuestModeLinks(root) {
    var scope = root || document;
    scope.addEventListener("click", function (ev) {
      var a = ev.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.indexOf("guest=1") === -1 && href.indexOf("mode=guest") === -1) return;
      if (ev.defaultPrevented) return;
      if (ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      goToGuestMode(a.href);
    });
  }

  global.MapsAndCardsGuestAgreement = {
    STORAGE_KEY: STORAGE_KEY,
    hasAgreed: hasAgreed,
    setAgreed: setAgreed,
    promptGuestAgreementIfNeeded: promptGuestAgreementIfNeeded,
    showGuestAgreementOverlay: showGuestAgreementOverlay,
    goToGuestMode: goToGuestMode,
    interceptGuestModeLinks: interceptGuestModeLinks
  };
})(typeof window !== "undefined" ? window : globalThis);
