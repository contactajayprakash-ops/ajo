// Static server. No dependencies: node serve.mjs
//
// Cache-busting note: LingoQL's edge serves JS/CSS with a one-year `immutable`
// Cache-Control, so with fixed filenames browsers never pick up a new deploy.
// We can't change the edge header, but we CAN change the URLs: every response
// is stamped with a per-process version (`?v=<VERSION>`), injected into the
// HTML's asset links AND into each module's relative imports. A redeploy starts
// a fresh process → new VERSION → every URL changes → the immutable cache is
// bypassed cleanly. index.html itself is only edge-cached ~5 min, so the new
// stamped URLs reach browsers quickly. No build step, no manual bumping.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// LingoQL injects HOST and PORT; fall back to localhost defaults for dev.
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5173;

// One token per process. A new deploy = a new process = a new token.
const VERSION =
  process.env.DEPLOY_VERSION || process.env.LINGOQL_DEPLOY_ID || String(Date.now());

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Stamp relative module specifiers ("./x.js", "../y.mjs") inside a module so the
// whole import graph — not just the entry file — resolves to versioned URLs.
function stampModule(code) {
  return code.replace(
    /(["'])(\.\.?\/[^"']+?\.m?js)\1/g,
    (_m, q, spec) => `${q}${spec}?v=${VERSION}${q}`
  );
}

// Stamp asset URLs in the HTML shell (local .css / .js references only).
function stampHtml(html) {
  return html.replace(
    /((?:href|src)=")(\.\.?\/[^"]+?\.(?:css|js|mjs))(")/g,
    (_m, pre, url, post) => `${pre}${url}?v=${VERSION}${post}`
  );
}

const server = http.createServer((req, res) => {
  // The query carries our version tag; the file on disk is the bare path.
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath.endsWith("/")) urlPath += "index.html";

  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";

    let body = data;
    if (ext === ".html") {
      body = stampHtml(data.toString("utf8"));
    } else if (ext === ".js" || ext === ".mjs") {
      body = stampModule(data.toString("utf8"));
    }

    // Ask the browser to always revalidate the HTML shell so new stamped asset
    // URLs are picked up promptly. Assets carry a version in their URL, so they
    // stay safely cacheable — a changed file means a changed URL.
    const cache = ext === ".html"
      ? "no-cache"
      : "public, max-age=31536000, immutable";

    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache }).end(body);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ajo frontend on ${HOST}:${PORT} (build ${VERSION})`);
});
