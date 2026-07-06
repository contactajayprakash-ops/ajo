# Ajo frontend

Digital ajo/esusu/susu: a rotating savings circle with a pot that updates live
on every member's screen. Plain HTML, CSS and ES modules — no build step, no
dependencies. Serve the folder and it runs.

## Run it locally

Start the mock backend first (from `../mock-server`), then serve this folder:

    node serve.mjs

Open http://localhost:5173. To try the live pot, open a second tab in a
private window, sign up a second user, join the circle with the invite code,
and contribute — the first tab's pot moves without a reload.

`serve.mjs` is only for preview; any static file server works, including
whatever LingoQL uses.

## Pointing at a real backend

The app reads `window.__AJO_CONFIG__` before falling back to localhost. Add
this to `index.html` (before the module script) with your deployed Sub0 URLs:

    <script>
      window.__AJO_CONFIG__ = {
        API_BASE: "https://your-app.sub0.dev",
        WS_URL: "wss://your-app.sub0.dev/ws"
      };
    </script>

No rebuild needed since nothing is compiled.
