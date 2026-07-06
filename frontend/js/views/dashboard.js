import { call, callList } from "../api.js";
import { el, money } from "../ui.js";
import { navigate } from "../router.js";

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD", "GBP", "EUR"];

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}.`;
}

export function renderDashboard(root, ctx) {
  const { session, bus, signOut } = ctx;
  let openPanel = null; // "create" | "join" | null
  let refreshTimer = null;
  let loadToken = 0;

  const grid = el("div", { class: "circle-grid" }, el("p", { class: "muted" }, "Loading your circles…"));
  const panelHost = el("div", { class: "panel-host" });

  const createBtn = el("button", { class: "btn btn-primary", onclick: () => togglePanel("create") }, "Start a circle");
  const joinBtn = el("button", { class: "btn btn-quiet", onclick: () => togglePanel("join") }, "Join with a code");

  const page = el("div", { class: "page" },
    el("header", { class: "topbar" },
      el("a", { class: "wordmark", href: "#/" }, "Ajo", el("span", { class: "wordmark-dot" }, ".")),
      el("div", { class: "topbar-user" },
        el("span", { class: "topbar-name" }, session.user.name),
        el("button", { class: "link-btn", onclick: signOut }, "Sign out")
      )
    ),
    el("section", { class: "dash-hero" },
      el("h1", { class: "dash-greeting" }, greeting(session.user.name)),
      el("div", { class: "dash-actions" }, createBtn, joinBtn)
    ),
    panelHost,
    grid
  );
  root.append(page);

  function togglePanel(which) {
    openPanel = openPanel === which ? null : which;
    panelHost.replaceChildren();
    createBtn.classList.toggle("is-open", openPanel === "create");
    joinBtn.classList.toggle("is-open", openPanel === "join");
    if (openPanel === "create") panelHost.append(buildCreateForm());
    if (openPanel === "join") panelHost.append(buildJoinForm());
    if (openPanel) panelHost.querySelector("input, select")?.focus();
  }

  function buildCreateForm() {
    const err = el("p", { class: "form-error", role: "alert" });
    const form = el("form", { class: "panel", onsubmit: submit },
      el("h2", { class: "panel-title" }, "Start a circle"),
      el("p", { class: "panel-hint" }, "You'll get an invite code to share. The circle stays open until you start it."),
      el("div", { class: "field" },
        el("label", { for: "c-name" }, "Circle name"),
        el("input", { id: "c-name", name: "name", required: true, maxlength: "60", placeholder: "Market women of Yaba" })
      ),
      el("div", { class: "field" },
        el("label", { for: "c-desc" }, "What's it for? (optional)"),
        el("input", { id: "c-desc", name: "description", maxlength: "160", placeholder: "Rent, stock, school fees…" })
      ),
      el("div", { class: "field-row" },
        el("div", { class: "field" },
          el("label", { for: "c-amount" }, "Contribution"),
          el("input", { id: "c-amount", name: "amount", type: "number", min: "1", step: "any", required: true, inputmode: "decimal", placeholder: "5000" })
        ),
        el("div", { class: "field" },
          el("label", { for: "c-currency" }, "Currency"),
          el("select", { id: "c-currency", name: "currency" },
            CURRENCIES.map((c) => el("option", { value: c }, c)))
        )
      ),
      el("div", { class: "field-row" },
        el("div", { class: "field" },
          el("label", { for: "c-freq" }, "Every"),
          el("select", { id: "c-freq", name: "frequency" },
            el("option", { value: "weekly" }, "week"),
            el("option", { value: "daily" }, "day"),
            el("option", { value: "monthly" }, "month"))
        ),
        el("div", { class: "field" },
          el("label", { for: "c-seats" }, "Seats"),
          el("input", { id: "c-seats", name: "seats", type: "number", min: "2", max: "50", required: true, inputmode: "numeric", placeholder: "5" })
        )
      ),
      err,
      el("button", { class: "btn btn-primary", type: "submit" }, "Create circle")
    );

    async function submit(e) {
      e.preventDefault();
      err.textContent = "";
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        // We mint the circle id here so the backend can reuse it across the
        // circle + membership + activity inserts without id round-trips.
        const circle_id = (crypto.randomUUID && crypto.randomUUID()) ||
          ("c" + Date.now() + Math.random().toString(36).slice(2));
        const circle = await call("create-circle", {
          circle_id,
          name: form.name.value.trim(),
          description: form.description.value.trim(),
          contribution_amount: Number(form.amount.value),
          currency: form.currency.value,
          frequency: form.frequency.value,
          seats: Number(form.seats.value),
        });
        navigate(`#/circle/${(circle && circle.id) || circle_id}`);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    }
    return form;
  }

  function buildJoinForm() {
    const err = el("p", { class: "form-error", role: "alert" });
    const form = el("form", { class: "panel", onsubmit: submit },
      el("h2", { class: "panel-title" }, "Join a circle"),
      el("p", { class: "panel-hint" }, "Ask the person who started it for the invite code."),
      el("div", { class: "field" },
        el("label", { for: "j-code" }, "Invite code"),
        el("input", { id: "j-code", name: "code", required: true, class: "input-code", autocomplete: "off", spellcheck: "false", placeholder: "e.g. K7Q2XV" })
      ),
      err,
      el("button", { class: "btn btn-primary", type: "submit" }, "Join")
    );

    async function submit(e) {
      e.preventDefault();
      err.textContent = "";
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const res = await call("join-circle", { invite_code: form.code.value.trim() });
        navigate(`#/circle/${res.id}`);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    }
    return form;
  }

  function circleCard(c) {
    const isNext = c.status === "active" && c.payout_position === c.current_cycle;
    const positionLine = c.has_been_paid
      ? el("p", { class: "card-position is-done" }, "You've collected your pot")
      : isNext
        ? el("p", { class: "card-position is-next" }, "You collect next")
        : el("p", { class: "card-position" }, `You're #${c.payout_position} in the rotation`);

    return el("a", { class: "circle-card", href: `#/circle/${c.id}` },
      el("div", { class: "card-top" },
        el("h3", { class: "card-name" }, c.name),
        el("span", { class: `pill pill-${c.status}` }, c.status)
      ),
      el("p", { class: "card-pot" }, money(c.pot_balance, c.currency)),
      el("p", { class: "card-meta" },
        `Cycle ${c.current_cycle} of ${c.seats} · ${money(c.contribution_amount, c.currency)} ${c.frequency}`
      ),
      positionLine
    );
  }

  async function load(quiet) {
    const token = ++loadToken;
    try {
      const circles = await callList("my-circles");
      if (token !== loadToken) return;
      grid.replaceChildren();
      if (!circles.length) {
        grid.append(el("div", { class: "empty-state" },
          el("h2", {}, "No circles yet"),
          el("p", {}, "Start one and share the code with people you trust, or join a friend's circle. Two seats is enough to begin.")
        ));
      } else {
        circles.forEach((c) => grid.append(circleCard(c)));
      }
    } catch (err) {
      if (quiet) return;
      grid.replaceChildren(el("p", { class: "form-error" }, err.message));
    }
  }

  // Any socket event might change a pot on this screen; refresh, gently debounced.
  const unsub = bus.on(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => load(true), 400);
  });

  load();

  return {
    destroy() {
      unsub();
      clearTimeout(refreshTimer);
    },
  };
}
