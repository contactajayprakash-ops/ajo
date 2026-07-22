import { API_BASE, WS_URL } from "../config.js";
import { getSession } from "./session.js";

// Every endpoint is POST + JSON, so one wrapper covers the lot.
export async function call(resource, body = {}) {
  const headers = { "Content-Type": "application/json" };
  const session = getSession();
  if (session) headers["x-access-token"] = session.token;

  // A hung request is indistinguishable from a broken one to the person
  // staring at a spinner — cap it and say something useful.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(`${API_BASE}/${resource}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new Error("Can't reach the server — check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // some errors come back without a body; fall through
  }
  // Sub0 wraps everything as { success, message, data }. Treat success:false
  // as an error even on a 200, and hand callers the inner data directly.
  if (!res.ok || (json && json.success === false)) {
    throw new Error(friendlyError(resource, res.status, json && (json.message || json.error)));
  }
  return json && Object.prototype.hasOwnProperty.call(json, "data") ? json.data : json;
}

// Raw backend messages can be blank, or read like a stack trace. Whoever is
// on the other side of the screen deserves a sentence, so translate the
// common failures and only pass raw text through when it's actually humane.
//
// Important: Sub0 surfaces expected business-rule failures as HTTP 500 with a
// strict-query message ("Operation Failed: this action must return a value!")
// when a guarded query matches no row, and as a constraint error on a
// duplicate. Those are NOT outages — they mean "wrong password", "already a
// member", "already paid". So endpoint meaning has to be resolved BEFORE the
// generic 5xx bucket, or every one of them reads as "the server hit a problem".
function friendlyError(resource, status, raw) {
  const msg = (raw || "").trim();

  const noRow = /operation failed|must return a value|not found|no (?:such )?(?:row|record|circle|user)/i.test(msg);
  const duplicate = /duplicate|already|unique|conflict/i.test(msg);

  // Per-endpoint human message for a matched-no-row / already-exists failure.
  const businessMessage = {
    "sign-in": "Wrong email or password.",
    "sign-up": "That email is already registered. Try signing in instead.",
    "join-circle": duplicate
      ? "You're already a member of this circle."
      : "That invite code didn't match any circle — it may be wrong, expired, or the circle already started.",
    "contribute": "That payment didn't go through — you may have already paid this cycle.",
    "activate-circle": "Couldn't start the circle. Only the admin can start it, and it needs at least 2 members.",
    "trigger-payout": "Couldn't release the pot. Only the admin can do this, once everyone has paid in.",
  }[resource];

  // A no-row / duplicate signal on a known endpoint is a business rule, not a
  // crash — answer with the human message regardless of the HTTP status.
  if ((noRow || duplicate) && businessMessage) return businessMessage;

  // 401 = who are you (bad login / dead token); 403 = you can't do that.
  if (status === 401) {
    return resource === "sign-in"
      ? "Wrong email or password."
      : "Your session has expired — sign out and back in.";
  }

  // A genuinely technical or empty message: prefer the endpoint's message if we
  // have one, otherwise fall back to the generic server note for a real 5xx.
  const looksTechnical =
    !msg || msg.length > 140 ||
    /exception|traceback|sql|syntax|undefined|null value|constraint|operation failed|must return a value/i.test(msg);
  if (looksTechnical) {
    // A totally empty 5xx is more likely a real outage than a business rule —
    // don't guess an endpoint reason when the server told us nothing.
    if (!msg && status >= 500) return "The server hit a problem. Give it a second and try again.";
    if (businessMessage) return businessMessage;
    if (status >= 500) return "The server hit a problem. Give it a second and try again.";
    return `That didn't work (error ${status}). Try again.`;
  }
  // Message is already human — show it as-is.
  return msg;
}

// Sub0 returns a bare object for a single-row result and an array for many.
// List endpoints use this so callers always get an array.
export async function callList(resource, body = {}) {
  const out = await call(resource, body);
  if (Array.isArray(out)) return out;
  return out ? [out] : [];
}

// Opens the socket and keeps it open. Reconnects with backoff, capped at 15s.
// Returns { close } — call it when the user signs out.
export function connectSocket(uid, onEvent) {
  let ws = null;
  let attempts = 0;
  let stopped = false;
  let retryTimer = null;

  function open() {
    ws = new WebSocket(`${WS_URL}?uid=${encodeURIComponent(uid)}`);

    ws.onopen = () => {
      attempts = 0;
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg && msg.action) onEvent(msg.action, msg.data || {});
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* already closing */ }
    };

    ws.onclose = () => {
      if (stopped) return;
      const wait = Math.min(15000, 500 * 2 ** attempts);
      attempts += 1;
      retryTimer = setTimeout(open, wait);
    };
  }

  open();

  return {
    close() {
      stopped = true;
      clearTimeout(retryTimer);
      if (ws) {
        try { ws.close(); } catch { /* fine */ }
      }
    },
  };
}
