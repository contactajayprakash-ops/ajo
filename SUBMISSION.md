# Devpost submission (paste-ready)

Fields below map to the Devpost form. Trim to taste.

## Tagline
The savings circle West Africa already runs on — ajo, esusu, susu — with one pot everyone watches fill in real time.

## What it does
Ajo is a rotating savings circle you can actually run online. A group each puts in a fixed amount every cycle; each cycle one member collects the whole pot, rotating by position until everyone has had a turn. You start a circle, share an invite code, and once it's active everyone pays in — and the shared pot updates live on every member's screen the instant anyone contributes. When the cycle's contributions are in, the admin releases the pot to whoever is next in the rotation, and the cycle advances. Every contribution and payout is written to a timestamped feed, so there's nothing to argue about and no one holding cash.

## Inspiration
Rotating savings circles are how an enormous number of people across West Africa save — no bank required. The mechanism is solid; what fails is the admin. Somebody has to hold the money, remember who paid, and settle whose turn it is, and that trust bottleneck keeps circles small and occasionally ends in someone disappearing with the pot. We wanted to keep the exact social thing people already understand and just remove the part where one person has to be the ledger.

## How we built it
The backend is entirely declarative on Sub0 — no server code. Data models and one ABI spec per endpoint cover auth (JWT + hashed passwords), the multi-step contribution flow, and the payout rotation. Sub0's action chaining lets a single `contribute` call insert the contribution, update the pot, write to the feed, and broadcast the new balance as one declared chain; the live pot is a `broadcast_websocket_message` on the end of that chain. Authorization is pushed into the SQL itself (`$PROTECTED.id`), and contribution amounts are read from the circle, never trusted from the client. A daily cron nudges circles that are still collecting.

The frontend is deliberately dependency-free: hand-written CSS and native ES modules, no framework and no build step, talking to Sub0 over HTTP for reads/writes and a single WebSocket for live updates. Both the Sub0 app and the static frontend deploy on LingoQL over Postgres.

## Challenges we ran into
Getting the live updates to feel right took the most care. Broadcasts go to every connected client, so the frontend filters by circle and reconciles two sources of truth — the contributor gets an HTTP response while everyone else hears it over the socket — without double-counting the pot. The rotation and payout also had to be exactly-once and admin-only; we handled both in the query layer rather than sprinkling checks around.

## Accomplishments we're proud of
A genuinely real-time collaborative product with no backend server code and no frontend build — the whole thing is declarative specs plus static files. It maps one-to-one onto something millions of people already do offline, which makes it easy to explain in one sentence and easy to actually use.

## What we learned
How far a declarative backend can go. Auth, chained writes, websockets, cron — things that would normally be a service with routes and controllers — are just JSON here, and the deploy story really is push-and-done.

## What's next
Contribution reminders over SMS/WhatsApp, a reliability score that reflects payment history, optional escrow so payouts settle to a wallet, and targeted websocket delivery per circle for scale.

## Built with
Sub0, LingoQL, PostgreSQL, WebSockets, JWT, vanilla JavaScript (ES modules), hand-written CSS, Node (dev server only).
