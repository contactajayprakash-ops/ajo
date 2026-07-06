const KEY = "ajo.session";

export function getSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.token && s.user ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
