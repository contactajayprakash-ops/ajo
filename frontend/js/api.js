import { API_BASE, WS_URL } from "../config.js";
import { getSession } from "./session.js";

// Every endpoint is POST + JSON, so one wrapper covers the lot.
export async function call(resource, body = {}) {
  const headers = { "Content-Type": "application/json" };
  const session = getSession();
  if (session) headers["x-access-token"] = session.token;

  let res;
  try {
    res = await fetch(`${API_BASE}/${resource}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Is it running?");
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
    throw new Error((json && (json.message || json.error)) || `Request failed (${res.status})`);
  }
  return json && Object.prototype.hasOwnProperty.call(json, "data") ? json.data : json;
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
