# Deploying Ajo

Two things go live: the **Sub0 backend** (built in the Sub0 dashboard) and the **frontend** (a static app on LingoQL). Do the backend first, because the frontend needs its URL.

Rough time: 20–30 minutes, most of it pasting the backend specs.

## 0. Accounts

- Register for the hackathon on Devpost, follow the email link to sign up on LingoQL, and grab the $20 credit.
- Sign in to Sub0 at https://sub0.app (same account where possible).
- Have a GitHub account ready for the frontend repo.

## 1. Sub0 backend

In the Sub0 dashboard:

1. Create a new project and attach a **PostgreSQL** database (LingoQL can provision one).
2. **Models** — add each file from `backend-sub0/models/` (six of them). Paste the JSON for each. Sub0 builds the tables (`_user` → `users`, and so on).
3. **Endpoints** — add each file from `backend-sub0/abi/` (fourteen). One resource per file, paste the JSON.
4. **Environment variables** (from `backend-sub0/env.example`):
   - `JWT_SECRET_KEY` — a long random string
   - `PASSWORD_SALT` — another random string
   - `ALLOW_WEBSOCKET_CONNECTIONS` = `true`  ← the live pot won't work without this
   - `FORCE_WEBSOCKET_WITH_UID` = `false`
5. Deploy. Note two URLs: the app's base URL (e.g. `https://ajo-xxxx.sub0.app`) and its websocket URL (same host, `wss://…/ws`).

Quick check: `curl -X POST https://YOUR_SUB0/sign-up -H "Content-Type: application/json" -d '{"name":"Test","email":"t@t.co","password":"password123"}'` should return a token.

## 2. Frontend on LingoQL

The frontend is just static files served by a tiny Node script (`serve.mjs`), which reads `HOST`/`PORT` the way LingoQL expects.

1. Point the app at your backend. Open `frontend/index.html` and add this inside `<head>`, before the module script:

   ```html
   <script>
     window.__AJO_CONFIG__ = {
       API_BASE: "https://YOUR_SUB0_HOST",
       WS_URL:   "wss://YOUR_SUB0_HOST/ws"
     };
   </script>
   ```

2. Put the project on GitHub:

   ```bash
   # from the extracted project folder
   git remote add origin https://github.com/YOU/ajo.git
   git push -u origin main
   ```

3. In LingoQL, create a new app from that GitHub repo. Set the **root/working directory to `frontend`** so it deploys just the static app. LingoQL detects Node (via `frontend/package.json`) and runs `npm start`, which is `node serve.mjs`. No build step.
4. Deploy. Open the URL — you should get the Ajo landing page.

## 3. Check it end to end

Open the live URL in two browser windows. Make two accounts, create a circle in one, join with the code in the other, start it, and contribute from both. The pot should move on both screens at once. Release the pot as the admin and watch the rotation advance.

If the pot doesn't update live: it's almost always `ALLOW_WEBSOCKET_CONNECTIONS` not set to `true`, or the `WS_URL` in the config using `ws://` instead of `wss://` on an https page.

## Notes

- The `mock-server/` is not deployed. It's only for running the UI locally.
- Redeploys on LingoQL are blue-green, so pushing an updated config won't drop anyone mid-session.
- Custom domain later: point DNS at LingoQL and it handles HTTPS.
