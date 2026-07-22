import { call, callList } from "../api.js";
import { el, money, timeAgo, countUp, pulse } from "../ui.js";

const FEED_LIMIT = 40;

export function renderCircle(root, circleId, ctx) {
  const { session, bus } = ctx;

  let circle = null;
  let members = [];
  let shownPot = 0;
  let destroyed = false;
  let membersToken = 0;
  let contributing = false;

  const fmt = (v) => money(Math.round(v), circle ? circle.currency : undefined);

  // --- skeleton while loading ---
  const page = el("div", { class: "page circle-page" });
  const backLink = el("a", { class: "back-link", href: "#/" }, "← Your circles");
  page.append(
    el("header", { class: "topbar" },
      backLink,
      el("a", { class: "wordmark wordmark-sm", href: "#/" }, "Ajo", el("span", { class: "wordmark-dot" }, "."))
    )
  );
  const body = el("div", { class: "circle-body" }, el("p", { class: "muted" }, "Loading circle…"));
  page.append(body);
  root.append(page);

  // --- refs filled in by buildLayout ---
  let potAmountEl, potSubEl, cycleDotsEl, statusPill, titleEl, descEl;
  let contributeBtn, contributeNote, adminHost, membersList, feedList;
  let inviteHost, celebrationHost, actionError;

  function buildLayout() {
    body.replaceChildren();

    statusPill = el("span", { class: "pill" });
    titleEl = el("h1", { class: "circle-title" });
    descEl = el("p", { class: "circle-desc" });
    inviteHost = el("div", { class: "invite-host" });

    potAmountEl = el("div", { class: "pot-amount", "aria-live": "polite" }, fmt(0));
    potSubEl = el("p", { class: "pot-sub" });
    cycleDotsEl = el("div", { class: "cycle-dots", role: "img" });
    celebrationHost = el("div", { class: "celebration-host" });

    contributeBtn = el("button", { class: "btn btn-gold btn-wide", onclick: contribute });
    contributeNote = el("p", { class: "pot-note" });
    adminHost = el("div", { class: "admin-host" });
    actionError = el("p", { class: "form-error", role: "alert" });

    membersList = el("ol", { class: "member-list" });
    feedList = el("ul", { class: "feed-list" });

    body.append(
      el("div", { class: "circle-head" },
        el("div", { class: "circle-head-text" },
          el("div", { class: "circle-title-row" }, titleEl, statusPill),
          descEl
        ),
        inviteHost
      ),
      el("section", { class: "pot-card" },
        celebrationHost,
        el("p", { class: "pot-label" }, "In the pot"),
        potAmountEl,
        potSubEl,
        cycleDotsEl,
        contributeBtn,
        contributeNote,
        adminHost,
        actionError
      ),
      el("div", { class: "circle-columns" },
        el("section", { class: "circle-col" },
          el("h2", { class: "col-title" }, "The rotation"),
          membersList
        ),
        el("section", { class: "circle-col" },
          el("h2", { class: "col-title" }, "Circle feed"),
          feedList
        )
      )
    );
  }

  // --- state application ---

  function me() {
    return members.find((m) => String(m.user_id) === String(session.user.id));
  }

  function upNext() {
    return members.find((m) => m.payout_position === circle.current_cycle);
  }

  function applyState(data, animatePot) {
    if (!circle) return;
    if (data.pot_balance !== undefined) circle.pot_balance = data.pot_balance;
    if (data.current_cycle !== undefined) circle.current_cycle = data.current_cycle;
    if (data.status !== undefined) circle.status = data.status;
    if (data.seats !== undefined) circle.seats = data.seats;
    renderState(animatePot);
  }

  function renderState(animatePot) {
    const target = Number(circle.pot_balance) || 0;
    if (target !== shownPot) {
      if (animatePot) {
        countUp(potAmountEl, shownPot, target, fmt);
        pulse(potAmountEl.closest(".pot-card"), target > shownPot ? "pot-grew" : "pot-drained");
      } else {
        potAmountEl.textContent = fmt(target);
      }
      shownPot = target;
    } else {
      potAmountEl.textContent = fmt(target);
    }

    titleEl.textContent = circle.name;
    descEl.textContent = circle.description || "";
    descEl.hidden = !circle.description;
    statusPill.textContent = circle.status;
    statusPill.className = `pill pill-${circle.status}`;

    renderCycleDots();
    renderPotSub();
    renderControls();
    renderInvite();
  }

  function renderCycleDots() {
    cycleDotsEl.replaceChildren();
    cycleDotsEl.setAttribute("aria-label", `Cycle ${circle.current_cycle} of ${circle.seats}`);
    if (circle.seats > 16) {
      cycleDotsEl.append(el("span", { class: "cycle-text" }, `Cycle ${circle.current_cycle} of ${circle.seats}`));
      return;
    }
    for (let i = 1; i <= circle.seats; i++) {
      let cls = "dot";
      if (circle.status === "completed" || i < circle.current_cycle) cls += " dot-done";
      else if (i === circle.current_cycle && circle.status === "active") cls += " dot-now";
      cycleDotsEl.append(el("span", { class: cls }));
    }
  }

  function renderPotSub() {
    if (circle.status === "completed") {
      potSubEl.textContent = "This circle has gone full round. Everyone collected.";
      return;
    }
    if (circle.status === "forming") {
      potSubEl.textContent = `${members.length} of ${circle.seats} seats filled · ${money(circle.contribution_amount, circle.currency)} ${circle.frequency}`;
      return;
    }
    const next = upNext();
    const who = next ? (String(next.user_id) === String(session.user.id) ? "you" : next.name) : "—";
    potSubEl.textContent = `Cycle ${circle.current_cycle} of ${circle.seats} · this pot goes to ${who}`;
  }

  function renderControls() {
    const my = me();

    if (circle.status === "completed") {
      contributeBtn.hidden = true;
      contributeNote.textContent = "Done and dusted. Start another round any time from your dashboard.";
    } else if (circle.status === "forming") {
      contributeBtn.hidden = false;
      contributeBtn.disabled = true;
      contributeBtn.textContent = "Waiting for the circle to start";
      contributeNote.textContent = "";
    } else if (my && my.paid_this_cycle) {
      contributeBtn.hidden = false;
      contributeBtn.disabled = true;
      contributeBtn.textContent = "Paid this cycle ✓";
      contributeNote.textContent = "You're settled. The pot releases once everyone's in.";
    } else {
      contributeBtn.hidden = false;
      contributeBtn.disabled = contributing;
      contributeBtn.textContent = contributing
        ? "Paying in…"
        : `Pay in ${money(circle.contribution_amount, circle.currency)}`;
      contributeNote.textContent = "";
    }

    // admin controls
    adminHost.replaceChildren();
    if (!my || my.role !== "admin") return;

    if (circle.status === "forming") {
      const full = members.length >= circle.seats;
      // A rotation needs at least two people — a circle of one is just a
      // savings account with extra steps, and payouts would loop on the admin.
      const enough = members.length >= 2;
      const startBtn = el("button", { class: "btn btn-primary", disabled: !enough, onclick: () => runAdmin(startBtn, "activate-circle", "Starting…") },
        "Start the circle");
      adminHost.append(
        el("div", { class: "admin-row" },
          startBtn,
          el("p", { class: "admin-hint" }, !enough
            ? "Waiting for at least one more member — share the invite code to get started."
            : full
              ? "All seats are filled. Starting locks the rotation."
              : `${circle.seats - members.length} seat${circle.seats - members.length === 1 ? "" : "s"} still open. You can start early if you want a smaller round.`)
        )
      );
    } else if (circle.status === "active") {
      const next = upNext();
      const releaseBtn = el("button", { class: "btn btn-quiet btn-release" }, `Release the pot to ${next ? next.name : "…"}`);
      let armed = false;
      let disarmTimer = null;
      releaseBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          releaseBtn.textContent = `Sure? Release ${fmt(circle.pot_balance)}`;
          releaseBtn.classList.add("is-armed");
          disarmTimer = setTimeout(() => {
            armed = false;
            releaseBtn.textContent = `Release the pot to ${next ? next.name : "…"}`;
            releaseBtn.classList.remove("is-armed");
          }, 4000);
          return;
        }
        clearTimeout(disarmTimer);
        runAdmin(releaseBtn, "trigger-payout", "Releasing…");
      });
      adminHost.append(el("div", { class: "admin-row" }, releaseBtn,
        el("p", { class: "admin-hint" }, "Admin only. Do this once the cycle's contributions are in.")));
    }
  }

  async function runAdmin(btn, endpoint, busyLabel) {
    actionError.textContent = "";
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = busyLabel;
    try {
      const res = await call(endpoint, { circle_id: circle.id });
      // The socket echoes this to everyone including us; applying here too keeps
      // the admin's screen honest even if the socket is mid-reconnect. An empty
      // response means the action matched no row (not admin / already done).
      if (!res || (res.pot_balance === undefined && res.current_cycle === undefined && res.status === undefined)) {
        throw new Error("Nothing to do — the pot may already be released, or you're not the admin.");
      }
      applyState(res, true);
      await loadMembers();
    } catch (err) {
      actionError.textContent = err.message;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function contribute() {
    if (contributing) return;
    contributing = true;
    actionError.textContent = "";
    contributeBtn.disabled = true;
    contributeBtn.textContent = "Paying in…";
    try {
      const res = await call("contribute", { circle_id: circle.id });
      // Empty response = the insert matched nothing, i.e. already paid this
      // cycle (the unique-per-cycle rule) or the circle isn't collecting.
      if (!res || (res.pot_balance === undefined && res.current_cycle === undefined && res.status === undefined)) {
        throw new Error("That payment didn't go through — you may have already paid this cycle.");
      }
      applyState(res, true);
      await loadMembers();
    } catch (err) {
      actionError.textContent = err.message;
    } finally {
      contributing = false;
      renderControls();
    }
  }

  function renderInvite() {
    inviteHost.replaceChildren();
    if (!circle.invite_code || circle.status === "completed") return;
    const codeEl = el("code", { class: "invite-code" }, circle.invite_code);
    const copyBtn = el("button", { class: "link-btn", onclick: copy }, "Copy");
    async function copy() {
      try {
        await navigator.clipboard.writeText(circle.invite_code);
        copyBtn.textContent = "Copied";
      } catch {
        // clipboard can be blocked on http; select the code instead
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        copyBtn.textContent = "Select + copy";
      }
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1800);
    }
    inviteHost.append(
      el("span", { class: "invite-label" }, "Invite code"),
      codeEl,
      copyBtn
    );
  }

  // --- members ---

  function renderMembers() {
    membersList.replaceChildren();
    for (const m of members) {
      const isMe = String(m.user_id) === String(session.user.id);
      const isNext = circle.status === "active" && m.payout_position === circle.current_cycle;
      let cls = "member";
      if (isNext) cls += " is-next";
      if (m.paid_this_cycle) cls += " has-paid";

      const badges = [];
      if (isNext) badges.push(el("span", { class: "badge badge-next" }, "collects next"));
      if (m.has_been_paid) badges.push(el("span", { class: "badge badge-collected" }, "collected"));
      if (circle.status === "active") {
        badges.push(el("span", { class: `paid-mark${m.paid_this_cycle ? " on" : ""}`, title: m.paid_this_cycle ? "Paid this cycle" : "Not yet paid this cycle" },
          m.paid_this_cycle ? "✓" : "·"));
      }

      membersList.append(el("li", { class: cls },
        el("span", { class: "member-pos" }, m.payout_position ?? "—"),
        el("span", { class: "member-name" }, m.name, isMe ? el("em", { class: "member-you" }, " (you)") : null),
        el("span", { class: "member-badges" }, badges)
      ));
    }
    const open = circle.seats - members.length;
    if (circle.status === "forming" && open > 0) {
      membersList.append(el("li", { class: "member member-open" },
        el("span", { class: "member-pos" }, "·"),
        el("span", { class: "member-name muted" }, `${open} open seat${open === 1 ? "" : "s"} — share the code`)
      ));
    }
  }

  async function loadMembers() {
    const token = ++membersToken;
    const list = await callList("circle-members", { circle_id: circle.id });
    if (destroyed || token !== membersToken) return;
    members = list;
    renderMembers();
    renderPotSub();
    renderControls();
  }

  // --- feed ---

  function feedItem(entry) {
    const li = el("li", { class: `feed-item feed-${entry.type}` },
      el("span", { class: "feed-msg" }, entry.message),
      el("span", { class: "feed-side" },
        entry.amount ? el("span", { class: "feed-amount" }, money(entry.amount, circle.currency)) : null,
        el("time", { class: "feed-time", dataset: { ts: entry.created_at } }, timeAgo(entry.created_at))
      )
    );
    return li;
  }

  function addLiveFeedItem(entry) {
    const li = feedItem(entry);
    li.classList.add("feed-new");
    feedList.prepend(li);
    while (feedList.children.length > FEED_LIMIT) feedList.lastChild.remove();
  }

  async function loadFeed() {
    const entries = await callList("circle-feed", { circle_id: circle.id });
    if (destroyed) return;
    feedList.replaceChildren();
    if (!entries.length) {
      feedList.append(el("li", { class: "feed-item muted" }, "Nothing yet. It all shows up here."));
      return;
    }
    entries.slice(0, FEED_LIMIT).forEach((entry) => feedList.append(feedItem(entry)));
  }

  const clockTimer = setInterval(() => {
    for (const t of feedList.querySelectorAll("time[data-ts]")) {
      t.textContent = timeAgo(t.dataset.ts);
    }
  }, 30000);

  // --- celebration on payout ---

  function celebrate(data) {
    const card = body.querySelector(".pot-card");
    if (card) pulse(card, "pot-payout", 2200);
    celebrationHost.replaceChildren(
      el("div", { class: "payout-banner" },
        el("strong", {}, money(data.amount, circle.currency)),
        ` released to ${data.recipient_name}`
      )
    );
    setTimeout(() => celebrationHost.replaceChildren(), 5000);
  }

  // --- websocket events (already connected app-wide; filter to this circle) ---

  const unsub = bus.on((action, data) => {
    if (!data || String(data.circle_id) !== String(circleId)) return;
    switch (action) {
      case "contribution_made":
        applyState(data, true);
        addLiveFeedItem({
          type: "contribution",
          message: `${data.actor_name} paid in`,
          amount: data.amount,
          created_at: new Date().toISOString(),
        });
        loadMembers().catch(() => {});
        break;
      case "payout_made":
        celebrate(data);
        applyState(data, true);
        addLiveFeedItem({
          type: "payout",
          message: `${data.recipient_name} collected the pot`,
          amount: data.amount,
          created_at: new Date().toISOString(),
        });
        loadMembers().catch(() => {});
        break;
      case "member_joined":
        applyState(data, false);
        loadMembers().catch(() => {});
        loadFeed().catch(() => {});
        break;
      case "circle_activated":
        applyState(data, false);
        loadMembers().catch(() => {});
        loadFeed().catch(() => {});
        break;
    }
  });

  // --- initial load ---

  async function load() {
    try {
      circle = await call("circle-details", { circle_id: circleId });
      if (destroyed) return;
      buildLayout();
      shownPot = 0;
      renderState(false);
      countUp(potAmountEl, 0, circle.pot_balance, fmt, 700);
      shownPot = Number(circle.pot_balance) || 0;
      await Promise.all([loadMembers(), loadFeed()]);
    } catch (err) {
      if (destroyed) return;
      body.replaceChildren(
        el("div", { class: "empty-state" },
          el("h2", {}, "Couldn't open this circle"),
          el("p", { class: "form-error" }, err.message),
          el("p", {}, el("a", { href: "#/" }, "Back to your circles"))
        )
      );
    }
  }

  load();

  return {
    destroy() {
      destroyed = true;
      unsub();
      clearInterval(clockTimer);
    },
  };
}
