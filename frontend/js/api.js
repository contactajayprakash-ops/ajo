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
function friendlyError(resource, status, raw) {
  const msg = (raw || "").trim();
  // 401 = who are you (bad login / dead token); 403 = you can't do that.
  // Only the first should ever read as a session problem.
  if (status === 401) {
    return resource === "sign-in"
      ? "Wrong email or password."
      : "Your session has expired — sign out and back in.";
  }
  if (status >= 500) {
    return "The server hit a problem. Give it a second and try again.";
  }
  const looksTechnical =
    !msg || msg.length > 140 || /exception|traceback|sql|syntax|undefined|null value|constraint/i.test(msg);
  if (!looksTechnical) return msg;
  const fallback = {
    "sign-in": "Wrong email or password.",
    "sign-up": "Couldn't create the account — that email may already be registered.",
    "join-circle": "That invite code didn't match any circle. Check it and try again.",
    "contribute": "That payment didn't go through — you may have already paid this cycle.",
    "activate-circle": "Couldn't start the circle. Only the admin can start it, and it needs at least 2 members.",
    "trigger-payout": "Couldn't release the pot. Only the admin can do this, once everyone has paid in.",
  }[resource];
  return fallback || `That didn't work (error ${status}). Try again.`;
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
