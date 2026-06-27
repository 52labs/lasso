import { sendKeyToTerminal, type VirtualKey } from "@/lib/terminal"

// Mobile virtual keys (esc / ↑ / ↓ / tab), injected INSIDE the terminal iframe.
//
// They have to live in the iframe, not the parent: on iOS, a tap anywhere
// outside the focused element's browsing context dismisses the soft keyboard,
// and programmatic focus from the parent into an iframe input does NOT re-show it
// (iOS only honours focus tied to a gesture within the input's own context). So a
// parent-document bar could never keep the keyboard open. Inside the iframe, a
// preventDefault'd pointerdown on a sibling control keeps the xterm textarea
// focused exactly like any same-document toolbar, so the keyboard stays put.
//
// ttyd's body is a single #terminal-container; we make the body a flex column and
// let the container flex so the bar sits BELOW the terminal (xterm refits to the
// smaller box on resize) rather than overlaying the prompt row. Touch devices
// only — desktop never mounts it, so its layout is untouched.

const BAR_ID = "__lasso_mobile_keybar"
const BAR_PX = 56 // tall, thumb-friendly targets

const KEYS: { key: VirtualKey; label: string }[] = [
  { key: "Escape", label: "esc" },
  { key: "ArrowUp", label: "↑" },
  { key: "ArrowDown", label: "↓" },
  { key: "Tab", label: "tab" },
]

// Pull these from the parent root so the bar tracks the active (light/dark) theme.
const THEME_VARS = [
  "--h-bg",
  "--h-fg",
  "--h-muted",
  "--h-border",
  "--h-panel",
  "--h-hover",
  "--h-accent-dim",
]

// mountTerminalKeyBar injects the bar into a terminal iframe. Idempotent, and a
// no-op on non-touch devices. Re-runnable on every iframe (re)load (the document
// is fresh after a host-switch reload; a ttyd WS reconnect keeps the body, so the
// bar simply survives).
export function mountTerminalKeyBar(id: string, tries = 0): void {
  const el = document.getElementById(id) as HTMLIFrameElement | null
  const win = el?.contentWindow as Window | null
  if (!win) return
  // Touch only — keep desktop terminals full-height and bar-free.
  if (!win.matchMedia?.("(pointer: coarse)").matches) return
  const doc = win.document
  if (doc.getElementById(BAR_ID)) return
  const container = doc.getElementById("terminal-container")
  if (!container) {
    // ttyd may still be loading its document; retry briefly.
    if (tries < 20) setTimeout(() => mountTerminalKeyBar(id, tries + 1), 150)
    return
  }

  // Reflow so the bar sits below the terminal instead of over the prompt.
  doc.body.style.display = "flex"
  doc.body.style.flexDirection = "column"
  container.style.flex = "1 1 0"
  container.style.minHeight = "0"
  container.style.height = "auto"

  const cs = getComputedStyle(document.documentElement)
  const bar = doc.createElement("div")
  bar.id = BAR_ID
  for (const v of THEME_VARS) bar.style.setProperty(v, cs.getPropertyValue(v))
  bar.style.cssText += `;flex:0 0 ${BAR_PX}px;display:flex;border-top:1px solid var(--h-border);background:var(--h-panel,var(--h-bg));`

  for (const { key, label } of KEYS) {
    const b = doc.createElement("button")
    b.type = "button"
    b.tabIndex = -1
    b.textContent = label
    b.style.cssText =
      "flex:1 1 0;border:0;border-right:1px solid var(--h-border);background:transparent;color:var(--h-muted);font:500 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;"
    const press = (e: Event) => {
      // Same-document preventDefault keeps the xterm textarea focused, so the
      // on-screen keyboard never drops. Refocus it too as belt-and-suspenders.
      e.preventDefault()
      sendKeyToTerminal(id, key)
      ;(
        doc.querySelector(".xterm-helper-textarea") as HTMLElement | null
      )?.focus?.()
      b.style.background = "var(--h-hover,var(--h-accent-dim))"
      b.style.color = "var(--h-fg)"
    }
    const release = () => {
      b.style.background = "transparent"
      b.style.color = "var(--h-muted)"
    }
    b.addEventListener("pointerdown", press)
    b.addEventListener("pointerup", release)
    b.addEventListener("pointercancel", release)
    b.addEventListener("pointerleave", release)
    bar.appendChild(b)
  }
  ;(bar.lastElementChild as HTMLElement).style.borderRight = "0"
  doc.body.appendChild(bar)
  win.dispatchEvent(new Event("resize")) // refit xterm to the shorter container
}
