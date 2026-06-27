import { ArrowDown, ArrowUp } from "lucide-react"
import type * as React from "react"
import {
  focusTerminalInput,
  sendKeyToTerminal,
  type VirtualKey,
} from "@/lib/terminal"

// Virtual keys for mobile: the soft keyboard has no Esc, Tab, or arrows, which
// agents (Claude Code) need constantly (Enter is left to the keyboard's Return).
// Mobile-only (md:hidden), pinned to the bottom of the terminal pane — with the
// visualViewport height clamp it lands just above the on-screen keyboard.
const KEYS: { key: VirtualKey; label: React.ReactNode; title: string }[] = [
  { key: "Escape", label: "esc", title: "Escape" },
  { key: "ArrowUp", label: <ArrowUp className="size-4" />, title: "Up" },
  { key: "ArrowDown", label: <ArrowDown className="size-4" />, title: "Down" },
  { key: "Tab", label: "tab", title: "Tab" },
]

export function MobileKeyBar({ targetId }: { targetId: string }) {
  return (
    <div className="flex shrink-0 border-border border-t md:hidden">
      {KEYS.map(({ key, label, title }) => (
        <button
          key={key}
          type="button"
          title={title}
          tabIndex={-1}
          // Act on pointerdown (not click) and preventDefault so the button
          // never takes focus, then immediately hand focus back to the terminal:
          // on iOS a tap in the parent doc dismisses the keyboard even with
          // preventDefault, so we re-focus the iframe's textarea in the same
          // gesture tick to keep it open. (No onClick — it would double-fire.)
          onPointerDown={(e) => {
            e.preventDefault()
            sendKeyToTerminal(targetId, key)
            focusTerminalInput(targetId)
          }}
          className="flex flex-1 items-center justify-center border-border border-r py-2.5 font-mono text-muted-foreground text-sm last:border-r-0 hover:text-foreground active:bg-accent/40"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
