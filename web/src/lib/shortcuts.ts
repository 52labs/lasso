// Keyboard shortcuts, defined once so the handler (App) and the reference list
// (Settings) stay in sync. All are bound to the Cmd key (⌘) only — never Ctrl —
// so they don't clobber terminal control keys (e.g. Ctrl-H is backspace). The
// terminal iframes re-dispatch Cmd-shortcuts to the document, so these fire even
// while a terminal holds focus.
export interface Shortcut {
  keys: string
  label: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "⌘K", label: "Find a pane…" },
  { keys: "⌘I", label: "New terminal…" },
  { keys: "⌘U", label: "New tab…" },
  { keys: "⌘[", label: "Toggle the left sidebar" },
  { keys: "⌘]", label: "Toggle the right panel" },
  { keys: "⌘?", label: "Keyboard shortcuts" },
]

export type ShortcutAction =
  | "toggle-left"
  | "toggle-right"
  | "palette"
  | "new-workspace"
  | "new-tab"
  | "shortcuts"

// Match a keydown to one of the app's global Cmd-shortcuts. Cmd-only (Ctrl and
// Alt must be up) so terminal control keys (e.g. Ctrl-H) are never clobbered.
// Shift is rejected for everything except ⌘? (the shortcuts reference), whose
// `?` is itself a shifted key. We key off `e.code` (the physical key) first because on macOS the
// reported `e.key` is unreliable while Cmd is held — that mismatch is why ⌘[/⌘]
// flashed the terminal (the browser ran its Back/Forward default) instead of
// toggling. `e.key` is a fallback for non-US physical layouts.
export function matchShortcut(e: {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
  code: string
}): ShortcutAction | null {
  if (!e.metaKey || e.ctrlKey || e.altKey) return null
  // ⌘? (Cmd-Shift-/) opens the shortcuts reference — the only binding that uses
  // Shift. Match the physical Slash key (code) first since `?` is its shifted
  // form; fall back to the `?` character for layouts that place it elsewhere.
  if (e.shiftKey) {
    if (e.code === "Slash" || e.key === "?") return "shortcuts"
    return null
  }
  switch (e.code) {
    case "BracketLeft":
      return "toggle-left"
    case "BracketRight":
      return "toggle-right"
    case "KeyK":
      return "palette"
    case "KeyI":
      return "new-workspace"
    case "KeyU":
      return "new-tab"
  }
  switch (e.key.toLowerCase()) {
    case "[":
      return "toggle-left"
    case "]":
      return "toggle-right"
    case "k":
      return "palette"
    case "i":
      return "new-workspace"
    case "u":
      return "new-tab"
  }
  return null
}
