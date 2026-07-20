import * as React from "react"

import { Input } from "@/components/ui/input"
import type { GridPane } from "@/lib/api"
import { tilde } from "@/lib/format"
import { cn } from "@/lib/utils"

// Same cross-host pane identity as GridTab / PaneSwitcher (pane ids are only
// unique within a host).
const railKey = (p: GridPane) => `${p.host}|${p.pane_id}`

// GridRail is the Grid tab's collapsible pane picker: every pane on every
// host, grouped by host, each row with a watch star and an agent status dot.
// It's the roster view — including panes hidden from the grid — so starring
// and un-starring never requires leaving Watch mode. Collapsed it renders
// zero width (the parent animates the container); content keeps a fixed width
// so text doesn't reflow mid-transition.
export function GridRail({
  open,
  panes,
  watched,
  newKeys,
  onToggleWatch,
  onFocusPane,
}: {
  open: boolean
  /** ALL panes across hosts, unfiltered — the rail is the full roster. */
  panes: GridPane[] | null
  watched: Set<string>
  /** Keys to highlight as new (snapshotted by GridTab when the badge opens the rail). */
  newKeys: Set<string>
  onToggleWatch: (key: string) => void
  onFocusPane: (p: GridPane) => void
}) {
  const [search, setSearch] = React.useState("")
  const firstNewRef = React.useRef<HTMLDivElement>(null)

  // Bring the first "new" row into view when the rail opens via the badge.
  React.useEffect(() => {
    if (open && newKeys.size > 0)
      firstNewRef.current?.scrollIntoView({ block: "nearest" })
  }, [open, newKeys])

  const groups = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (p: GridPane) =>
      !q ||
      [p.host_label, p.workspace_label, p.tab_label, p.agent, p.cwd]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    const m = new Map<string, { label: string; panes: GridPane[] }>()
    for (const p of panes ?? []) {
      if (!match(p)) continue
      let g = m.get(p.host)
      if (!g) {
        g = { label: p.host_label, panes: [] }
        m.set(p.host, g)
      }
      g.panes.push(p)
    }
    return Array.from(m.values())
  }, [panes, search])

  let sawNew = false
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border-border border-r transition-[width] duration-150",
        open ? "w-64" : "w-0 border-r-0"
      )}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="shrink-0 p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter panes…"
            className="h-7 text-xs"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {groups.length === 0 && (
            <div className="empty text-xs">
              {panes?.length ? "no panes match" : "no panes"}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-3 py-1 font-semibold text-[11px] text-accent-foreground/70">
                {g.label}
              </div>
              {g.panes.map((p) => {
                const key = railKey(p)
                const isNew = newKeys.has(key)
                const refNew = isNew && !sawNew
                if (refNew) sawNew = true
                const title = p.workspace_label || p.workspace_id || p.pane_id
                const tabLabel =
                  p.tab_label && p.tab_label !== title ? p.tab_label : ""
                return (
                  <div
                    key={key}
                    ref={refNew ? firstNewRef : undefined}
                    className={cn(
                      "group flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/50",
                      isNew && "bg-accent"
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={watched.has(key)}
                      title={
                        watched.has(key) ? "Stop watching" : "Watch this pane"
                      }
                      onClick={() => onToggleWatch(key)}
                      className={cn(
                        "shrink-0 text-[13px] leading-none transition-colors",
                        watched.has(key)
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {watched.has(key) ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onFocusPane(p)}
                      title={[
                        p.host_label,
                        p.workspace_label,
                        p.tab_label,
                        p.agent,
                        tilde(p.cwd),
                        "",
                        "click to focus in Herdr",
                      ]
                        .filter((s) => s !== undefined && s !== null)
                        .join("\n")}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <span className="truncate text-foreground">
                        {title}
                        {tabLabel ? ` · ${tabLabel}` : ""}
                      </span>
                      {p.has_agent && (
                        <span
                          className={cn(
                            "shrink-0 text-[10px] text-muted-foreground",
                            p.agent_status === "working" && "text-warn",
                            p.agent_status === "blocked" && "text-bad",
                            (p.agent_status === "idle" ||
                              p.agent_status === "done") &&
                              "text-good"
                          )}
                        >
                          ● {p.agent || "agent"}
                        </span>
                      )}
                      {isNew && (
                        <span className="shrink-0 rounded-sm bg-primary/15 px-1 text-[9px] text-primary uppercase">
                          new
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
