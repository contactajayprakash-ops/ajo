// Small HS256 JWT + password hashing on top of node:crypto, so the dev server
// has no install step. The production backend (Sub0) does JWT + bcrypt for real;
// this is just enough to be faithful to the token contract locally.
import crypto from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signJwt(claims, secret, ttlSeconds = 7 * 24 * 3600) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds }));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  const [header, body, sig] = String(token).split(".");
  if (!header || !body || !sig) throw new Error("malformed token");
  const expected = b64url(crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest());
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("bad signature");
  const payload = JSON.parse(fromB64url(body).toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return payload;
}

// scrypt stand-in for bcrypt. stored as salt:hash.
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(plain, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(plain, salt, 32).toString("hex");
  const a = Buffer.from(test);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
