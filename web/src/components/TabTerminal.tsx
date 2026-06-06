import * as React from "react"

import { api } from "@/lib/api"
import { bootTermFrame, refitTerminal } from "@/lib/terminal"

// One terminal for a tab: a ttyd attached to the tab's tmux session
// (`/api/tab/term` → /tab-term/<token>/). Only the selected tab is mounted; the
// tmux session keeps running detached when we leave (destroy-unattached off), so
// switching tabs is cheap and never loses the agent.
const KEEPALIVE_MS = 18000

export function TabTerminal({ tabId }: { tabId: string }) {
  const [base, setBase] = React.useState<string | null>(null)
  const id = `tabterm-${tabId}`

  // Attach on mount; release on unmount (detaches the viewer, session lives on).
  React.useEffect(() => {
    let cancelled = false
    setBase(null)
    api
      .tabTerm(tabId)
      .then((r) => {
        if (!cancelled) setBase(r.base)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      api.tabTermRelease(tabId)
    }
  }, [tabId])

  // Keepalive; re-attach if the pool reaped us while still mounted.
  React.useEffect(() => {
    const t = setInterval(() => {
      api
        .tabTermTouch(tabId)
        .then((r) => {
          if (!r.alive)
            api
              .tabTerm(tabId)
              .then((x) => setBase(x.base))
              .catch(() => {})
        })
        .catch(() => {})
    }, KEEPALIVE_MS)
    return () => clearInterval(t)
  }, [tabId])

  // Wire xterm once the iframe element exists, and refit when its src lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-wire when base changes (new iframe)
  React.useEffect(() => {
    if (!base) return
    const cleanup = bootTermFrame(id, false)
    refitTerminal(id)
    return cleanup
  }, [base, id])

  if (!base)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        attaching…
      </div>
    )
  return <iframe id={id} src={base} title="terminal" className="frame" />
}
