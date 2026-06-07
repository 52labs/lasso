import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

// EmptyWorkspace is the center-pane placeholder shown when no workspace is
// selected (fresh start, or after closing everything) — instead of leaving a
// stray park terminal or a bare spinner. Styled after Onyx's agent-ops kit: an
// indigo square mark, a Space Grotesk headline, a mono uppercase tracked
// sub-label, and thin-bordered keyboard-hint chips. Colors come from the shadcn
// tokens so it tracks light/dark automatically.
export function EmptyWorkspace() {
  const newAgent = () =>
    window.dispatchEvent(new CustomEvent("lasso:new-agent"))
  return (
    <div className="flex h-full min-h-0 flex-1 select-none flex-col items-center justify-center gap-7 px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Onyx mark — a 2×2 cluster of indigo squares. */}
        <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
          <span className="size-3.5 bg-primary" />
          <span className="size-3.5 bg-primary/30" />
          <span className="size-3.5 bg-primary/30" />
          <span className="size-3.5 bg-primary" />
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <h1 className="font-display font-semibold text-3xl text-foreground tracking-tight">
            No workspace selected
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
            Pick a workspace · or spin up an agent
          </p>
        </div>
      </div>

      <Button onClick={newAgent} className="gap-1.5">
        <Plus className="size-4" />
        New Agent
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
        <Hint k="⌘O" label="New agent" />
        <Hint k="⌘I" label="Create workspace" />
        <Hint k="⌘K" label="Search" />
      </div>
    </div>
  )
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
      <kbd className="font-mono text-foreground">{k}</kbd>
      <span>{label}</span>
    </span>
  )
}
