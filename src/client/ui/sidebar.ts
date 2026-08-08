import { button, el, icon, replace } from "./dom.ts"
import type { FilesPanel } from "./files-panel.ts"
import type { HerdrPanel } from "./herdr-panel.ts"
import { mountOverlay, type Overlay } from "./overlay.ts"
import { isMobile } from "./theme.ts"

type SidebarTab = "files" | "herdr"

type Sidebar = {
  /** Docked host element, used at >= --bp-md. */
  readonly element: HTMLElement
  readonly openDrawer: () => void
  readonly closeDrawer: (afterClose?: () => void) => void
  readonly isDrawerOpen: () => boolean
  readonly relayout: () => void
  /** Collapse/expand the docked panel (desktop); opens/closes the drawer (mobile). */
  readonly toggle: () => void
}

type SidebarActions = {
  readonly files: FilesPanel
  readonly herdr: HerdrPanel
  /** Live herdr connection dot; the sidebar places it but never updates it. */
  readonly herdrIndicator: HTMLElement
  /** Terminal region; receives `inert` while the drawer is open. */
  readonly background: HTMLElement
  readonly onDrawerChange: (open: boolean) => void
}

export function createSidebar(actions: SidebarActions): Sidebar {
  const panelHost = el("div", {
    class: "stack",
    id: "sidebar-panel",
    role: "tabpanel",
    tabindex: "0",
  })
  let active: SidebarTab = "herdr"
  let overlay: Overlay | undefined
  let afterDrawerClose: (() => void) | undefined
  let dockedVisible = true

  const tabs = new Map<SidebarTab, HTMLButtonElement>()

  const showPanel = (): void => {
    const panel = active === "files" ? actions.files.element : actions.herdr.element
    replace(panelHost, [panel])
    actions.herdr.setVisible(active === "herdr")
    if (active === "files") actions.files.refresh()
  }

  const select = (tab: SidebarTab): void => {
    active = tab
    panelHost.setAttribute("aria-labelledby", `sidebar-tab-${tab}`)
    for (const [id, node] of tabs) {
      const selected = id === tab
      node.setAttribute("aria-selected", selected ? "true" : "false")
      node.tabIndex = selected ? 0 : -1
    }
    showPanel()
  }

  const makeTab = (id: SidebarTab, label: string): HTMLButtonElement => {
    const node = button(
      {
        class: "tab",
        id: `sidebar-tab-${id}`,
        role: "tab",
        "aria-selected": id === active ? "true" : "false",
        "aria-controls": "sidebar-panel",
        tabindex: id === active ? "0" : "-1",
      },
      id === "herdr" ? [label, actions.herdrIndicator] : [label],
      () => select(id),
    )
    tabs.set(id, node)
    return node
  }

  const strip = el("div", { class: "tabstrip", role: "tablist", "aria-label": "Panel sections" }, [
    makeTab("files", "Files"),
    makeTab("herdr", "herdr"),
  ])

  // Roving tabindex across the two tabs (DESIGN.md 5.3).
  strip.addEventListener("keydown", (event) => {
    const order: readonly SidebarTab[] = ["files", "herdr"]
    const index = order.indexOf(active)
    let next = -1
    switch (event.key) {
      case "ArrowRight":
        next = index + 1
        break
      case "ArrowLeft":
        next = index - 1
        break
      case "Home":
        next = 0
        break
      case "End":
        next = order.length - 1
        break
    }
    if (next === -1) return
    event.preventDefault()
    const target = order[Math.max(0, Math.min(order.length - 1, next))]
    if (target === undefined) return
    select(target)
    tabs.get(target)?.focus()
  })

  const closeButton = button(
    { class: "btn btn--ghost btn--icon", "aria-label": "Close panel" },
    [icon("close")],
    () => closeDrawer(),
  )

  const header = (withClose: boolean): HTMLElement =>
    el("div", { class: "sidebar__header" }, [
      el("h2", { class: "sidebar__title" }, ["Panel"]),
      ...(withClose ? [closeButton] : []),
    ])

  const dockedHost = el("aside", { class: "sidebar" }, [header(false), strip, panelHost])

  function closeDrawer(afterClose?: () => void): void {
    if (overlay === undefined) {
      afterClose?.()
      return
    }
    afterDrawerClose = afterClose
    overlay.close()
  }

  function openDrawer(): void {
    if (overlay !== undefined) return
    const panel = el(
      "aside",
      {
        class: "sidebar drawer",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Workspace panel",
        tabindex: "-1",
      },
      [header(true), strip, panelHost],
    )
    overlay = mountOverlay({
      panel,
      background: actions.background,
      onClose: () => {
        overlay = undefined
        actions.onDrawerChange(false)
        relayout()
        const continuation = afterDrawerClose
        afterDrawerClose = undefined
        continuation?.()
      },
    })
    actions.onDrawerChange(true)
  }

  /** Move the shared strip/panel between the drawer and the docked host. */
  function relayout(): void {
    if (overlay !== undefined) return
    if (isMobile() || !dockedVisible) {
      replace(dockedHost, [])
      dockedHost.setAttribute("hidden", "")
      actions.onDrawerChange(false)
      return
    }
    dockedHost.removeAttribute("hidden")
    replace(dockedHost, [header(false), strip, panelHost])
    actions.onDrawerChange(true)
  }

  function toggle(): void {
    if (isMobile()) {
      if (overlay !== undefined) closeDrawer()
      else openDrawer()
      return
    }
    dockedVisible = !dockedVisible
    relayout()
  }

  select("herdr")
  relayout()

  return {
    element: dockedHost,
    openDrawer,
    closeDrawer,
    isDrawerOpen: () => overlay !== undefined,
    relayout,
    toggle,
  }
}
