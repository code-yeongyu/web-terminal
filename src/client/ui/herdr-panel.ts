import type { HerdrState, HerdrStore, Snapshot, Tab, Workspace } from "../herdr-store.ts"
import { button, dot, el, replace } from "./dom.ts"

export type HerdrPanel = {
  readonly element: HTMLElement
  readonly setVisible: (visible: boolean) => void
  readonly dispose: () => void
}

/** Map herdr's free-form agent_status onto the four DESIGN.md 5.5 dot states. */
export function statusState(status: string): string {
  const value = status.toLowerCase()
  if (value.includes("run") || value.includes("active") || value.includes("busy")) {
    return "connected"
  }
  if (value.includes("wait") || value.includes("pend") || value.includes("start")) {
    return "reconnecting"
  }
  if (value.includes("err") || value.includes("fail") || value.includes("dead")) return "offline"
  return "idle"
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function agentRow(agent: Readonly<Record<string, unknown>>, index: number): HTMLElement {
  const name = readString(agent, "name") ?? readString(agent, "agent_id") ?? `Agent ${index + 1}`
  const status = readString(agent, "status") ?? "unknown"
  return el("li", { class: "list__item" }, [
    el("div", { class: "row" }, [
      el("span", { class: "row__lead" }, [dot(statusState(status), status)]),
      el("span", { class: "row__label", title: name }, [name]),
      el("span", { class: "row__meta" }, [status]),
    ]),
  ])
}

function tabRow(tab: Tab, onFocusTab: (id: string) => void): HTMLElement {
  const row = button(
    {
      class: "row row--action row--sub",
      "data-tab": tab.tab_id,
      "aria-label": `Focus tab ${tab.label}`,
      ...(tab.focused ? { "aria-current": "true" } : {}),
    },
    [
      el("span", { class: "row__label", title: tab.label }, [`${tab.number}. ${tab.label}`]),
      el("span", { class: "row__meta" }, [`${tab.pane_count}p`]),
    ],
    () => {
      if (!tab.focused) onFocusTab(tab.tab_id)
    },
  )
  return el("li", { class: "list__item" }, [row])
}

function workspaceRow(workspace: Workspace, onFocus: (id: string) => void): HTMLElement {
  const meta = `${workspace.pane_count}p ${workspace.tab_count}t`
  const row = button(
    {
      class: "row row--action",
      "data-workspace": workspace.workspace_id,
      "aria-label": `Focus workspace ${workspace.label}`,
      ...(workspace.focused ? { "aria-current": "true" } : {}),
    },
    [
      el("span", { class: "row__lead" }, [
        dot(statusState(workspace.agent_status), workspace.agent_status),
      ]),
      el("span", { class: "row__label", title: workspace.label }, [
        `${workspace.number}. ${workspace.label}`,
      ]),
      el("span", { class: "row__meta" }, [meta]),
    ],
    () => {
      if (!workspace.focused) onFocus(workspace.workspace_id)
    },
  )
  return el("li", { class: "list__item" }, [row])
}

function sectionHeading(text: string): HTMLElement {
  return el("div", { class: "panel" }, [el("h3", { class: "sidebar__title" }, [text])])
}

function emptyState(title: string, hint: string): HTMLElement {
  return el("div", { class: "empty" }, [
    el("p", { class: "empty__title" }, [title]),
    el("p", { class: "empty__hint" }, [hint]),
  ])
}

function snapshotNodes(
  data: Snapshot,
  onFocus: (id: string) => void,
  onFocusTab: (id: string) => void,
): readonly HTMLElement[] {
  const workspaces = data.snapshot?.workspaces ?? []
  const tabs = data.snapshot?.tabs ?? []
  const agents = data.snapshot?.agents ?? []
  if (workspaces.length === 0 && agents.length === 0) {
    return [emptyState("No active workspaces.", "Agents will appear here when they start.")]
  }
  const nodes: HTMLElement[] = []
  if (workspaces.length > 0) {
    nodes.push(sectionHeading("Workspaces"))
    nodes.push(
      el(
        "ul",
        { class: "list" },
        workspaces.flatMap((workspace) => {
          const children = tabs
            .filter((tab) => tab.workspace_id === workspace.workspace_id)
            .map((tab) => tabRow(tab, onFocusTab))
          return [workspaceRow(workspace, onFocus), ...children]
        }),
      ),
    )
  }
  if (agents.length > 0) {
    nodes.push(sectionHeading("Agents"))
    nodes.push(el("ul", { class: "list" }, agents.map(agentRow)))
  }
  return nodes
}

function stateNodes(
  state: HerdrState,
  onFocus: (id: string) => void,
  onFocusTab: (id: string) => void,
): readonly HTMLElement[] {
  switch (state.status) {
    case "connecting":
      return [emptyState("Connecting to herdr…", "Reading workspaces and agents.")]
    case "unavailable":
      return [
        emptyState("herdr is unavailable.", "Start the herdr server to see workspaces and agents."),
      ]
    case "connected":
      return state.snapshot === undefined ? [] : snapshotNodes(state.snapshot, onFocus, onFocusTab)
  }
}

export function createHerdrPanel(store: HerdrStore): HerdrPanel {
  const body = el("div", { class: "scroll-body" })
  const element = el("div", { class: "stack" }, [body])
  let visible = false
  let pending: HerdrState | undefined

  const paint = (state: HerdrState): void => {
    replace(body, stateNodes(state, store.focusWorkspace, store.focusTab))
  }

  const unsubscribe = store.subscribe((state) => {
    // Hidden panels stay in the store but skip DOM work; the latest state is
    // replayed on reveal so the panel never shows a stale frame.
    if (!visible) {
      pending = state
      return
    }
    paint(state)
  })

  return {
    element,
    setVisible: (next) => {
      if (next === visible) return
      visible = next
      store.setPanelVisible(next)
      if (!next) return
      if (pending !== undefined) {
        paint(pending)
        pending = undefined
      }
    },
    dispose: unsubscribe,
  }
}
