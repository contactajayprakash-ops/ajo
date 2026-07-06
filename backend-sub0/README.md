# Ajo backend (Sub0)

This is the real backend. It's declarative — a set of data models and one ABI spec per endpoint. There's no server code to run; Sub0 executes these directly. The `mock-server/` at the repo root is only a local stand-in.

## What's here

```
models/   one file per table. Sub0 turns these into the database schema.
abi/      one file per endpoint (a Sub0 "resource"). This is the logic.
env.example   the secrets to set in the dashboard
schema.sql    plain-SQL mirror of the models, for reference / pgAdmin
```

Table names are the plural of each model file: `_user` → `users`, `_circle` → `circles`, `_membership` → `memberships`, `_contribution` → `contributions`, `_payout` → `payouts`, `_activity` → `activities`. The SQL in the ABI specs uses those names.

## Endpoints

| Resource            | Protected | What it does                                                        |
|---------------------|-----------|--------------------------------------------------------------------|
| `sign-up`           | no        | Create a user, hash the password, return a JWT                     |
| `sign-in`           | no        | Verify the password, return a JWT                                  |
| `profile`           | yes       | The current user                                                   |
| `create-circle`     | yes       | Make a circle + add the creator as admin (chained)                 |
| `join-circle`       | yes       | Join by invite code, get the next rotation position, broadcast     |
| `my-circles`        | yes       | Circles the caller belongs to                                      |
| `circle-details`    | yes       | One circle (members only)                                          |
| `circle-members`    | yes       | The rotation, with who's paid this cycle                           |
| `circle-feed`       | yes       | The activity timeline                                              |
| `activate-circle`   | yes       | Admin starts the circle (forming → active), broadcast              |
| `contribute`        | yes       | Insert → update pot → log → broadcast the new balance (chained)    |
| `trigger-payout`    | yes       | Release the pot to whoever's up, advance the cycle, broadcast      |
| `circle-state`      | yes       | Lightweight pot snapshot (also callable over the socket)           |
| `cron-contribution-reminder` | — | Daily: nudge circles whose pot is still filling                    |

Admin-only actions (`activate-circle`, `trigger-payout`) aren't gated by a role flag in code — the SQL itself matches `creator_id = $PROTECTED.id`, so a non-admin request finds no row and fails. Same idea for "members only" reads.

## Deploying

1. Open [Sub0](https://sub0.app) and create a project. Attach a PostgreSQL database (LingoQL can provision one).
2. Add the models: create each file from `models/` in the Sub0 editor (or paste them). Sub0 builds the tables.
3. Add the endpoints: create a resource for each file in `abi/` and paste its JSON.
4. Set the environment variables from `env.example` in the dashboard:
   - `JWT_SECRET_KEY` — long random string, signs the tokens
   - `PASSWORD_SALT` — extra salt for bcrypt
   - `ALLOW_WEBSOCKET_CONNECTIONS=true` — required, this is how the pot goes live
   - `FORCE_WEBSOCKET_WITH_UID=false` — we pass `?uid=` but don't require it
5. Deploy on LingoQL. Deploys are blue-green, so redeploys don't drop connections.
6. Note your app's base URL and websocket URL, then point the frontend at them via `window.__AJO_CONFIG__` (see `frontend/config.js`). No frontend rebuild needed.

## A note on the websocket broadcasts

The contribute/payout/join specs broadcast with `broadcast_type: "ALL"` — every connected client gets the message, and the frontend filters by `circle_id`. That's the simplest thing that's correct, and it's plenty for circles of a few to a few dozen people. If you scaled this to thousands of concurrent circles you'd switch to targeted `BULK` delivery to just the member uids; the frontend contract wouldn't change.
