import { RotateCw } from "lucide-react"
import * as React from "react"
import { Pill } from "@/components/Pill"
import { Button } from "@/components/ui/button"
import { api, type VersionInfo } from "@/lib/api"

// The Settings tab: a single concern — does this lasso build speak the same
// herdr socket protocol as the installed herdr daemon? Lasso targets a fixed
// protocol (baked in at build time); the daemon reports its own over the socket.
// When they drift, terminals and RPC silently break, so we surface it here.
export function SettingsTab({ active }: { active: boolean }) {
  const [info, setInfo] = React.useState<VersionInfo | null>(null)
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle")
  const loadedOnce = React.useRef(false)

  const load = React.useCallback(async () => {
    setState("loading")
    try {
      setInfo(await api.version())
      setState("idle")
    } catch {
      setInfo(null)
      setState("error")
    }
  }, [])

  // Lazily load on first open, like the original initSettings().
  React.useEffect(() => {
    if (active && !loadedOnce.current) {
      loadedOnce.current = true
      load()
    }
  }, [active, load])

  const loading = state === "loading"
  const errored = state === "error"

  // The herdr-side pill: the daemon's protocol and how it compares to lasso's.
  let herdr: React.ReactNode
  if (loading) {
    herdr = <Pill>herdr …</Pill>
  } else if (errored || !info) {
    herdr = <Pill tone="warn">herdr unavailable</Pill>
  } else if (info.err) {
    herdr = (
      <Pill tone="warn" title={info.err}>
        herdr unreachable
      </Pill>
    )
  } else {
    const ver = info.herdr_version ? ` (${info.herdr_version})` : ""
    herdr = (
      <Pill tone={info.compatible ? "good" : "bad"}>
        herdr protocol {info.herdr_protocol}
        {ver} · {info.compatible ? "compatible" : "incompatible"}
      </Pill>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-border border-b bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-0.5 text-[13px] text-muted-foreground tracking-wide">
            lasso
          </span>
          <Pill>
            targets protocol{" "}
            {loading
              ? "…"
              : errored || !info
                ? "unknown"
                : info.lasso_protocol}
          </Pill>
          {herdr}
          {!loading && !errored && info && !info.err && !info.compatible && (
            <span className="text-[13px] text-warn">
              rebuild lasso (or update herdr) so both speak the same protocol
            </span>
          )}
          <Button
            variant="outline"
            size="icon"
            className="ml-auto size-7"
            title="re-check protocol compatibility"
            onClick={load}
          >
            <RotateCw />
          </Button>
        </div>
      </header>
    </div>
  )
}
