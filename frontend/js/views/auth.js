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
    if (!email || !email.includes("@")) {
      errorLine.textContent = "Enter a valid email address.";
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
      // The backend can answer 200 with an empty row when credentials don't
      // match — no token means we are NOT signed in, whatever the status said.
      if (!res || !res.token) {
        throw new Error(mode === "signup"
          ? "Couldn't create the account — that email may already be registered."
          : "Wrong email or password.");
      }
      saveSession(res.token, { id: res.id, name: res.name, email: res.email });
      onLogin();
    } catch (err) {
      // Restore the button by hand. Don't call applyMode() here: it clears the
      // error line, which is how "wrong password" used to vanish unread.
      errorLine.textContent = err.message;
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    }
  }

  applyMode();

  const page = el("div", { class: "auth-page" },
    el("div", { class: "auth-pitch" },
      el("div", { class: "wordmark" }, "Ajo", el("span", { class: "wordmark-dot" }, ".")),
      el("p", { class: "auth-eyebrow" }, "A rotating savings circle"),
      el("h1", { class: "auth-headline" }, "Save as a group.", el("br"), "Take turns getting the pot."),
      el("p", { class: "auth-sub" },
        "Ajo is a way of saving that West African communities have trusted for generations: ",
        "a few people who trust each other pool their money and take turns collecting it. ",
        "Everyone puts in the same amount each week, and each week one member takes the whole ",
        "pot. It rotates until everyone has had a turn. A simple, interest-free way to save for ",
        "something big — no bank, no loan, no interest."
      ),
      el("p", { class: "how-title" }, "How it works"),
      el("ol", { class: "how-steps" },
        el("li", {}, el("strong", {}, "Start a circle."), " Pick the amount, how often, and how many people. Share the invite code."),
        el("li", {}, el("strong", {}, "Everyone pays in."), " Each round, members contribute the same fixed amount and the pot fills up live."),
        el("li", {}, el("strong", {}, "One person collects."), " The full pot goes to the next member in line — until everyone has been paid out once.")
      ),
      el("ul", { class: "auth-points" },
        el("li", {}, el("strong", {}, "Watch it live."), " The pot updates on everyone's screen the moment someone pays in."),
        el("li", {}, el("strong", {}, "Fair by design."), " The payout order is locked when the circle starts; everyone collects exactly once."),
        el("li", {}, el("strong", {}, "Fully transparent."), " Every payment and payout is logged with a timestamp. Nobody holds the cash.")
      )
    ),
    el("div", { class: "auth-card" }, form)
  );

  root.append(page);
  return {};
}
