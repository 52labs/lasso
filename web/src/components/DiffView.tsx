import * as React from "react"

import { api, type DiffPayload } from "@/lib/api"
import { useApp } from "@/lib/app-store"
import { parseDiff, type DiffFile } from "@/lib/diff"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/Pill"

interface Loaded {
  data: DiffPayload
  files: DiffFile[]
  add: number
  del: number
}

// The Diff tab. It always follows herdr's active pane and auto-picks the diff
// mode (working tree when dirty, branch-vs-primary when clean). It polls every
// 2.5s while visible so it tracks edits/commits/branch switches with no event.
export function DiffView({
  active,
  viewerOpen,
  onDirty,
}: {
  active: boolean
  viewerOpen: boolean
  onDirty: (n: number) => void
}) {
  const { activeCwd } = useApp()
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const [allCollapsed, setAllCollapsed] = React.useState(true)

  const seenRef = React.useRef<Set<string>>(new Set())
  const sigRef = React.useRef<string | null>(null)
  const baseRef = React.useRef<string | null>(null)
  const loadingRef = React.useRef(false)
  const renderedRef = React.useRef(false)

  // onDirty is the parent's setState (stable identity), so the callback can use
  // it directly without a "latest ref" written during render.
  const load = React.useCallback(async () => {
    const base = activeCwd
    if (!base) {
      setLoaded(null)
      setError(null)
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    if (base !== baseRef.current) {
      baseRef.current = base
      sigRef.current = null // force a fresh render when the repo changes
    }
    try {
      const data = await api.diff(base)
      const sig = JSON.stringify([
        data.branch,
        data.baseBranch,
        data.isBranchDiff,
        data.truncated,
        data.dirty,
        data.diff,
      ])
      onDirty(data.dirty || 0)
      if (sig === sigRef.current && renderedRef.current) return // no-op: keep scroll/expand
      sigRef.current = sig
      const files = parseDiff(data.diff || "")
      let add = 0
      let del = 0
      const fresh: string[] = []
      for (const f of files) {
        add += f.add
        del += f.del
        if (!seenRef.current.has(f.path)) {
          seenRef.current.add(f.path)
          fresh.push(f.path) // new files fold up by default
        }
      }
      if (fresh.length)
        setCollapsed((prev) => new Set([...prev, ...fresh]))
      setError(null)
      setLoaded({ data, files, add, del })
      renderedRef.current = true
    } catch (e) {
      sigRef.current = null
      onDirty(0)
      setError((e as Error).message)
      setLoaded(null)
    } finally {
      loadingRef.current = false
    }
  }, [activeCwd, onDirty])

  // Load + poll while the tab is visible and the file viewer isn't covering it.
  React.useEffect(() => {
    if (!active) return
    load()
    const t = setInterval(() => {
      if (active && !document.hidden && !viewerOpen) load()
    }, 2500)
    const onVis = () => {
      if (!document.hidden && active) load()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [active, viewerOpen, load])

  const toggleAll = () => {
    const next = !allCollapsed
    setAllCollapsed(next)
    if (loaded) {
      setCollapsed(next ? new Set(loaded.files.map((f) => f.path)) : new Set())
    }
  }

  const toggleFile = (path: string) => {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })
  }

  const data = loaded?.data
  const files = loaded?.files ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent" multiline>
            {activeCwd || "—"}
          </Pill>
          {data && (
            <Pill tone={data.dirty ? "warn" : "good"}>
              {data.dirty ? `${data.dirty} dirty` : "clean"}
            </Pill>
          )}
          {data?.isBranchDiff && data.baseBranch && (
            <Pill>vs {data.baseBranch}</Pill>
          )}
          {data?.isBranchDiff && files.length > 0 && (
            <Pill>
              {files.length} {files.length === 1 ? "file" : "files"}
            </Pill>
          )}
          {loaded && loaded.add > 0 && <Pill tone="good">+{loaded.add}</Pill>}
          {loaded && loaded.del > 0 && <Pill tone="bad">−{loaded.del}</Pill>}
          {data?.truncated && <Pill tone="warn">diff truncated (large)</Pill>}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7"
            onClick={toggleAll}
          >
            {allCollapsed ? "expand all" : "collapse all"}
          </Button>
        </div>
      </header>

      <div className="difflist wrap">
        {error ? (
          <div className="empty">
            cannot diff this directory
            <br />
            {error}
          </div>
        ) : !activeCwd ? (
          <div className="empty">no active directory yet</div>
        ) : !loaded ? (
          <div className="empty">loading diff…</div>
        ) : files.length === 0 ? (
          <div className="empty">
            {data?.isBranchDiff
              ? data.baseBranch
                ? `no changes vs ${data.baseBranch}`
                : "no base branch to compare against"
              : "no changes" + (data?.branch ? ` on ${data.branch}` : "")}
          </div>
        ) : (
          files.map((f) => (
            <DiffFileBlock
              key={f.path}
              file={f}
              collapsed={collapsed.has(f.path)}
              onToggle={() => toggleFile(f.path)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DiffFileBlock({
  file,
  collapsed,
  onToggle,
}: {
  file: DiffFile
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div className="dfile">
      <div className="dfhead" onClick={onToggle}>
        <span className="caret">{collapsed ? "▸" : "▾"}</span>
        <span className="dfname">{file.path || "(unknown)"}</span>
        <span className="dfstat">
          <span className="add">+{file.add}</span>{" "}
          <span className="del">−{file.del}</span>
        </span>
      </div>
      {!collapsed && (
        <div className="dfbody">
          {file.lines.map((ln, i) => (
            <div key={i} className={cn("dline", ln.t)}>
              <span className="sign">
                {ln.t === "add" ? "+" : ln.t === "del" ? "-" : ""}
              </span>
              <span className="txt">{ln.s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
