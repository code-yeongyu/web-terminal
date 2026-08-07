import { assertNever } from "../../shared/assert-never.ts"
import { el, icon } from "./dom.ts"
import {
  KEYS,
  type ModifierId,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  REPEATING,
  SHIFTED_SENDS,
} from "./toolbar-keys.ts"

type ModifierState = { readonly ctrl: boolean; readonly alt: boolean; readonly shift: boolean }

type Toolbar = {
  readonly element: HTMLElement
  /** Modifier latch state, read by the terminal key interceptor. */
  readonly modifiers: () => ModifierState
  /** Clear latches (on drawer/dialog open and compositionstart, DESIGN.md 5.9). */
  readonly clearLatches: () => void
}

type ToolbarActions = {
  readonly sendKeys: (data: string) => void
  readonly paste: (text: string) => void
  readonly hideKeyboard: () => void
  readonly focusTerminal: () => void
  readonly onError: (message: string) => void
  readonly onLatchChange: (state: ModifierState) => void
}

type LatchLevel = "off" | "latched" | "locked"

const LOWERCASE_A_CODE = "a".charCodeAt(0)
const LOWERCASE_Z_CODE = "z".charCodeAt(0)
const CONTROL_CODE_MASK = 0x1f

export function createToolbar(actions: ToolbarActions): Toolbar {
  const track = el("div", {
    class: "reel keybar",
    role: "toolbar",
    "aria-label": "Terminal keys",
    "aria-orientation": "horizontal",
  })
  const hint = el("div", { class: "keyhint", role: "status", "aria-live": "polite", hidden: true })
  const element = el("div", { class: "stack" }, [hint, track])

  const latches = new Map<ModifierId, LatchLevel>([
    ["ctrl", "off"],
    ["alt", "off"],
    ["shift", "off"],
  ])
  const caps = new Map<string, HTMLButtonElement>()
  let keyNodes: readonly HTMLButtonElement[] = []

  const state = (): ModifierState => ({
    ctrl: latches.get("ctrl") !== "off",
    alt: latches.get("alt") !== "off",
    shift: latches.get("shift") !== "off",
  })

  const paint = (): void => {
    for (const [id, level] of latches) {
      const cap = caps.get(id)
      if (cap === undefined) continue
      cap.setAttribute("aria-pressed", level === "off" ? "false" : "true")
      if (level === "locked") cap.dataset["locked"] = "true"
      else delete cap.dataset["locked"]
    }
    const active = [...latches.entries()].filter(([, level]) => level !== "off")
    if (active.length === 0) {
      hint.hidden = true
      hint.textContent = ""
    } else {
      hint.hidden = false
      const names = active
        .map(([id]) => (id === "ctrl" ? "Ctrl" : id === "alt" ? "Alt" : "Shift"))
        .join(" + ")
      hint.textContent = `${names} armed — press a key`
    }
    actions.onLatchChange(state())
  }

  const clearLatches = (): void => {
    for (const [id, level] of latches) {
      if (level === "latched") latches.set(id, "off")
    }
    paint()
  }

  const cycleLatch = (id: ModifierId): void => {
    const level = latches.get(id) ?? "off"
    switch (level) {
      case "off":
        latches.set(id, "latched")
        break
      case "latched":
        latches.set(id, "locked")
        break
      case "locked":
        latches.set(id, "off")
        break
      default:
        assertNever(level)
    }
    paint()
  }

  const pasteFromClipboard = (): void => {
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text !== "") actions.paste(text)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
        actions.onError("Clipboard read was blocked.")
      })
  }

  const fire = (def: (typeof KEYS)[number]): void => {
    switch (def.kind) {
      case "modifier":
        cycleLatch(def.id)
        return
      case "action":
        if (def.id === "kbd-hide") {
          actions.hideKeyboard()
          return
        }
        pasteFromClipboard()
        return
      case "default":
      case "combo":
        actions.sendKeys(applyLatches(def.send, state()))
        clearLatches()
        return
      default:
        assertNever(def)
    }
  }

  for (const def of KEYS) {
    const cap = el("button", {
      type: "button",
      class: "key",
      "data-key": def.id,
      ...(def.kind === "modifier" ? { "aria-pressed": "false" } : {}),
      ...("ariaLabel" in def ? { "aria-label": def.ariaLabel } : {}),
      tabindex: "-1",
    })
    if ("icon" in def) cap.appendChild(icon(def.icon))
    else cap.textContent = def.label
    if (def.kind === "action" && def.id === "paste" && navigator.clipboard === undefined) {
      cap.disabled = true
      cap.setAttribute("aria-disabled", "true")
    }

    let repeatDelay: ReturnType<typeof setTimeout> | undefined
    let repeatTimer: ReturnType<typeof setInterval> | undefined
    const stopRepeat = (): void => {
      if (repeatDelay !== undefined) clearTimeout(repeatDelay)
      if (repeatTimer !== undefined) clearInterval(repeatTimer)
      repeatDelay = undefined
      repeatTimer = undefined
      delete cap.dataset["pressed"]
    }

    // pointerdown + preventDefault so the hidden input never blurs and the
    // on-screen keyboard cannot collapse (DESIGN.md 5.9).
    cap.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      if (cap.disabled) return
      // Capture the pointer so a drifting held finger keeps repeating and the
      // release is delivered even off-cap; without it, pointerleave killed the
      // repeat after a few px of drift. Synthetic/inactive pointers throw here,
      // and proceeding uncaptured is the correct degraded behavior.
      try {
        cap.setPointerCapture(event.pointerId)
      } catch {
        // no active pointer to capture (synthetic events, stale id)
      }
      cap.dataset["pressed"] = "true"
      fire(def)
      // Every key hands focus back to the terminal except the one whose whole
      // job is to release it.
      if (def.id !== "kbd-hide") actions.focusTerminal()
      if (!REPEATING.has(def.id) || !("send" in def)) return
      const send = def.send
      repeatDelay = setTimeout(() => {
        repeatTimer = setInterval(() => actions.sendKeys(send), REPEAT_INTERVAL_MS)
      }, REPEAT_DELAY_MS)
    })
    for (const done of ["pointerup", "pointercancel"]) {
      cap.addEventListener(done, stopRepeat)
    }
    // Keyboard activation path (pointerdown never fires for Enter/Space).
    cap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      fire(def)
    })

    caps.set(def.id, cap)
    track.appendChild(cap)
  }

  keyNodes = [...caps.values()]
  const firstKey = keyNodes[0]
  if (firstKey !== undefined) firstKey.tabIndex = 0

  // Roving tabindex across the toolbar (DESIGN.md 5.9).
  track.addEventListener("keydown", (event) => {
    let offset = 0
    switch (event.key) {
      case "ArrowRight":
        offset = 1
        break
      case "ArrowLeft":
        offset = -1
        break
      case "Home":
        offset = Number.NEGATIVE_INFINITY
        break
      case "End":
        offset = Number.POSITIVE_INFINITY
        break
    }
    if (offset === 0) return
    event.preventDefault()
    const activeElement = document.activeElement
    const current =
      activeElement instanceof HTMLButtonElement ? keyNodes.indexOf(activeElement) : -1
    const base = current === -1 ? 0 : current
    const next = Math.max(0, Math.min(keyNodes.length - 1, base + offset))
    const target = keyNodes[next]
    if (target === undefined) return
    for (const node of keyNodes) node.tabIndex = -1
    target.tabIndex = 0
    target.focus()
  })

  return { element, modifiers: state, clearLatches }
}

/** Shift remaps Tab/arrows (BackTab, CSI 1;2) or uppercases; Ctrl maps a-z to its control byte; Alt prefixes ESC (DESIGN.md 5.9). */
export function applyLatches(data: string, mods: ModifierState): string {
  let out = data
  if (mods.shift) {
    const shifted = SHIFTED_SENDS[out]
    if (shifted !== undefined) out = shifted
    else if (out.length === 1) out = out.toUpperCase()
  }
  if (mods.ctrl && out.length === 1) {
    const code = out.toLowerCase().charCodeAt(0)
    if (code >= LOWERCASE_A_CODE && code <= LOWERCASE_Z_CODE) {
      out = String.fromCharCode(code & CONTROL_CODE_MASK)
    }
  }
  if (mods.alt) out = `\u001b${out}`
  return out
}
