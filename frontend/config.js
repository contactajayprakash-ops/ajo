// Backend endpoints. Defaults assume the mock server on localhost.
//
// To point a deployed copy at a real Sub0 app, drop this into index.html
// before the module script — no rebuild needed, the files are static:
//
//   <script>
//     window.__AJO_CONFIG__ = {
//       API_BASE: "https://your-app.sub0.dev",
//       WS_URL:   "wss://your-app.sub0.dev/ws"
//     };
//   </script>

const overrides = (typeof window !== "undefined" && window.__AJO_CONFIG__) || {};

export const API_BASE = overrides.API_BASE || "http://localhost:8787";
export const WS_URL = overrides.WS_URL || "ws://localhost:8787/ws";
