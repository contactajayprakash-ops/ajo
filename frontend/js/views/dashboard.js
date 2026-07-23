import { call, callList } from "../api.js?v=4d0fdaeda5";
import { el, money } from "../ui.js?v=4d0fdaeda5";
import { navigate } from "../router.js?v=4d0fdaeda5";

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "XOF", "USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY"];

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
      el("p", { class: "dash-sub" }, "A savings circle is a group money pool: everyone chips in the same amount each round, and members take turns collecting the whole pot. Start one below, or join a friend's with their invite code."),
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
        el("input", { id: "c-name", name: "name", required: true, maxlength: "60", placeholder: "Vacation fund" })
      ),
      el("div", { class: "field" },
        el("label", { for: "c-desc" }, "What's it for? (optional)"),
        el("input", { id: "c-desc", name: "description", maxlength: "160", placeholder: "A trip, rent, holiday gifts…" })
      ),
      el("div", { class: "field-row" },
        el("div", { class: "field" },
          el("label", { for: "c-amount" }, "Contribution"),
          el("input", { id: "c-amount", name: "amount", type: "number", min: "1", step: "any", required: true, inputmode: "decimal", placeholder: "100" })
        ),
        el("div", { class: "field" },
          el("label", { for: "c-currency" }, "Currency"),
          el("select", { id: "c-currency", name: "currency", onchange: onCurrencyChange },
            CURRENCIES.map((c) => el("option", { value: c }, c)),
            el("option", { value: "__custom" }, "Other…")),
          // Circles run anywhere — any ISO-style code works, and money()
          // renders unknown codes as "CODE amount" so nothing breaks.
          el("input", {
            id: "c-currency-custom", name: "currencyCustom", type: "text", hidden: true,
            maxlength: "5", autocomplete: "off", spellcheck: "false",
            placeholder: "e.g. BRL", style: "margin-top:6px;text-transform:uppercase",
          })
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

    function onCurrencyChange() {
      const custom = form.currency.value === "__custom";
      form.currencyCustom.hidden = !custom;
      if (custom) form.currencyCustom.focus();
    }

    async function submit(e) {
      e.preventDefault();
      err.textContent = "";
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        let currency = form.currency.value;
        if (currency === "__custom") {
          currency = form.currencyCustom.value.trim().toUpperCase();
          if (!/^[A-Z]{2,5}$/.test(currency)) {
            throw new Error("Enter a currency code, like BRL or PHP (2–5 letters).");
          }
        }
        const amount = Number(form.amount.value);
        const seats = Number(form.seats.value);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("Contribution needs to be a positive amount.");
        }
        if (!Number.isInteger(seats) || seats < 2 || seats > 50) {
          throw new Error("Seats must be a whole number between 2 and 50.");
        }
        // We mint the circle id here so the backend can reuse it across the
        // circle + membership + activity inserts without id round-trips.
        const circle_id = (crypto.randomUUID && crypto.randomUUID()) ||
          ("c" + Date.now() + Math.random().toString(36).slice(2));
        const circle = await call("create-circle", {
          circle_id,
          name: form.name.value.trim(),
          description: form.description.value.trim(),
          contribution_amount: Number(form.amount.value),
          currency,
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
        el("input", { id: "j-code", name: "code", required: true, class: "input-code", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Paste the code exactly" })
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
        // Invite codes are case-sensitive (Sub0 generates mixed-case ids like
        // "fPpouyuMM2ZHjLFp9LKb6s"), so only trim — never change the case, or
        // a valid pasted code stops matching.
        const code = form.code.value.trim();
        if (!code) throw new Error("Enter the invite code first.");
        const res = await call("join-circle", { invite_code: code });
        // An unknown code can come back as an empty 200 rather than an error —
        // don't navigate to a circle that isn't there.
        if (!res || !res.id) {
          throw new Error("That invite code didn't match any circle. Check it and try again.");
        }
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
