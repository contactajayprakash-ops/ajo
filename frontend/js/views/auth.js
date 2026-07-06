import { call } from "../api.js";
import { saveSession } from "../session.js";
import { el } from "../ui.js";

export function renderAuth(root, { onLogin }) {
  let mode = "signin";
  let busy = false;

  const errorLine = el("p", { class: "form-error", role: "alert" });

  const nameField = el("div", { class: "field" },
    el("label", { for: "auth-name" }, "Your name"),
    el("input", { id: "auth-name", name: "name", type: "text", autocomplete: "name", placeholder: "Ada Obi" })
  );
  const emailField = el("div", { class: "field" },
    el("label", { for: "auth-email" }, "Email"),
    el("input", { id: "auth-email", name: "email", type: "email", autocomplete: "email", required: true, placeholder: "you@example.com" })
  );
  const passwordField = el("div", { class: "field" },
    el("label", { for: "auth-password" }, "Password"),
    el("input", { id: "auth-password", name: "password", type: "password", autocomplete: "current-password", required: true, minlength: "8", placeholder: "At least 8 characters" })
  );

  const submitBtn = el("button", { class: "btn btn-primary btn-wide", type: "submit" }, "Sign in");
  const toggleBtn = el("button", { class: "link-btn", type: "button", onclick: switchMode }, "New here? Create an account");
  const formTitle = el("h2", { class: "auth-form-title" }, "Welcome back");

  const form = el("form", { class: "auth-form", onsubmit: submit },
    formTitle,
    nameField,
    emailField,
    passwordField,
    errorLine,
    submitBtn,
    el("div", { class: "auth-switch" }, toggleBtn)
  );

  function applyMode() {
    const signup = mode === "signup";
    nameField.hidden = !signup;
    formTitle.textContent = signup ? "Open your account" : "Welcome back";
    submitBtn.textContent = signup ? "Create account" : "Sign in";
    toggleBtn.textContent = signup
      ? "Already have an account? Sign in"
      : "New here? Create an account";
    passwordField.querySelector("input").autocomplete = signup ? "new-password" : "current-password";
    errorLine.textContent = "";
  }

  function switchMode() {
    mode = mode === "signin" ? "signup" : "signin";
    applyMode();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    errorLine.textContent = "";

    const email = form.email.value.trim();
    const password = form.password.value;
    const body = mode === "signup"
      ? { name: form.name.value.trim(), email, password }
      : { email, password };

    if (mode === "signup" && !body.name) {
      errorLine.textContent = "Tell us your name — your circle will see it.";
      return;
    }
    if (password.length < 8) {
      errorLine.textContent = "Password needs at least 8 characters.";
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? "Creating…" : "Signing in…";
    try {
      const res = await call(mode === "signup" ? "sign-up" : "sign-in", body);
      saveSession(res.token, { id: res.id, name: res.name, email: res.email });
      onLogin();
    } catch (err) {
      errorLine.textContent = err.message;
      busy = false;
      submitBtn.disabled = false;
      applyMode();
    }
  }

  applyMode();

  const page = el("div", { class: "auth-page" },
    el("div", { class: "auth-pitch" },
      el("div", { class: "wordmark" }, "Ajo", el("span", { class: "wordmark-dot" }, ".")),
      el("h1", { class: "auth-headline" }, "Save together.", el("br"), "Collect in turns."),
      el("p", { class: "auth-sub" },
        "The savings circle you grew up with — ajo, esusu, susu — minus the notebook ",
        "and the chasing. Everyone pays a fixed amount each cycle. One person collects ",
        "the whole pot. Then it rotates."
      ),
      el("ul", { class: "auth-points" },
        el("li", {}, el("strong", {}, "One pot, live."), " Watch it grow the second anyone pays in."),
        el("li", {}, el("strong", {}, "A fair rotation."), " Positions are set when the circle starts; everyone collects once."),
        el("li", {}, el("strong", {}, "Nothing hidden."), " Every contribution and payout lands in the circle feed, timestamped.")
      )
    ),
    el("div", { class: "auth-card" }, form)
  );

  root.append(page);
  return {};
}
