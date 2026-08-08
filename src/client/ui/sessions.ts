import { z } from "zod"
import type { SessionId } from "../../shared/protocol.ts"
import { SESSION_ID_PREVIEW_LENGTH, sessionIdSchema } from "../../shared/protocol.ts"
import { apiRaw, apiRequest } from "../api.ts"
import { button, dot, el, errorMessage, iconButton, replace } from "./dom.ts"
import { mountOverlay } from "./overlay.ts"

const sessionInfoSchema = z
  .object({
    id: sessionIdSchema,
    title: z.string(),
    cols: z.number().int(),
    rows: z.number().int(),
    createdAt: z.number(),
    alive: z.boolean(),
    clients: z.number().int().nonnegative(),
  })
  .readonly()

export type SessionInfo = z.infer<typeof sessionInfoSchema>

const listResponseSchema = z.object({ sessions: z.array(sessionInfoSchema).readonly() }).readonly()
const createResponseSchema = z.object({ session: sessionInfoSchema }).readonly()

type SessionPickerActions = {
  readonly background: HTMLElement
  readonly currentSessionId: () => SessionId | undefined
  readonly onAttach: (id: SessionId) => void
  readonly onConfirm: (message: string, onConfirm: () => void) => void
  readonly onToast: (message: string, tone: "success" | "error" | "info") => void
}

export function openSessionPicker(actions: SessionPickerActions): void {
  const titleId = "sessions-title"
  const list = el("ul", { class: "list" })
  const body = el("div", { class: "dialog__body dialog__body--scroll" }, [list])
  const newButton = el("button", { class: "btn btn--primary", type: "button" }, ["New session"])
  const closeButton = el("button", { class: "btn btn--secondary", type: "button" }, ["Close"])

  const panel = el(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    [
      el("header", { class: "dialog__header" }, [
        el("h2", { class: "dialog__title", id: titleId }, [
          el("span", { class: "dialog__title-text" }, ["Sessions"]),
        ]),
      ]),
      body,
      el("footer", { class: "dialog__footer" }, [closeButton, newButton]),
    ],
  )

  const overlay = mountOverlay({
    panel,
    background: actions.background,
    onClose: () => undefined,
  })

  const showEmpty = (): void => {
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["No live sessions."]),
        el("p", { class: "empty__hint" }, ["Start a new session to begin."]),
      ]),
    ])
  }

  const showLoading = (): void => {
    replace(body, [
      el("div", { class: "empty", "aria-busy": "true" }, [
        el("p", { class: "empty__title" }, ["Loading sessions…"]),
        el("p", { class: "empty__hint" }, ["Reading active terminal sessions."]),
      ]),
    ])
  }

  const showError = (message: string): void => {
    const retry = button({ class: "btn btn--secondary" }, ["Retry"], load)
    replace(body, [
      el("div", { class: "empty" }, [
        el("p", { class: "empty__title" }, ["Could not load sessions."]),
        el("p", { class: "empty__hint" }, [message]),
        retry,
      ]),
    ])
  }

  const rowFor = (session: SessionInfo): HTMLElement => {
    const current = session.id === actions.currentSessionId()
    const label =
      session.title === "" ? session.id.slice(0, SESSION_ID_PREVIEW_LENGTH) : session.title
    const main = button(
      { class: "row", ...(current ? { "aria-current": "true" } : {}) },
      [
        el("span", { class: "row__lead" }, [
          dot(session.alive ? "connected" : "idle", session.alive ? "Alive" : "Stopped"),
        ]),
        el("span", { class: "row__label", title: label }, [label]),
        el("span", { class: "row__meta" }, [
          `${session.id.slice(0, SESSION_ID_PREVIEW_LENGTH)} · ${session.clients}c`,
        ]),
      ],
      () => {
        actions.onAttach(session.id)
        overlay.close()
      },
    )
    const kill = iconButton(
      `Kill ${label} (${session.id.slice(0, SESSION_ID_PREVIEW_LENGTH)})`,
      "close",
      "danger",
      () => actions.onConfirm(`Kill ${label}?`, () => void remove(session.id, label)),
    )
    return el("li", { class: "list__item" }, [main, el("span", { class: "row__actions" }, [kill])])
  }

  async function remove(id: SessionId, label: string): Promise<void> {
    try {
      await apiRaw(`/api/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      actions.onToast(`Killed ${label}`, "success")
      load()
    } catch (error) {
      if (error instanceof Error) actions.onToast(error.message, "error")
      else actions.onToast(errorMessage(error, "Could not kill session"), "error")
    }
  }

  function load(): void {
    showLoading()
    void apiRequest("/api/sessions", { schema: listResponseSchema })
      .then((data) => {
        if (data.sessions.length === 0) {
          showEmpty()
          return
        }
        replace(list, data.sessions.map(rowFor))
        replace(body, [list])
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          showError(error.message)
          actions.onToast(error.message, "error")
          return
        }
        const message = errorMessage(error, "Could not list sessions")
        showError(message)
        actions.onToast(message, "error")
      })
  }

  newButton.addEventListener("click", () => {
    newButton.disabled = true
    void apiRequest("/api/sessions", {
      schema: createResponseSchema,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    })
      .then((data) => {
        actions.onAttach(data.session.id)
        actions.onToast("Started a new session", "success")
        overlay.close()
      })
      .catch((error: unknown) => {
        if (error instanceof Error) actions.onToast(error.message, "error")
        else actions.onToast(errorMessage(error, "Could not create session"), "error")
        newButton.disabled = false
      })
  })

  closeButton.addEventListener("click", () => overlay.close())
  load()
}
