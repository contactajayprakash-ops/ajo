// End-to-end check of the dev server: two users, a circle, live contributions
// over the websocket, and a payout. Run the server first, then: node smoke-test.mjs
const BASE = process.env.BASE || "http://localhost:8787";
const WS = BASE.replace("http", "ws") + "/ws";

const call = async (resource, body, token) => {
  const res = await fetch(`${BASE}/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-access-token": token } : {}) },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${resource} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
};

const assert = (cond, msg) => {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("  ok -", msg);
};

const events = [];
async function run() {
  // two members
  const amara = await call("sign-up", { name: "Amara", email: `amara${Date.now()}@ajo.africa`, password: "password123" });
  const kwame = await call("sign-up", { name: "Kwame", email: `kwame${Date.now()}@ajo.africa`, password: "password123" });
  assert(amara.token && kwame.token, "both members get a token on sign-up");

  // listen on the socket as Kwame
  const socket = new WebSocket(`${WS}?uid=${amara.id}`);
  await new Promise((r) => (socket.onopen = r));
  socket.onmessage = (e) => events.push(JSON.parse(e.data));

  // Amara opens a 2-seat weekly circle
  const circle = await call("create-circle", { name: "Market Women Weekly", contribution_amount: 5000, currency: "NGN", seats: 2, frequency: "weekly" }, amara.token);
  assert(circle.invite_code, "circle gets an invite code");
  assert(circle.status === "forming", "new circle starts in 'forming'");

  // Kwame joins with the code
  await call("join-circle", { invite_code: circle.invite_code }, kwame.token);
  const members = await call("circle-members", { circle_id: circle.id }, amara.token);
  assert(members.length === 2, "two members after join");
  assert(members[0].payout_position === 1 && members[1].payout_position === 2, "payout positions assigned in order");

  // Amara (admin) starts the circle
  await call("activate-circle", { circle_id: circle.id }, amara.token);

  // both contribute -> pot should fill to 10000
  const c1 = await call("contribute", { circle_id: circle.id }, amara.token);
  assert(c1.pot_balance === 5000, "pot at 5000 after first contribution");
  const c2 = await call("contribute", { circle_id: circle.id }, kwame.token);
  assert(c2.pot_balance === 10000, "pot at 10000 after second contribution");

  // can't double-contribute in the same cycle
  let blocked = false;
  try { await call("contribute", { circle_id: circle.id }, amara.token); } catch { blocked = true; }
  assert(blocked, "double contribution in one cycle is rejected");

  // non-admin cannot release the pot
  let denied = false;
  try { await call("trigger-payout", { circle_id: circle.id }, kwame.token); } catch { denied = true; }
  assert(denied, "non-admin cannot trigger payout");

  // admin releases pot to position-1 member (Amara), cycle advances
  const payout = await call("trigger-payout", { circle_id: circle.id }, amara.token);
  assert(payout.amount === 10000 && payout.recipient_name === "Amara", "position 1 (Amara) collects the 10000 pot");
  assert(payout.current_cycle === 2 && payout.pot_balance === 0, "cycle advances and pot resets");

  // feed captured the story
  const feed = await call("circle-feed", { circle_id: circle.id }, amara.token);
  const types = feed.map((f) => f.type);
  assert(types.includes("payout") && types.includes("contribution"), "activity feed logged contributions + payout");

  // give sockets a beat, then check broadcasts landed
  await new Promise((r) => setTimeout(r, 150));
  const actions = events.map((e) => e.action);
  assert(actions.includes("contribution_made"), "websocket pushed contribution_made");
  assert(actions.includes("payout_made"), "websocket pushed payout_made");
  const lastContribution = events.filter((e) => e.action === "contribution_made").pop();
  assert(lastContribution.data.pot_balance === 10000, "broadcast carried the live pot balance");

  socket.close();
  console.log(`\nALL GOOD - ${events.length} live events received over the socket`);
  process.exit(0);
}

run().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
