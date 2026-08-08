import { button, el, icon, replace } from "./dom.ts"

type ToastTone = "info" | "success" | "warning" | "error"

type Toaster = {
  readonly show: (message: string, tone?: ToastTone) => void
  readonly element: HTMLElement
}

/** Toast lifetime state; timer mutation pauses and resumes auto-dismissal. */
type Entry = {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
  timer: ReturnType<typeof setTimeout> | undefined
}

/** DESIGN.md 5.6: max 3 visible, the 4th coalesces into a "+N more" line. */
const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 5000

export function createToaster(): Toaster {
  const list = el("ol", { class: "toasts", role: "region", "aria-label": "Notifications" })
  const nodes = new Map<number, HTMLElement>()
  let entries: readonly Entry[] = []
  let nextId = 0

  const dismiss = (id: number): void => {
    const found = entries.find((entry) => entry.id === id)
    if (found?.timer !== undefined) clearTimeout(found.timer)
    entries = entries.filter((entry) => entry.id !== id)
    nodes.delete(id)
    render()
  }

  const arm = (entry: Entry): void => {
    if (entry.tone === "error") return
    entry.timer = setTimeout(() => dismiss(entry.id), AUTO_DISMISS_MS)
  }

  const renderEntry = (entry: Entry): HTMLElement => {
    const existing = nodes.get(entry.id)
    if (existing !== undefined) return existing
    const item = el(
      "li",
      {
        class: "toast",
        "data-tone": entry.tone,
        role: entry.tone === "error" ? "alert" : "status",
      },
      [
        el("div", { class: "toast__body" }, [entry.message]),
        button({ class: "toast__close", "aria-label": "Dismiss" }, [icon("close")], () =>
          dismiss(entry.id),
        ),
      ],
    )
    const pause = (): void => {
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      entry.timer = undefined
    }
    const resume = (): void => {
      if (item.matches(":hover") || item.contains(document.activeElement)) return
      arm(entry)
    }
    item.addEventListener("pointerenter", pause)
    item.addEventListener("pointerleave", resume)
    item.addEventListener("focusin", pause)
    item.addEventListener("focusout", resume)
    nodes.set(entry.id, item)
    return item
  }

  function render(): void {
    const visible = entries.slice(-MAX_VISIBLE)
    const hidden = entries.length - visible.length
    const nodes = visible.map(renderEntry)
    if (hidden > 0) {
      nodes.unshift(el("li", { class: "toast__more" }, [`+${hidden} more`]))
    }
    replace(list, nodes)
  }

  return {
    element: list,
    show: (message, tone = "info") => {
      const entry: Entry = { id: nextId++, message, tone, timer: undefined }
      entries = [...entries, entry]
      arm(entry)
      render()
    },
  }
}
