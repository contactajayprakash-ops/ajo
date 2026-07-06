// Ajo dev server.
//
// This is NOT the production backend - that's the declarative Sub0 app under
// ../backend-sub0. This reimplements the same resource routes and websocket
// messages in plain Node (no deps) so the frontend runs locally and can be
// demoed without a deploy. Keep response shapes here in sync with the ABI specs.
import http from "node:http";
import crypto from "node:crypto";
import { createWsHub } from "./lib/websocket.js";
import { signJwt, verifyJwt, hashPassword, checkPassword } from "./lib/token.js";

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET_KEY || "dev-secret-not-for-prod";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// human-friendly invite codes, no easily-confused characters
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const inviteCode = () =>
  Array.from({ length: 7 }, () => INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)]).join("");

// in-memory tables, reset on restart. good enough for a dev server.
const db = { users: [], circles: [], memberships: [], contributions: [], payouts: [], activities: [] };

const routes = {};
const on = (resource, handler, opts = {}) => {
  handler.opts = opts;
  routes[resource] = handler;
};

// error we can throw from any handler to bail with a status code
class Fail extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Fail(status, message);
};

// ---- accounts -----------------------------------------------------------

on("sign-up", (body) => {
  const { name, email, password } = body;
  if (!name || name.length < 2) fail(400, "name too short");
  if (!email || !email.includes("@")) fail(400, "enter a valid email");
  if (!password || password.length < 8) fail(400, "password needs 8+ characters");
  if (db.users.some((u) => u.email === email)) fail(400, "that email is already registered");

  const user = {
    id: id(),
    name,
    email,
    phone: null,
    password: hashPassword(password),
    reliability_score: 100,
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
  };
  db.users.push(user);
  return { id: user.id, name: user.name, email: user.email, token: token(user) };
});

on("sign-in", (body) => {
  const user = db.users.find((u) => u.email === body.email && !u.deleted_at);
  if (!user || !checkPassword(body.password || "", user.password)) fail(401, "wrong email or password");
  return { id: user.id, name: user.name, email: user.email, token: token(user) };
});

on("profile", (body, claims) => {
  const user = db.users.find((u) => u.id === claims.id);
  if (!user) fail(404, "not found");
  const { id: uid, name, email, phone, reliability_score, created_at } = user;
  return { id: uid, name, email, phone, reliability_score, created_at };
}, { protected: true });

// ---- circles ------------------------------------------------------------

on("create-circle", (body, claims) => {
  const { name, description = "", contribution_amount, currency = "NGN", frequency = "weekly", seats } = body;
  if (!name || name.length < 2) fail(400, "give the circle a name");
  if (!contribution_amount || contribution_amount <= 0) fail(400, "set a contribution amount");
  if (!seats || seats < 2) fail(400, "a circle needs at least 2 seats");

  const circle = {
    id: id(),
    name,
    description,
    creator_id: claims.id,
    contribution_amount: Number(contribution_amount),
    currency,
    frequency,
    seats: Number(seats),
    current_cycle: 1,
    pot_balance: 0,
    status: "forming",
    invite_code: inviteCode(),
    created_at: now(),
    updated_at: now(),
    deleted_at: null,
  };
  db.circles.push(circle);
  db.memberships.push(membership(circle.id, claims.id, 1, "admin"));
  logActivity(circle.id, claims.id, claims.name, "circle_created", "started the circle");
  return publicCircle(circle);
}, { protected: true });

on("join-circle", (body, claims) => {
  const circle = db.circles.find((c) => c.invite_code === body.invite_code && !c.deleted_at);
  if (!circle) fail(404, "no circle with that invite code");
  if (db.memberships.some((m) => m.circle_id === circle.id && m.user_id === claims.id))
    fail(400, "you're already in this circle");
  const taken = db.memberships.filter((m) => m.circle_id === circle.id).length;
  if (taken >= circle.seats) fail(400, "this circle is already full");

  db.memberships.push(membership(circle.id, claims.id, taken + 1, "member"));
  logActivity(circle.id, claims.id, claims.name, "member_joined", "joined the circle");
  hub.broadcast("member_joined", { circle_id: circle.id, name: circle.name, pot_balance: circle.pot_balance });
  return {
    id: circle.id,
    name: circle.name,
    contribution_amount: circle.contribution_amount,
    currency: circle.currency,
    seats: circle.seats,
    status: circle.status,
  };
}, { protected: true });

on("my-circles", (body, claims) => {
  return db.memberships
    .filter((m) => m.user_id === claims.id)
    .map((m) => {
      const c = db.circles.find((x) => x.id === m.circle_id && !x.deleted_at);
      return c ? { ...publicCircle(c), payout_position: m.payout_position, has_been_paid: m.has_been_paid, role: m.role } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}, { protected: true });

on("circle-details", (body, claims) => {
  const member = db.memberships.find((m) => m.circle_id === body.circle_id && m.user_id === claims.id);
  if (!member) fail(403, "you're not in this circle");
  const c = db.circles.find((x) => x.id === body.circle_id && !x.deleted_at);
  if (!c) fail(404, "not found");
  return { ...publicCircle(c), creator_id: c.creator_id };
}, { protected: true });

on("circle-members", (body) => {
  const c = db.circles.find((x) => x.id === body.circle_id);
  if (!c) fail(404, "not found");
  return db.memberships
    .filter((m) => m.circle_id === body.circle_id)
    .sort((a, b) => a.payout_position - b.payout_position)
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        user_id: m.user_id,
        name: u ? u.name : "member",
        reliability_score: u ? u.reliability_score : 100,
        payout_position: m.payout_position,
        has_been_paid: m.has_been_paid,
        role: m.role,
        paid_this_cycle: db.contributions.some(
          (ct) => ct.circle_id === body.circle_id && ct.user_id === m.user_id && ct.cycle === c.current_cycle
        ),
      };
    });
}, { protected: true });

on("circle-feed", (body) => {
  return db.activities
    .filter((a) => a.circle_id === body.circle_id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 40);
}, { protected: true });

on("activate-circle", (body, claims) => {
  const c = db.circles.find((x) => x.id === body.circle_id);
  if (!c || c.creator_id !== claims.id) fail(403, "only the admin can start the circle");
  if (c.status !== "forming") fail(400, "circle already started");
  c.status = "active";
  c.updated_at = now();
  logActivity(c.id, claims.id, claims.name, "circle_activated", "started the first cycle");
  hub.broadcast("circle_activated", { circle_id: c.id, name: c.name, status: c.status });
  return { circle_id: c.id, name: c.name, status: c.status, current_cycle: c.current_cycle, pot_balance: c.pot_balance, seats: c.seats };
}, { protected: true });

// the headline flow: a contribution updates the shared pot and pushes the new
// balance to everyone watching in real time.
on("contribute", (body, claims) => {
  const c = db.circles.find((x) => x.id === body.circle_id && x.status === "active" && !x.deleted_at);
  if (!c) fail(400, "this circle isn't collecting right now");
  if (!db.memberships.some((m) => m.circle_id === c.id && m.user_id === claims.id)) fail(403, "you're not in this circle");
  if (db.contributions.some((ct) => ct.circle_id === c.id && ct.user_id === claims.id && ct.cycle === c.current_cycle))
    fail(400, "you've already contributed this cycle");

  // amount is read from the circle, never trusted from the client
  const amount = c.contribution_amount;
  db.contributions.push({ id: id(), circle_id: c.id, user_id: claims.id, cycle: c.current_cycle, amount, created_at: now() });
  c.pot_balance += amount;
  c.updated_at = now();
  logActivity(c.id, claims.id, claims.name, "contribution", "dropped their contribution", amount);

  const data = { circle_id: c.id, name: c.name, pot_balance: c.pot_balance, current_cycle: c.current_cycle, seats: c.seats, actor_name: claims.name, amount };
  hub.broadcast("contribution_made", data);
  return data;
}, { protected: true });

on("trigger-payout", (body, claims) => {
  const c = db.circles.find((x) => x.id === body.circle_id && x.status === "active");
  if (!c || c.creator_id !== claims.id) fail(403, "only the admin can release the pot");
  const recipientMembership = db.memberships.find((m) => m.circle_id === c.id && m.payout_position === c.current_cycle);
  if (!recipientMembership) fail(400, "no recipient set for this cycle");
  const recipient = db.users.find((u) => u.id === recipientMembership.user_id);
  const amount = c.pot_balance;

  db.payouts.push({ id: id(), circle_id: c.id, user_id: recipient.id, cycle: c.current_cycle, amount, created_at: now() });
  recipientMembership.has_been_paid = true;
  logActivity(c.id, recipient.id, recipient.name, "payout", "collected the full pot", amount);

  const wasLast = c.current_cycle >= c.seats;
  c.pot_balance = 0;
  c.current_cycle += 1;
  c.status = wasLast ? "completed" : "active";
  c.updated_at = now();

  const data = { circle_id: c.id, name: c.name, pot_balance: 0, current_cycle: c.current_cycle, status: c.status, seats: c.seats, recipient_name: recipient.name, amount };
  hub.broadcast("payout_made", data);
  return data;
}, { protected: true });

on("circle-state", (body) => {
  const c = db.circles.find((x) => x.id === body.circle_id && !x.deleted_at);
  if (!c) fail(404, "not found");
  return { circle_id: c.id, name: c.name, pot_balance: c.pot_balance, current_cycle: c.current_cycle, status: c.status, seats: c.seats };
}, { protected: true });

// ---- helpers ------------------------------------------------------------

function token(user) {
  return signJwt({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
}

function membership(circle_id, user_id, payout_position, role) {
  return { id: id(), circle_id, user_id, payout_position, has_been_paid: false, role, created_at: now(), updated_at: now() };
}

function publicCircle(c) {
  const { id: cid, name, description, contribution_amount, currency, frequency, seats, pot_balance, current_cycle, status, invite_code, updated_at } = c;
  return { id: cid, name, description, contribution_amount, currency, frequency, seats, pot_balance, current_cycle, status, invite_code, updated_at };
}

function logActivity(circle_id, user_id, actor_name, type, message, amount = null) {
  db.activities.push({ id: id(), circle_id, user_id, actor_name, type, message, amount, created_at: now() });
}

// ---- http plumbing ------------------------------------------------------

function send(res, status, payload) {
  const bytes = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-access-token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(bytes);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const resource = req.url.replace(/^\//, "").split("?")[0];

  if (req.method === "GET" && resource === "health") {
    return send(res, 200, { ok: true, users: db.users.length, circles: db.circles.length, sockets: hub.size });
  }

  const handler = routes[resource];
  if (req.method !== "POST" || !handler) return send(res, 404, { error: "unknown resource" });

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "invalid json" });
      }
    }
    try {
      let claims = null;
      if (handler.opts?.protected) {
        const t = req.headers["x-access-token"];
        if (!t) return send(res, 401, { error: "sign in to continue" });
        claims = verifyJwt(t, JWT_SECRET);
      }
      const result = handler(body, claims);
      send(res, 200, result);
    } catch (err) {
      if (err instanceof Fail) return send(res, err.status, { error: err.message });
      send(res, 401, { error: "session expired, sign in again" });
    }
  });
});

const hub = createWsHub(server, { path: "/ws" });

server.listen(PORT, () => {
  console.log(`ajo devserver -> http://localhost:${PORT}  (websocket on /ws)`);
});
