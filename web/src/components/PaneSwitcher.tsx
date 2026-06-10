import { useQuery } from "@tanstack/react-query"
import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { qk } from "@/lib/query"
import { cn } from "@/lib/utils"

// One searchable entry: a workspace (its one terminal — shell or agent),
// enriched with its repo context and (for agents) the initial prompt, so ⌘K
// matches renamed titles, the repo, and the prompt text.
interface Entry {
  tabId: string
  title: string
  workspace: string
  repo: string
  kind: string
  agent: string
  status: string
  prompt: string
}

const STATUS_DOT: Record<string, string> = {
  working: "bg-[var(--h-warn)]",
  blocked: "bg-[var(--h-bad)]",
  idle: "bg-[var(--h-good)]",
  unknown: "bg-muted-foreground/40",
}

const haystack = (e: Entry) =>
  [e.title, e.workspace, e.repo, e.agent, e.prompt]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

// PaneSwitcher: a ⌘K command palette over every workspace + agent. Type to
// filter (by title — including renames —, repo, agent, or prompt); ↑/↓ to
// move; Enter to select the workspace (shows its terminal in the center).
export function PaneSwitcher({
  open,
  onOpenChange,
  onSelectTab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTab: (tabId: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  const treeQ = useQuery({
    queryKey: qk.tree,
    queryFn: api.tree,
    enabled: open,
  })
  const agentsQ = useQuery({
    queryKey: qk.agents,
    queryFn: api.agentsList,
    enabled: open,
  })

  const entries = React.useMemo<Entry[]>(() => {
    const tree = treeQ.data
    if (!tree) return []
    const promptByTab = new Map<string, string>()
    for (const a of agentsQ.data?.agents ?? [])
      promptByTab.set(a.tab_id, a.prompt ?? "")
    const out: Entry[] = []
    const repoName = new Map<string, string>()
    const repos = tree.repos ?? []
    for (const r of repos)
      for (const w of r.workspaces ?? []) repoName.set(w.id, r.name)
    const wss = [
      ...(tree.scratch ?? []),
      ...repos.flatMap((r) => r.workspaces ?? []),
    ]
    for (const w of wss) {
      // One terminal per workspace: the workspace IS the entry; its tab is
      // just the selection handle.
      const t = (w.tabs ?? [])[0]
      if (!t) continue
      out.push({
        tabId: t.id,
        title: w.title || t.kind,
        workspace: w.title,
        repo: w.repo ? (repoName.get(w.id) ?? "") : "",
        kind: t.kind,
        agent: t.agent ?? "",
        status: t.status ?? "",
        prompt: promptByTab.get(t.id) ?? "",
      })
    }
    return out
  }, [treeQ.data, agentsQ.data])

  const filtered = React.useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return entries
    return entries.filter((e) => {
      const h = haystack(e)
      return tokens.every((t) => h.includes(t))
    })
  }, [entries, query])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on query change
  React.useEffect(() => setActive(0), [query])
  React.useEffect(() => {
    if (open) setQuery("")
  }, [open])
  React.useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const choose = (e: Entry) => {
    onOpenChange(false)
    onSelectTab(e.tabId)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onOpenChange(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const sel = filtered[active]
      if (sel) choose(sel)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)
            ?.querySelector("input")
            ?.focus()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Find a workspace or agent</DialogTitle>
        </DialogHeader>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search workspaces/agents by name, repo, agent, or prompt…"
          className="w-full border-border border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-muted-foreground text-sm">
              {treeQ.isLoading ? "Loading…" : "No matches."}
            </div>
          ) : (
            filtered.map((e, i) => (
              <button
                key={e.tabId}
                type="button"
                data-index={i}
                onClick={() => choose(e)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-none",
                  i === active && "bg-accent text-accent-foreground"
                )}
              >
                <span className="flex w-full items-center gap-2">
                  {e.kind === "agent" && (
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        STATUS_DOT[e.status] ?? STATUS_DOT.unknown
                      )}
                    />
                  )}
                  <span className="truncate font-bold text-sm">{e.title}</span>
                  {e.agent && (
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-medium text-[11px] text-primary">
                      {e.agent}
                      {e.status ? ` · ${e.status}` : ""}
                    </span>
                  )}
                </span>
                {e.repo && (
                  <span className="flex w-full items-center gap-2 truncate text-muted-foreground text-xs">
                    {e.repo}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
