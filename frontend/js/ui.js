// Small DOM + formatting helpers. No framework, on purpose.

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === "class") {
        node.className = val;
      } else if (key === "dataset") {
        Object.assign(node.dataset, val);
      } else if (key.startsWith("on") && typeof val === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (val === true) {
        node.setAttribute(key, "");
      } else {
        node.setAttribute(key, val);
      }
    }
  }
  appendKids(node, children);
  return node;
}

function appendKids(node, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) {
      appendKids(node, kid);
    } else {
      node.append(kid.nodeType ? kid : String(kid));
    }
  }
}

const CURRENCY_SIGNS = {
  NGN: "₦",
  GHS: "GH₵",
  KES: "KSh ",
  ZAR: "R",
  USD: "$",
  GBP: "£",
  EUR: "€",
  XOF: "CFA ",
};

export function money(amount, currency) {
  const n = Number(amount) || 0;
  const sign = CURRENCY_SIGNS[currency] || (currency ? currency + " " : "");
  const opts = Number.isInteger(n)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return sign + n.toLocaleString("en", opts);
}

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString();
}

// Ease-out count-up for the pot. `format` turns a number into display text.
export function countUp(node, from, to, format, duration = 900) {
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  if (a === b) {
    node.textContent = format(b);
    return;
  }
  const started = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = format(t < 1 ? a + (b - a) * eased : b);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Re-trigger a CSS animation class even if it's already applied.
export function pulse(node, className, ms = 1200) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), ms);
}
