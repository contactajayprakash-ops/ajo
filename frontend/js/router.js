// Two routes is all we need: home and a circle page.

export function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "circle" && parts[1]) {
    return { name: "circle", id: decodeURIComponent(parts[1]) };
  }
  return { name: "home" };
}

export function startRouter(onChange) {
  window.addEventListener("hashchange", () => onChange(parseRoute()));
  onChange(parseRoute());
}

export function navigate(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}
