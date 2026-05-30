import * as React from "react"

import { api, type DirListing } from "@/lib/api"
import { useApp } from "@/lib/app-store"
import { fmtSize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

// The Files tab: a directory browser that (by default) follows herdr's active
// pane. Clicking a directory navigates into it; clicking a file opens it in the
// full-column viewer (owned by the parent so its highlight clears on close).
export function FilesView({
  viewerPath,
  onOpenFile,
}: {
  viewerPath: string | null
  onOpenFile: (path: string) => void
}) {
  const { activeCwd } = useApp()
  const [curPath, setCurPath] = React.useState<string | null>(null)
  const [follow, setFollow] = React.useState(true)
  const [listing, setListing] = React.useState<DirListing | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pathValue, setPathValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Follow the active pane's cwd while "follow" is on.
  React.useEffect(() => {
    if (follow && activeCwd && activeCwd !== curPath) setCurPath(activeCwd)
  }, [follow, activeCwd, curPath])

  // Load the listing whenever the current directory changes.
  React.useEffect(() => {
    if (!curPath) return
    let cancelled = false
    api
      .files(curPath)
      .then((data) => {
        if (cancelled) return
        setError(null)
        setListing(data)
        if (document.activeElement !== inputRef.current) setPathValue(data.path)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setListing(null)
      })
    return () => {
      cancelled = true
    }
  }, [curPath])

  const onPathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value.trim()
    if (e.key === "Enter" && v) setCurPath(v)
  }

  const entries = listing?.entries ?? []
  const showParent =
    listing?.parent && listing.parent !== listing.path ? listing.parent : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Input
          ref={inputRef}
          value={pathValue}
          spellCheck={false}
          autoComplete="off"
          placeholder="go to path…  (Enter)"
          className="h-7 flex-1 text-xs"
          onChange={(e) => {
            setPathValue(e.target.value)
            setFollow(false) // editing the path means the user is steering
          }}
          onKeyDown={onPathKeyDown}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
          <Checkbox
            checked={follow}
            onCheckedChange={(v) => setFollow(v === true)}
          />
          follow active pane
        </label>
      </header>

      <div className="filelist">
        {error ? (
          <div className="empty">
            cannot read {curPath}
            <br />
            {error}
          </div>
        ) : !listing ? (
          <div className="empty">waiting for herdr…</div>
        ) : (
          <>
            {showParent && (
              <FileRow
                name=".."
                dir
                isUp
                onClick={() => setCurPath(showParent)}
              />
            )}
            {entries.length === 0 && <div className="empty">(empty)</div>}
            {entries.map((e) => {
              const full = listing.path.replace(/\/$/, "") + "/" + e.name
              return (
                <FileRow
                  key={e.name}
                  name={e.name}
                  dir={e.dir}
                  size={e.size}
                  selected={full === viewerPath}
                  onClick={() =>
                    e.dir ? setCurPath(full) : onOpenFile(full)
                  }
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function FileRow({
  name,
  dir,
  size,
  isUp,
  selected,
  onClick,
}: {
  name: string
  dir: boolean
  size?: number
  isUp?: boolean
  selected?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn("entry", dir ? "d" : "f", selected && "sel")}
      onClick={onClick}
    >
      <span className="ico">{dir ? (isUp ? "↑" : "▸") : "·"}</span>
      <span className="nm">{name}</span>
      {!dir && <span className="sz">{fmtSize(size)}</span>}
    </div>
  )
}
