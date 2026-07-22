// Cache-bust stamper. Run before deploying: `node stamp.mjs`
//
// Why: LingoQL's edge serves JS/CSS with a one-year `immutable` Cache-Control,
// so with fixed filenames browsers never see a new deploy. This bakes a version
// query (`?v=<hash>`) onto every local asset URL in index.html AND every
// relative import inside each module, so changed code means changed URLs that
// the immutable cache can't mistake for the old ones. The version is a short
// hash of all asset contents, so it changes only when something actually
// changed (clean diffs, deterministic). Re-running is idempotent.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const assetFiles = walk(ROOT).filter((f) => /\.(m?js|css)$/.test(f) && path.basename(f) !== "stamp.mjs" && path.basename(f) !== "serve.mjs");

// Version = short hash of every asset's CURRENT (unstamped) content.
const hash = crypto.createHash("sha1");
for (const f of assetFiles.sort()) {
  hash.update(stripStamps(fs.readFileSync(f, "utf8")));
}
const VERSION = hash.digest("hex").slice(0, 10);

function stripStamps(code) {
  // Remove any existing ?v=... on local module/asset refs so hashing and
  // re-stamping are stable no matter how many times this runs.
  return code
    .replace(/(["'])(\.\.?\/[^"'?]+?\.m?js)\?v=[^"']*\1/g, "$1$2$1")
    .replace(/((?:href|src)=")(\.\.?\/[^"?]+?\.(?:css|js|mjs))\?v=[^"]*(")/g, "$1$2$3");
}

function stampModule(code) {
  return code.replace(
    /(["'])(\.\.?\/[^"'?]+?\.m?js)\1/g,
    (_m, q, spec) => `${q}${spec}?v=${VERSION}${q}`
  );
}

function stampHtml(html) {
  return html.replace(
    /((?:href|src)=")(\.\.?\/[^"?]+?\.(?:css|js|mjs))(")/g,
    (_m, pre, url, post) => `${pre}${url}?v=${VERSION}${post}`
  );
}

let changed = 0;
for (const f of walk(ROOT)) {
  const ext = path.extname(f).toLowerCase();
  if (![".html", ".js", ".mjs"].includes(ext)) continue;
  if (["stamp.mjs", "serve.mjs"].includes(path.basename(f))) continue;
  const before = fs.readFileSync(f, "utf8");
  const clean = stripStamps(before);
  const after = ext === ".html" ? stampHtml(clean) : stampModule(clean);
  if (after !== before) {
    fs.writeFileSync(f, after);
    changed++;
  }
}

console.log(`stamped ${changed} file(s) with build ${VERSION}`);
