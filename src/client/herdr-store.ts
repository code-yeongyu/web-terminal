import { z } from "zod"
import { apiRequest } from "./api.ts"

const workspaceSchema = z
  .object({
    workspace_id: z.string(),
    number: z.number(),
    label: z.string(),
    focused: z.boolean(),
    pane_count: z.number(),
    tab_count: z.number(),
    agent_status: z.string(),
  })
  .readonly()

const agentSchema = z.record(z.string(), z.unknown()).readonly()

const tabSchema = z
  .object({
    tab_id: z.string(),
    workspace_id: z.string(),
    number: z.number(),
    label: z.string(),
    focused: z.boolean(),
    pane_count: z.number(),
    agent_status: z.string(),
  })
  .readonly()

const snapshotSchema = z
  .object({
    status: z.string(),
    snapshot: z
      .object({
        version: z.string(),
        workspaces: z.array(workspaceSchema).readonly().optional(),
        tabs: z.array(tabSchema).readonly().optional(),
        agents: z.array(agentSchema).readonly().optional(),
      })
      .readonly()
      .optional(),
  })
  .readonly()

export type Workspace = z.infer<typeof workspaceSchema>
export type Tab = z.infer<typeof tabSchema>
export type Snapshot = z.infer<typeof snapshotSchema>

export type HerdrState = {
  readonly status: "connecting" | "connected" | "unavailable"
  readonly snapshot?: Snapshot
}

export type HerdrStore = {
  /** Fires immediately with the current state, then on every change. */
  readonly subscribe: (listener: (state: HerdrState) => void) => () => void
  readonly setPanelVisible: (visible: boolean) => void
  readonly focusWorkspace: (workspaceId: string) => void
  readonly focusTab: (tabId: string) => void
  readonly dispose: () => void
}

const focusResponseSchema = z.object({ ok: z.boolean() }).readonly()

const POLL_VISIBLE_MS = 5_000
const POLL_HIDDEN_MS = 30_000
const BACKOFF_START_MS = 5_000
const BACKOFF_CAP_MS = 60_000

/**
 * The server re-runs `herdr ensureRunning` per snapshot request, so a flat
 * cadence against a dead herdr pays a start attempt every tick. Back off on
 * failure and idle harder while nobody is looking at the panel.
 */
export function createHerdrStore(): HerdrStore {
  const listeners = new Set<(state: HerdrState) => void>()
  let state: HerdrState = { status: "connecting" }
  let timer: ReturnType<typeof setTimeout> | undefined
  let panelVisible = false
  let backoffMs = BACKOFF_START_MS
  let disposed = false

  const emit = (next: HerdrState): void => {
    state = next
    for (const listener of listeners) listener(state)
  }

  const nextDelay = (): number => {
    if (state.status === "unavailable") return backoffMs
    return panelVisible ? POLL_VISIBLE_MS : POLL_HIDDEN_MS
  }

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (disposed || document.visibilityState === "hidden") return
    timer = setTimeout(poll, nextDelay())
  }

  function poll(): void {
    if (disposed) return
    void apiRequest("/api/herdr/snapshot", { schema: snapshotSchema })
      .then((snapshot) => {
        backoffMs = BACKOFF_START_MS
        emit({ status: "connected", snapshot })
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
        emit({ status: "unavailable" })
        backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS)
      })
      .finally(schedule)
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      return
    }
    poll()
  }

  document.addEventListener("visibilitychange", onVisibilityChange)
  poll()

  function requestFocus(body: Readonly<Record<string, string>>): void {
    void apiRequest("/api/herdr/focus", {
      schema: focusResponseSchema,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
      })
      // Refresh regardless of outcome: success shows the new focus, failure
      // repaints the state that actually holds.
      .finally(poll)
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
    focusWorkspace: (workspaceId) => requestFocus({ workspaceId }),
    focusTab: (tabId) => requestFocus({ tabId }),
    setPanelVisible: (visible) => {
      if (visible === panelVisible) return
      panelVisible = visible
      // A newly revealed panel should not wait out a 30s hidden-cadence tick.
      if (visible) poll()
      else schedule()
    },
    dispose: () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      listeners.clear()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    },
  }
}
