import {
  ChevronLeft,
  ChevronRight,
  Files,
  Globe,
  LayoutGrid,
  type LucideIcon,
  NotebookPen,
  Settings,
  SquareTerminal,
  Terminal,
} from "lucide-react"
import * as React from "react"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"
import { BrowserTab } from "@/components/BrowserTab"
import { CreateAgentDialog } from "@/components/CreateAgentDialog"
import { FilesPanel } from "@/components/FilesPanel"
import { GitStatusBadge } from "@/components/GitStatusBadge"
import { GridTab } from "@/components/GridTab"
import { HostSwitcher } from "@/components/HostSwitcher"
import { PaneSwitcher } from "@/components/PaneSwitcher"
import { ScratchTab } from "@/components/ScratchTab"
import { SettingsTab } from "@/components/SettingsTab"
import { TerminalFrame } from "@/components/TerminalFrame"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { AppProvider, lsGet, lsSet } from "@/lib/app-store"
import { useDiff } from "@/lib/git"
import { qk, queryClient } from "@/lib/query"
import { setSidebarPct, sidebarPctNow } from "@/lib/sidebar"
import { patchUIState, useUIState } from "@/lib/ui-state"
import { getQueryParam, pushQueryParam, setQueryParam } from "@/lib/url"
import { cn } from "@/lib/utils"

type LeftView = "herdr" | "grid"
type RightView = "files" | "scratch" | "browser" | "terminal" | "settings"

const LEFT_VIEWS: LeftView[] = ["herdr", "grid"]

// Shared tab-strip styling: a full-width underline strip, matching the original
// vanilla UI rather than shadcn's default pill TabsList.
const stripClass =
  "h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-background p-0"
const tabClass =
  "flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1.5 text-[13px] text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"

type TabDef = {
  value: string
  label: string
  icon: LucideIcon
  badge?: React.ReactNode
}

// A tab strip that shows full text labels when they fit, and collapses every
// tab to its icon when the track is too narrow for the labels — rather than
// truncating the last tab to "Settin…" or forcing a horizontal scroll.
function FitTabs({
  tabs,
  trailing,
  listClassName,
}: {
  tabs: TabDef[]
  trailing?: React.ReactNode
  listClassName?: string
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [compact, setCompact] = React.useState(false)

  React.useLayoutEffect(() => {
    const scroll = scrollRef.current
    const measure = measureRef.current
    if (!scroll || !measure) return
    const check = () => {
      // `measure` always renders the full-text tabs (hidden), so its natural
      // width is the space the labels need. If that can't fit the visible
      // track, switch to icons. The +1 absorbs sub-pixel rounding.
      setCompact(measure.scrollWidth > scroll.clientWidth + 1)
    }
    const ro = new ResizeObserver(check)
    ro.observe(scroll)
    ro.observe(measure)
    check()
    return () => ro.disconnect()
  }, [])

  return (
    <TabsList className={cn(stripClass, listClassName)}>
      {/* Tabs live in their own region; the trailing control stays fixed on the
          row. no-scrollbar hides the scrollbar so it doesn't steal row height. */}
      <div
        ref={scrollRef}
        className="no-scrollbar relative flex min-w-0 flex-1 overflow-x-auto"
      >
        {tabs.map(({ value, label, icon: Icon, badge }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={tabClass}
            title={compact ? label : undefined}
          >
            {compact ? (
              <Icon className="size-4" aria-label={label} />
            ) : (
              label
            )}
            {badge}
          </TabsTrigger>
        ))}
        {/* Hidden full-text copy used only to measure the width the labels
            need; absolutely positioned so it never affects layout or the
            track's own width (which would create a measurement feedback loop). */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex"
        >
          {tabs.map(({ value, label, badge }) => (
            <span key={value} className={tabClass}>
              {label}
              {badge}
            </span>
          ))}
        </div>
      </div>
      {trailing}
    </TabsList>
  )
}

function Pane({
  show,
  children,
}: {
  show: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("absolute inset-0 flex flex-col", !show && "hidden")}>
      {children}
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <Shell />
      <Toaster />
    </AppProvider>
  )
}

function Shell() {
  const [leftView, setLeftView] = React.useState<LeftView>(() => {
    // Prefer ?view=; fall back to a legacy #hash (migrated to a query param on
    // first write below) so old links still land on the right tab.
    const v = getQueryParam("view") ?? location.hash.slice(1)
    return (LEFT_VIEWS as string[]).includes(v) ? (v as LeftView) : "herdr"
  })
  const [rightView, setRightView] = React.useState<RightView>("files")
  const [collapsed, setCollapsed] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  // Git working-tree status, polled app-wide (see useDiff) so the tab badge and
  // the collapsed-sidebar indicator stay live even when the Files panel is
  // hidden or the sidebar boots collapsed. `gitReady` gates the badge until we
  // have a real answer for the active repo.
  const diff = useDiff()
  const diffDirty = diff.data?.dirty ?? 0
  const gitReady = diff.data != null
  const rightPanel = React.useRef<PanelImperativeHandle>(null)
  const ui = useUIState()

  const savedLayout = React.useMemo<Layout | undefined>(() => {
    try {
      const v = lsGet("lasso-layout")
      return v ? (JSON.parse(v) as Layout) : undefined
    } catch {
      return undefined
    }
  }, [])

  // push=true adds a browser history entry (so Back returns to the previous
  // view) instead of replacing the current one — used when focusing a Grid pane
  // surfaces the Herdr tab, so Back goes back to the Grid.
  const switchLeft = React.useCallback(
    (name: LeftView, fromUrl = false, push = false) => {
      setLeftView(name)
      if (!fromUrl) (push ? pushQueryParam : setQueryParam)("view", name)
    },
    []
  )

  // Warm the cross-host pane list in the background on load so the first ⌘K
  // pane-switcher search is instant instead of waiting on a fresh fetch. Shares
  // qk.grid with the Grid tab and the switcher, so all three reuse one cache.
  React.useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: qk.grid,
      queryFn: () => api.gridPanes(),
    })
  }, [])

  // Reflect the initial tab in the query string once on mount — this also
  // clears any legacy #hash (setQueryParam drops the fragment). The initial
  // value is captured in a ref so the effect needs no reactive deps.
  const initialView = React.useRef(leftView)
  React.useEffect(() => {
    setQueryParam("view", initialView.current)
  }, [])

  // Back/forward drives the active left tab from the URL.
  React.useEffect(() => {
    const onPop = () => {
      const v = getQueryParam("view") ?? ""
      switchLeft(
        (LEFT_VIEWS as string[]).includes(v) ? (v as LeftView) : "herdr",
        true
      )
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [switchLeft])

  // The sidebar's last open width (% of the group), so expanding restores it
  // rather than snapping to minSize. react-resizable-panels' expand() only
  // remembers the size from this session, so a sidebar that loads collapsed (or
  // whose persisted layout is ~0) would expand thin — we resize() explicitly
  // instead. The width is persisted to localStorage (see lib/sidebar) so it also
  // survives a page reload / lasso restart, not just refreshed as the user drags.
  const expandSidebar = React.useCallback(() => {
    rightPanel.current?.resize(`${sidebarPctNow()}%`)
  }, [])
  const collapseSidebar = React.useCallback(() => {
    const p = rightPanel.current
    if (!p) return
    const s = p.getSize().asPercentage
    if (s > 5) setSidebarPct(s) // capture the true open width before hiding
    p.collapse()
  }, [])
  const toggleSidebar = React.useCallback(() => {
    if (rightPanel.current?.isCollapsed()) expandSidebar()
    else collapseSidebar()
  }, [expandSidebar, collapseSidebar])

  // ⌘G → Grid, ⌘H → Herdr, ⌘K → pane switcher, ⌘P → toggle the sidebar. Bound
  // to the Cmd key only
  // (not Ctrl) so it never clobbers terminal control keys like Ctrl-H
  // (backspace). The herdr/shell terminal iframes re-dispatch Cmd-shortcuts to
  // this document, so these work even while a terminal holds focus. (See
  // SHORTCUTS, the reference list shown in Settings.)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === "g") {
        e.preventDefault()
        switchLeft("grid")
      } else if (k === "h") {
        e.preventDefault()
        switchLeft("herdr")
      } else if (k === "p") {
        e.preventDefault()
        toggleSidebar()
      } else if (k === "k") {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [switchLeft, toggleSidebar])

  // Restore the persisted (SQLite-backed) collapse state once the prefs load.
  // Applied a single time — after that the panel's own resize events are the
  // source of truth (and persist back via onResize below).
  const collapseApplied = React.useRef(false)
  React.useEffect(() => {
    if (collapseApplied.current || ui.sidebar_collapsed == null) return
    collapseApplied.current = true
    if (ui.sidebar_collapsed) collapseSidebar()
  }, [ui.sidebar_collapsed, collapseSidebar])

  return (
    <div className="relative h-full w-full">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={savedLayout}
        onLayoutChanged={(l) => lsSet("lasso-layout", JSON.stringify(l))}
        className="h-full w-full"
      >
        <ResizablePanel
          id="left"
          defaultSize={60}
          minSize={15}
          className="flex h-full min-h-0 flex-col"
        >
          <Tabs
            value={leftView}
            onValueChange={(v) => switchLeft(v as LeftView)}
            className="flex h-full flex-col gap-0"
          >
            <FitTabs
              tabs={[
                { value: "herdr", label: "Herdr", icon: Terminal },
                { value: "grid", label: "Grid", icon: LayoutGrid },
              ]}
              listClassName={cn(collapsed && "pr-2")}
              trailing={
                collapsed && (
                  // Right-aligned so it sits at the far end of the row.
                  <div className="ml-2 flex items-center">
                    {/* Git status at a glance while the file viewer is hidden:
                        the uncommitted-change count (or a green dot when clean),
                        mirroring the Files tab's badge. Sits just left of the
                        un-collapse button. */}
                    <GitStatusBadge
                      dirty={diffDirty}
                      ready={gitReady}
                      className="mr-1.5"
                      textClassName="self-center text-[13px]"
                    />
                    <button
                      type="button"
                      className="my-1 mr-1 flex size-6 shrink-0 items-center justify-center self-center rounded border border-border text-muted-foreground hover:border-primary hover:text-primary"
                      title="show file viewer"
                      onClick={expandSidebar}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                  </div>
                )
              }
            />
            <div className="relative min-h-0 flex-1">
              <Pane show={leftView === "herdr"}>
                <TerminalFrame
                  id="term"
                  src="/terminal/"
                  title="Herdr terminal"
                  suppressContext
                  hidden={leftView !== "herdr"}
                />
              </Pane>
              <Pane show={leftView === "grid"}>
                <GridTab
                  active={leftView === "grid"}
                  onFocusInHerdr={() => switchLeft("herdr", false, true)}
                />
              </Pane>
            </div>
          </Tabs>
        </ResizablePanel>

        <ResizableHandle withHandle className={cn(collapsed && "hidden")} />

        <ResizablePanel
          id="right"
          panelRef={rightPanel}
          defaultSize={40}
          minSize={15}
          collapsible
          collapsedSize={0}
          onResize={(size) => {
            const c = size.asPercentage < 0.05
            setCollapsed((prev) => (prev === c ? prev : c))
            // Remember the open width so a later expand restores it (the panel
            // snaps to 0 below minSize, so any non-zero size is a real width).
            if (size.asPercentage > 5) setSidebarPct(size.asPercentage)
            patchUIState({ sidebar_collapsed: c })
          }}
          className="relative flex h-full min-h-0 flex-col border-border border-l bg-card"
        >
          <Tabs
            value={rightView}
            onValueChange={(v) => setRightView(v as RightView)}
            className="flex h-full flex-col gap-0"
          >
            <FitTabs
              tabs={[
                {
                  value: "files",
                  label: "Files",
                  icon: Files,
                  badge: (
                    <GitStatusBadge
                      dirty={diffDirty}
                      ready={gitReady}
                      className="ml-1.5"
                      textClassName="text-[13px]"
                    />
                  ),
                },
                { value: "scratch", label: "Scratch", icon: NotebookPen },
                { value: "browser", label: "Browser", icon: Globe },
                { value: "terminal", label: "Terminal", icon: SquareTerminal },
                { value: "settings", label: "Settings", icon: Settings },
              ]}
              trailing={
                // Styled like the tab icons (same box model) rather than a
                // bordered box, so it sits on the same baseline as them.
                <button
                  type="button"
                  className={cn(tabClass, "flex items-center hover:text-primary")}
                  title="collapse sidebar"
                  onClick={collapseSidebar}
                >
                  <ChevronRight className="size-4" />
                </button>
              }
            />

            <div className="relative min-h-0 flex-1">
              <Pane show={rightView === "files"}>
                <FilesPanel />
              </Pane>
              <Pane show={rightView === "scratch"}>
                <ScratchTab />
              </Pane>
              <Pane show={rightView === "browser"}>
                <BrowserTab />
              </Pane>
              <Pane show={rightView === "terminal"}>
                <TerminalFrame
                  id="shellframe"
                  src="/shell/"
                  title="Terminal (outside herdr)"
                  suppressContext={false}
                  hidden={rightView !== "terminal"}
                />
              </Pane>
              <Pane show={rightView === "settings"}>
                <SettingsTab active={rightView === "settings"} />
              </Pane>
            </div>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
      {/* Cmd+U pane switcher — searches every pane on every host, opens the
          chosen one in the Herdr tab (push=true so Back returns here). */}
      <PaneSwitcher
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onFocusInHerdr={() => switchLeft("herdr", false, true)}
      />
      {leftView === "herdr" && (
        <div className="fixed bottom-3 left-3 z-40 flex items-center gap-2">
          <HostSwitcher />
          {/* Surface the herdr terminal on create so it's visible when the
              dialog's close handler hands it keyboard focus. */}
          <CreateAgentDialog
            variant="floating"
            onCreated={() => switchLeft("herdr")}
          />
        </div>
      )}
    </div>
  )
}
