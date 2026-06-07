import * as React from "react"

import { type ActiveState, api } from "@/lib/api"
import { invalidateHostScoped } from "@/lib/query"
import { applyOnyxTheme } from "@/lib/theme"

// App-wide state derived from herdr, kept live over the /api/events SSE stream.
// Components read activeCwd/activePaneID/panesRev reactively and run their own
// effects off them (Files follows the cwd, Diff reloads, the grid re-highlights
// the focused pane and reloads on a layout change).
interface AppState {
  activeCwd: string | null
  activePaneID: string | null
  panesRev: number
  // Active host name ("local" or an alias), kept live off the SSE stream so the
  // footer reflects switches initiated anywhere.
  host: string | null
  // tab id → agent status (idle|working|blocked), pushed by the status poller.
  agentStatuses: Record<string, string>
}

// Fired when the active host changes (term_rev bumped) so terminal iframes can
// reload onto the new host's ttyd session.
export const HOST_CHANGED_EVENT = "lasso:host-changed"

const AppContext = React.createContext<AppState | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>({
    activeCwd: null,
    activePaneID: null,
    panesRev: -1,
    host: null,
    agentStatuses: {},
  })

  // Last seen term_rev — a change means the active host switched, so terminals
  // must reload. Tracked in a ref so the SSE handler stays referentially stable.
  const lastTermRev = React.useRef<number | null>(null)

  const apply = React.useCallback((a: ActiveState) => {
    if (typeof a.term_rev === "number") {
      if (lastTermRev.current !== null && a.term_rev !== lastTermRev.current) {
        window.dispatchEvent(new CustomEvent(HOST_CHANGED_EVENT))
        // The new host has its own remembered repo/branch/agent + repo list, so
        // drop the cached host-scoped queries; the creator reloads them on open.
        invalidateHostScoped()
      }
      lastTermRev.current = a.term_rev
    }
    setState((prev) => ({
      activeCwd: a.cwd || prev.activeCwd,
      activePaneID: a.pane_id || prev.activePaneID,
      panesRev: typeof a.panes_rev === "number" ? a.panes_rev : prev.panesRev,
      host: a.host || prev.host,
      agentStatuses: a.agent_statuses ?? prev.agentStatuses,
    }))
  }, [])

  // The Files/Diff panel follows the selected tab's working directory. Selection
  // lives in the Shell, so it tells the store which cwd to track via this event
  // (keeping the existing useApp().activeCwd consumers — git.ts, FilesPanel —
  // unchanged).
  React.useEffect(() => {
    const onCwd = (e: Event) => {
      const cwd = (e as CustomEvent).detail as string
      setState((prev) =>
        cwd && cwd !== prev.activeCwd ? { ...prev, activeCwd: cwd } : prev
      )
    }
    window.addEventListener("lasso:cwd", onCwd)
    return () => window.removeEventListener("lasso:cwd", onCwd)
  }, [])

  // Initial state + live SSE updates.
  React.useEffect(() => {
    let es: EventSource | null = null
    api
      .active()
      .then(apply)
      .catch(() => {
        /* SSE will populate */
      })
    es = new EventSource("/api/events")
    es.addEventListener("active", (e) =>
      apply(JSON.parse((e as MessageEvent).data))
    )
    return () => es?.close()
  }, [apply])

  // Pin the terminals to the fixed Onyx palette + Nerd Font once on mount. The
  // UI/CSS side is static (Onyx tokens in index.css); this only themes the live
  // ttyd terminals. The reconciler re-pins them across ttyd reconnects.
  React.useEffect(() => {
    applyOnyxTheme()
  }, [])

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = React.useContext(AppContext)
  if (ctx === undefined)
    throw new Error("useApp must be used within an AppProvider")
  return ctx
}

// localStorage helpers that never throw (private-mode / disabled storage).
export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function lsSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val)
  } catch {
    /* ignore */
  }
}
