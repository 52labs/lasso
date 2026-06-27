import { ArrowDown, ArrowUp, CornerDownLeft } from "lucide-react"
import type * as React from "react"
import { sendKeyToTerminal, type VirtualKey } from "@/lib/terminal"

// Virtual keys for mobile: the soft keyboard has no Esc or arrows, which agents
// (Claude Code) need constantly. Mobile-only (md:hidden), pinned to the bottom of
// the terminal pane — with the visualViewport height clamp it lands just above
// the on-screen keyboard.
const KEYS: { key: VirtualKey; label: React.ReactNode; title: string }[] = [
  { key: "Escape", label: "esc", title: "Escape" },
  { key: "ArrowUp", label: <ArrowUp className="size-4" />, title: "Up" },
  { key: "ArrowDown", label: <ArrowDown className="size-4" />, title: "Down" },
  {
    key: "Enter",
    label: <CornerDownLeft className="size-4" />,
    title: "Enter",
  },
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
          // Don't let the tap blur the terminal (which would dismiss the
          // keyboard); sendKeyToTerminal re-focuses it anyway.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => sendKeyToTerminal(targetId, key)}
          className="flex flex-1 items-center justify-center border-border border-r py-2.5 font-mono text-muted-foreground text-sm last:border-r-0 hover:text-foreground active:bg-accent/40"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
