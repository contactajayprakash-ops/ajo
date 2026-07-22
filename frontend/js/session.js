const KEY = "ajo.session";

// A per-tab session (sessionStorage) takes priority over the shared one
// (localStorage). localStorage is shared across every tab on the origin, so
// without this a "test member" window would sign the admin out everywhere.
// sessionStorage is scoped to a single tab, which is exactly what a demo
// member needs — its own identity that doesn't touch the real session.
// Storage access can throw outright (Safari private mode, disabled cookies) or
// simply not exist, so every touch goes through these guards — a blocked store
// should degrade to "no session", never crash the app on boot.
function store(perTab) {
  try {
    return perTab ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getSession() {
  return readFrom(store(true)) || readFrom(store(false));
}

function readFrom(s) {
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user, opts = {}) {
  const s = store(!!opts.perTab);
  try { s && s.setItem(KEY, JSON.stringify({ token, user })); } catch { /* storage full/blocked */ }
}

export function clearSession() {
  // Sign out of whichever store THIS tab is using, so a demo tab signing out
  // doesn't drop the admin's real session on their other tabs.
  const per = store(true);
  try {
    if (per && per.getItem(KEY)) { per.removeItem(KEY); return; }
  } catch { /* sessionStorage unavailable */ }
  const local = store(false);
  try { local && local.removeItem(KEY); } catch { /* localStorage unavailable */ }
}
