import { SESSION_ID_PREVIEW_LENGTH } from "../shared/protocol.ts"
import { checkAuthed } from "./api.ts"
import { createHerdrStore, type HerdrState } from "./herdr-store.ts"
import { createTerminalApp, type TerminalApp } from "./terminal.ts"
import { openConfirm } from "./ui/confirm.ts"
import { dot, el } from "./ui/dom.ts"
import { openEditor } from "./ui/editor.ts"
import { createFilesPanel } from "./ui/files-panel.ts"
import { createHerdrPanel } from "./ui/herdr-panel.ts"
import { renderLogin } from "./ui/login.ts"
import { openSessionPicker } from "./ui/sessions.ts"
import { createSidebar } from "./ui/sidebar.ts"
import { isMobile, terminalFontSize, terminalTheme } from "./ui/theme.ts"
import { createToaster } from "./ui/toast.ts"
import { applyLatches, createToolbar } from "./ui/toolbar.ts"
import { createTopBar } from "./ui/topbar.ts"

const appRoot = document.getElementById("app")
if (appRoot === null) throw new TypeError("missing #app root")
const app: HTMLElement = appRoot

async function renderApp(): Promise<void> {
  const toaster = createToaster()
  const terminalRegion = el("main", { class: "terminal", "aria-label": "Terminal" })

  const topBar = createTopBar({
    onToggleSidebar: () => {
      sidebar.toggle()
      shellBody.dataset["docked"] =
        isMobile() || sidebar.element.childElementCount > 0 ? "true" : "false"
    },
    onOpenSessions: () =>
      openSessionPicker({
        background: shell,
        currentSessionId: () => terminalApp?.connection.sessionId,
        onAttach: (id) => terminalApp?.switchSession(id),
        onToast: toaster.show,
      }),
  })

  const filesPanel = createFilesPanel({
    onToast: toaster.show,
    onEdit: (path, name) => {
      const launch = (): void => {
        void openEditor(path, name, {
          background: shell,
          onToast: toaster.show,
          onClosed: () => terminalApp?.fit(),
        })
      }
      if (sidebar.isDrawerOpen()) sidebar.closeDrawer(launch)
      else launch()
    },
    onConfirm: (message, onYes) => openConfirm({ message, background: shell, onConfirm: onYes }),
  })
  const herdrStore = createHerdrStore()
  const herdrPanel = createHerdrPanel(herdrStore)
  const herdrIndicator = dot("idle", "herdr status")
  herdrStore.subscribe((state: HerdrState) => {
    const label = state.status === "connected" ? "herdr connected" : `herdr ${state.status}`
    herdrIndicator.dataset["state"] =
      state.status === "connected"
        ? "connected"
        : state.status === "connecting"
          ? "reconnecting"
          : "offline"
    herdrIndicator.setAttribute("aria-label", label)
  })

  const sidebar = createSidebar({
    files: filesPanel,
    herdr: herdrPanel,
    herdrIndicator,
    background: terminalRegion,
    onDrawerChange: (open) => {
      topBar.setSidebarExpanded(open)
      // Keep the toggle tappable above the open drawer (see shell-components.css).
      shell.dataset["drawerOpen"] = open ? "true" : "false"
      // Latches must not survive an overlay opening (DESIGN.md 5.9).
      if (open) toolbar.clearLatches()
    },
  })

  const toolbar = createToolbar({
    sendKeys: (data) => terminalApp?.sendKeys(data),
    paste: (text) => terminalApp?.paste(text),
    hideKeyboard: () => {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    },
    // The textarea, never terminal.focus(): ghostty focuses its contenteditable
    // container, whose prevented beforeinput silently drops IME text.
    focusTerminal: () => terminalApp?.terminal.textarea?.focus(),
    onError: (message) => toaster.show(message, "error"),
    onLatchChange: () => undefined,
  })

  const shellBody = el("div", { class: "shell__body" }, [terminalRegion, sidebar.element])
  const shell = el("div", { class: "shell" }, [topBar.element, shellBody])
  if (isMobile()) shell.appendChild(toolbar.element)

  app.replaceChildren(shell, toaster.element)

  let terminalApp: TerminalApp | undefined
  const created = await createTerminalApp(terminalRegion, terminalTheme, {
    onState: (state) => {
      topBar.setState(state)
      if (state === "reconnecting") toaster.show("Reconnecting…", "warning")
      if (state === "connected") topBar.setSessionLabel(labelFor(terminalApp))
    },
    onLatency: topBar.setLatency,
    onTitle: (title) => {
      document.title = title === "" ? "web-terminal" : title
      topBar.setSessionLabel(title === "" ? labelFor(terminalApp) : title)
    },
    onSession: () => topBar.setSessionLabel(labelFor(terminalApp)),
    onExit: (code) =>
      toaster.show(
        code === 0
          ? "Session ended. Press Enter for a new one."
          : `Session exited (${code}). Press Enter for a new one.`,
        code === 0 ? "info" : "warning",
      ),
  })
  terminalApp = created

  // QA hook consumed by script/qa/e2e-scenarios.mjs. Object.assign avoids an `as` cast.
  Object.assign(globalThis, { __wt: created })

  // DESIGN.md 3.2: the terminal cell drops to 13px below --bp-md. Set once here
  // (the type scale is owned by the UI layer, not terminal.ts). ghostty recomputes
  // its own cell metrics on this assignment; the ResizeObserver below re-fits.
  const cellSize = terminalFontSize()
  if (created.terminal.options.fontSize !== cellSize) {
    created.terminal.options.fontSize = cellSize
    // FitAddon is still completing its initial resize in this task. Re-fit from
    // the next task so it uses the updated mobile font metrics.
    setTimeout(() => created.fit(), 0)
  }

  // Ctrl/Alt latch: intercept the next real key press before ghostty encodes it.
  // Returning true suppresses the engine's own send, so exactly one byte goes out.
  created.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return false
    // macOS-style shortcuts ghostty-web passes to the WASM encoder, which emits
    // nothing for SUPER-modified keys. Map them to the control bytes users expect.
    if (event.metaKey) {
      const byte = META_KEY_BYTES[event.code]
      if (byte !== undefined) {
        created.sendKeys(byte)
        return true
      }
      return false
    }
    const mods = toolbar.modifiers()
    if (!mods.ctrl && !mods.alt) return false
    if (event.key.length !== 1) return false
    created.sendKeys(applyLatches(event.key, mods))
    toolbar.clearLatches()
    return true
  })

  applyResponsiveLayout(shell, shellBody, toolbar.element, sidebar, created, terminalRegion)
}

/** macOS Meta-shortcuts that must reach the PTY as control bytes (research: SUPER-modified keys emit nothing by default). */
const META_KEY_BYTES: Readonly<Record<string, string>> = {
  Backspace: "\u0015", // Cmd+Delete -> Ctrl+U (kill to start of line)
  ArrowLeft: "\u0001", // Cmd+Left -> Ctrl+A (start of line)
  ArrowRight: "\u0005", // Cmd+Right -> Ctrl+E (end of line)
}

function labelFor(app: TerminalApp | undefined): string {
  const id = app?.connection.sessionId
  return id === undefined ? "Session" : id.slice(0, SESSION_ID_PREVIEW_LENGTH)
}

type SidebarHandle = ReturnType<typeof createSidebar>

function applyResponsiveLayout(
  shell: HTMLElement,
  shellBody: HTMLElement,
  toolbarEl: HTMLElement,
  sidebar: SidebarHandle,
  terminalApp: TerminalApp,
  terminalRegion: HTMLElement,
): void {
  const sync = (): void => {
    const mobile = isMobile()
    shellBody.dataset["docked"] = mobile ? "false" : "true"
    if (mobile && toolbarEl.parentElement === null) shell.appendChild(toolbarEl)
    if (!mobile && toolbarEl.parentElement !== null) toolbarEl.remove()
    if (!mobile && sidebar.isDrawerOpen()) sidebar.closeDrawer()
    sidebar.relayout()
  }
  sync()
  window.addEventListener("resize", sync)
  // Re-fit on every later box change (drawer, dock, keyboard, font metrics).
  new ResizeObserver(() => terminalApp.fit()).observe(terminalRegion)
  // The observer has no initial change to report: the region is sized in the
  // same layout pass it is attached in. Fit once after that pass commits, or the
  // canvas keeps the pre-layout box it was opened with.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => terminalApp.fit())
  })
  // The toolbar rides the on-screen keyboard's top edge (DESIGN.md 4.5).
  // 100dvh ignores the iOS keyboard (it overlays the layout viewport), so the
  // shell must be sized from visualViewport, the only signal that shrinks.
  const viewport = window.visualViewport
  if (viewport !== null && viewport !== undefined) {
    const rideKeyboard = (): void => {
      const keyboardUp = viewport.height < window.innerHeight - 1
      if (keyboardUp) {
        shell.style.blockSize = `${viewport.height}px`
        shell.style.transform = viewport.offsetTop > 0 ? `translateY(${viewport.offsetTop}px)` : ""
        window.scrollTo(0, 0)
      } else {
        shell.style.blockSize = ""
        shell.style.transform = ""
      }
      terminalApp.fit()
    }
    viewport.addEventListener("resize", rideKeyboard)
    viewport.addEventListener("scroll", rideKeyboard)
  }
}

async function boot(): Promise<void> {
  if (await checkAuthed()) {
    await renderApp()
  } else {
    renderLogin(app, () => void renderApp())
  }
}

void boot()
