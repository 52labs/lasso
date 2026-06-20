// Appearance mode: the user's chrome theme preference, persisted in localStorage
// (a per-device choice; no backend). "system" follows the OS via
// prefers-color-scheme; "light"/"dark" pin the Nothing palette; "herdr" makes the
// chrome track herdr's own theme (the pre-Nothing behavior — see
// lib/theme.ts:applyHerdrChrome). The resolved value drives the html dark/light
// class, which all the --h-* Nothing tokens / shadcn primitives cascade from (see
// index.css). An inline script in index.html applies the class before first paint
// to avoid a flash; this module keeps it in sync afterwards.
//
// NOTE: unlike the main (tmux) branch, the *terminal* palette is NOT mode-driven
// here — herdr always dictates the terminal theme (see lib/theme.ts). So
// applyMode only touches the chrome class; it deliberately does not re-pin the
// terminals.
export type Mode = "system" | "light" | "dark" | "herdr"

const KEY = "lasso-mode"
// New installs default to "herdr" — the chrome matches herdr's theme out of the
// box; the user opts into the Nothing light/dark palette explicitly.
const DEFAULT_MODE: Mode = "herdr"
const mql = () => window.matchMedia("(prefers-color-scheme: dark)")

export function getMode(): Mode {
  const v = localStorage.getItem(KEY)
  return v === "light" || v === "dark" || v === "system" || v === "herdr"
    ? v
    : DEFAULT_MODE
}

// resolvedMode collapses "system" to the concrete light/dark the OS reports.
// "herdr" resolves to "dark": herdr's palettes are dark-canvas, and the dark
// class keeps the `dark:` tailwind variants behaving as they do in dark mode
// (the herdr --h-* override is layered on top by applyHerdrChrome).
export function resolvedMode(m: Mode = getMode()): "light" | "dark" {
  if (m === "dark" || m === "light") return m
  if (m === "herdr") return "dark"
  return mql().matches ? "dark" : "light"
}

// applyMode sets the html dark/light class. It's the single chokepoint every
// appearance change funnels through — setMode, the on-mount call, and the
// watchSystemMode OS-change handler all land here. The herdr-mode --h-* override
// is applied separately (refreshTheme, which has /api/theme's palette to hand).
export function applyMode(m: Mode = getMode()) {
  const r = resolvedMode(m)
  const el = document.documentElement
  el.classList.toggle("dark", r === "dark")
  el.classList.toggle("light", r === "light")
}

// setMode persists the choice and applies the class immediately. The caller is
// responsible for refreshing the herdr chrome override (refreshTheme) so toggling
// into/out of "herdr" repaints the chrome without waiting for the next theme tick.
export function setMode(m: Mode) {
  localStorage.setItem(KEY, m)
  applyMode(m)
}

// watchSystemMode re-applies on OS theme changes while the user is on "system".
// Idempotent — safe to call once on app mount.
let watching = false
export function watchSystemMode() {
  if (watching) return
  watching = true
  mql().addEventListener("change", () => {
    if (getMode() === "system") applyMode("system")
  })
}
