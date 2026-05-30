import * as React from "react"
import { toast } from "sonner"

import { api, type DirListing } from "@/lib/api"
import { useApp } from "@/lib/app-store"
import { fmtSize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// An entry the user has targeted with a context-menu action.
type Target = { name: string; full: string; dir: boolean }

// The Files tab: a directory browser that (by default) follows herdr's active
// pane. Clicking a directory navigates into it; clicking a file opens it in the
// full-column viewer (owned by the parent so its highlight clears on close).
// Right-clicking an entry offers rename / delete.
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
  const [reloadNonce, setReloadNonce] = React.useState(0)
  const [renameTarget, setRenameTarget] = React.useState<Target | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [deleteTarget, setDeleteTarget] = React.useState<Target | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const reload = () => setReloadNonce((n) => n + 1)

  // Follow the active pane's cwd while "follow" is on.
  React.useEffect(() => {
    if (follow && activeCwd && activeCwd !== curPath) setCurPath(activeCwd)
  }, [follow, activeCwd, curPath])

  // Load the listing whenever the current directory changes (or we reload).
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
  }, [curPath, reloadNonce])

  const onPathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value.trim()
    if (e.key === "Enter" && v) setCurPath(v)
  }

  const submitRename = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name || name === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    try {
      await api.renameFile(renameTarget.full, name)
      setRenameTarget(null)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteFile(deleteTarget.full)
      setDeleteTarget(null)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
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
                  onClick={() => (e.dir ? setCurPath(full) : onOpenFile(full))}
                  onRename={() => {
                    setRenameTarget({ name: e.name, full, dir: e.dir })
                    setRenameValue(e.name)
                  }}
                  onDelete={() =>
                    setDeleteTarget({ name: e.name, full, dir: e.dir })
                  }
                />
              )
            })}
          </>
        )}
      </div>

      {/* rename — replaces window.prompt */}
      <Dialog
        open={renameTarget != null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.dir ? "folder" : "file"}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirmation — replaces window.confirm */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.dir ? "folder" : "file"} “{deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="min-w-0">
              <span className="block font-mono text-xs break-all">
                {deleteTarget?.full}
              </span>
              <span className="mt-3 block">
                {deleteTarget?.dir
                  ? "This permanently removes the folder and everything inside it."
                  : "This permanently removes the file."}{" "}
                It cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onRename,
  onDelete,
}: {
  name: string
  dir: boolean
  size?: number
  isUp?: boolean
  selected?: boolean
  onClick: () => void
  onRename?: () => void
  onDelete?: () => void
}) {
  const row = (
    <div
      className={cn("entry", dir ? "d" : "f", selected && "sel")}
      onClick={onClick}
    >
      <span className="ico">{dir ? (isUp ? "↑" : "▸") : "·"}</span>
      <span className="nm">{name}</span>
      {!dir && <span className="sz">{fmtSize(size)}</span>}
    </div>
  )

  // The parent ("..") row gets no menu — there's nothing to act on.
  if (!onRename && !onDelete) return row

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        {onRename && (
          <ContextMenuItem onSelect={onRename}>Rename…</ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem variant="destructive" onSelect={onDelete}>
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
