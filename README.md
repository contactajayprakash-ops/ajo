# Ajo

Save together, collect in turns. Ajo is a digital version of the rotating savings circle that most of West Africa already runs on — the thing people call *ajo* or *esusu* in Nigeria, *susu* in Ghana, a *tontine* further west.

The idea is old and it works: a small group of people who trust each other each put in a fixed amount every week (or day, or month). Each cycle, one person takes the whole pot. Next cycle it's the next person, and so on until everyone has had their turn. No bank, no interest, no paperwork.

What breaks in practice is the admin. Someone has to hold the cash, remember who paid, settle arguments about whose turn it is, and not disappear with the money. That trust bottleneck is the whole reason a lot of circles stay small or fall apart.

Ajo moves the ledger onto a shared screen. The pot updates live for everyone the moment someone pays in, the rotation order is fixed and visible, and every contribution and payout is written to a feed with a timestamp. Nobody has to hold cash or take anyone's word for it.

## How it works

- Someone starts a circle: a name, the contribution amount, how often, and how many seats.
- They share the invite code. People join and get a position in the rotation.
- The admin starts the circle. Now it's collecting.
- Each cycle, everyone pays in their fixed amount. **The pot fills live on every member's screen.**
- Once everyone's in, the admin releases the pot to whoever is up next in the rotation. Cycle advances.
- Repeat until everyone has collected once. The circle completes.

The live part is the point. Open the same circle in two windows and watch the pot jump on one screen when you pay in on the other — no refresh.

## Built on LingoQL and Sub0

This was built for the Zero to Query hackathon, so the backend is [Sub0](https://sub0.app) and it deploys on [LingoQL](https://lingoql.com).

**Sub0** runs the entire backend with no server code. Every bit of logic — signup with hashed passwords and JWTs, the multi-step contribution flow, the payout rotation, the live broadcasts — is a declarative ABI spec (`backend-sub0/abi/*.json`) over a set of data models (`backend-sub0/models/*.json`). A few things it leans on hard:

- **Auth** via `tokenize` / `protected` — JWTs issued on signup/signin, every state change sits behind a verified token, and the user id is read from the token (`$PROTECTED.id`), never trusted from the request body.
- **Action chaining** (`depends_on`) — a single `contribute` call inserts the contribution, updates the pot, writes the activity, and broadcasts the new balance, all as one declared chain. No controllers.
- **WebSockets** — the pot going up on everyone's screen is `broadcast_websocket_message` firing off the last action in that chain.
- **Cron** — a daily job nudges circles whose pot is still filling.

**LingoQL** hosts both pieces: the Sub0 app and the static frontend, with Postgres underneath. Push to deploy, blue-green, no infra to manage — which is the whole thesis of the hackathon.

The frontend is deliberately dependency-free: hand-written CSS and ES modules, no framework and no build step. It's just static files, so LingoQL serves it directly and there's nothing to break in a pipeline.

## Running it locally

You need Node 18+ and nothing else — no `npm install` anywhere.

```bash
# 1. backend stand-in (mirrors the Sub0 contract, plain Node)
cd mock-server
node server.js            # http + ws on :8787

# 2. frontend, in another terminal
cd frontend
node serve.mjs            # on :5173
```

Open http://localhost:5173 in two browser windows, make two accounts, create a circle in one and join it with the code in the other. Start it, pay in from both, and watch the pot move.

The `mock-server` is not the real backend — it's a small Node reimplementation of the same routes and websocket messages so you can run the UI without deploying. The real backend is the Sub0 specs under `backend-sub0/`. See `backend-sub0/README.md` for deploying that, and `ARCHITECTURE.md` for how the pieces fit.

## Layout

```
backend-sub0/     the actual backend — Sub0 models + ABI endpoint specs
  models/         data models (users, circles, memberships, contributions, payouts, activities)
  abi/            one JSON spec per endpoint
  schema.sql      reference SQL for the tables Sub0 generates
mock-server/      dependency-free Node stand-in for local dev
frontend/         static app: index.html + hand-written CSS + ES modules
ARCHITECTURE.md   how a contribution flows from tap to everyone's screen
DEMO.md           the 3-minute walkthrough for the submission video
```
