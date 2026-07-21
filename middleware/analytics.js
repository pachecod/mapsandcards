/**
 * Optional Google Analytics (GA4) via GOOGLE_ANALYTICS_ID.
 * Leave unset/blank to disable — /__analytics.js becomes a no-op.
 */

const GA_ID_RE = /^G-[A-Z0-9]+$/i;

const ANALYTICS_SCRIPT_TAG = '<script src="/__analytics.js" defer></script>';

export function getGaMeasurementId() {
  const raw = (process.env.GOOGLE_ANALYTICS_ID || "").trim();
  if (!raw || !GA_ID_RE.test(raw)) return "";
  return raw;
}

export function buildAnalyticsJs(id = getGaMeasurementId()) {
  if (!id) {
    return "/* Google Analytics disabled (GOOGLE_ANALYTICS_ID unset or invalid) */\n";
  }
  // id is validated above; JSON.stringify keeps the embed safe.
  return (
    "(function () {\n" +
    "  var id = " +
    JSON.stringify(id) +
    ";\n" +
    "  var s = document.createElement('script');\n" +
    "  s.async = true;\n" +
    "  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);\n" +
    "  document.head.appendChild(s);\n" +
    "  window.dataLayer = window.dataLayer || [];\n" +
    "  function gtag(){ dataLayer.push(arguments); }\n" +
    "  window.gtag = gtag;\n" +
    "  gtag('js', new Date());\n" +
    "  gtag('config', id);\n" +
    "})();\n"
  );
}

/** Insert the analytics loader before </head> if missing. */
export function injectAnalyticsScript(html) {
  if (typeof html !== "string") return html;
  if (html.includes("/__analytics.js")) return html;
  const tag = "  " + ANALYTICS_SCRIPT_TAG + "\n";
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, tag + "</head>");
  }
  return tag + html;
}

/**
 * Connect/Express middleware: serves GET /__analytics.js.
 * Safe to mount on Vite and production; no-op body when env is unset.
 */
export function analyticsMiddleware() {
  return function analytics(req, res, next) {
    const rawUrl = req.url || "/";
    const pathname = rawUrl.split("?")[0];
    if (pathname !== "/__analytics.js") {
      return next();
    }
    const body = buildAnalyticsJs();
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(body);
  };
}
