import { connectSocket } from "./api.js";
import { getSession, clearSession } from "./session.js";
import { startRouter, navigate } from "./router.js";
import { renderAuth } from "./views/auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderCircle } from "./views/circle.js";

const root = document.getElementById("app");

// One socket for the whole session; views subscribe through this bus
// and filter events down to whatever circle they're showing.
const listeners = new Set();
const bus = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(action, data) {
    for (const fn of [...listeners]) fn(action, data);
  },
};

let socket = null;

function ensureSocket(uid) {
  if (socket && socket.uid === uid) return;
  if (socket) socket.conn.close();
  socket = { uid, conn: connectSocket(uid, bus.emit) };
}

function dropSocket() {
  if (socket) socket.conn.close();
  socket = null;
}

let view = null;

function mount(route) {
  if (view && view.destroy) view.destroy();
  view = null;
  root.replaceChildren();

  const session = getSession();
  if (!session) {
    dropSocket();
    view = renderAuth(root, {
      onLogin() {
        navigate("#/");
        mount({ name: "home" });
      },
    });
    return;
  }

  ensureSocket(session.user.id);

  const ctx = { session, bus, signOut };
  view = route.name === "circle"
    ? renderCircle(root, route.id, ctx)
    : renderDashboard(root, ctx);
}

function signOut() {
  clearSession();
  dropSocket();
  navigate("#/");
  mount({ name: "home" });
}

startRouter(mount);
