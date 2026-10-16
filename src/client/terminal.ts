import { FitAddon, init, Terminal } from "ghostty-web"
import { type SessionId, sessionIdSchema } from "../shared/protocol.ts"
import { type ConnectionState, TerminalConnection } from "./connection.ts"
import { attachHangulKeydownIme } from "./hangul-keydown-ime.ts"
import { attachImeInputForwarding } from "./ime-input.ts"
import { attachImePreedit } from "./ime-preedit.ts"
import { attachMouseInput } from "./mouse-input.ts"
import { attachPinchZoom } from "./pinch-zoom.ts"
import { attachTouchScroll } from "./touch-scroll.ts"

type TerminalAppEvents = {
  readonly onState: (state: ConnectionState) => void
  readonly onLatency: (ms: number) => void
  readonly onTitle: (title: string) => void
  readonly onSession: (sessionId: SessionId) => void
  readonly onExit: (code: number) => void
}

export type TerminalApp = {
  readonly terminal: Terminal
  readonly connection: TerminalConnection
  readonly fit: () => void
  readonly sendKeys: (data: string) => void
  /** Bracketed-paste aware: wraps in ESC[200~..201~ when the app armed mode 2004. */
  readonly paste: (text: string) => void
  readonly switchSession: (sessionId: SessionId | undefined) => void
  readonly dispose: () => void
}

const SESSION_STORAGE_KEY = "wt:session-id"
// Pinch-zoom writes here; ui/theme.ts terminalFontSize() restores it at boot so
// the size a user chose survives reloads (Termius behavior).
const FONT_SIZE_STORAGE_KEY = "wt:font-size"
// Native Ghostty computes cell height from the font's vertical metrics
// (ascent+descent+lineGap over em). JetBrains Mono's is 1.32em; ghostty-web's
// "M"-bounding-box heuristic (~1.14em) renders noticeably tighter. GeistMono's
// own vertical metrics are 1.20em; the local config's adjust-cell-height = 10%
// scales that the same way Ghostty applies the percentage.
const GHOSTTY_LINE_HEIGHT_RATIO = 1.2 * 1.1
const DEFAULT_FONT_SIZE = 16
const TERMINAL_SCROLLBACK_LINES = 10_000
// Mirrors the local Ghostty config: GeistMono Nerd Font Mono, with Nerd symbols
// and IBM Plex Sans KR for the Hangul font-codepoint-map ranges.
const TERMINAL_FONT_FAMILY =
  '"GeistMono", "IBMPlexSansKR", "SymbolsNerdFontMono", ui-monospace, Menlo, monospace'

export type TerminalTheme = Readonly<Record<string, string>>

function measureAdvance(fontSize: number): number | undefined {
  const context = document.createElement("canvas").getContext("2d")
  if (context === null) return undefined
  context.font = `${fontSize}px ${TERMINAL_FONT_FAMILY}`
  const advance = context.measureText("M").width
  return advance > 0 ? advance : undefined
}

function applyGhosttyCellMetrics(terminal: Terminal): void {
  const renderer: unknown = Reflect.get(terminal, "renderer")
  if (typeof renderer !== "object" || renderer === null) return
  const metrics: unknown = Reflect.get(renderer, "metrics")
  if (typeof metrics !== "object" || metrics === null) return
  const height: unknown = Reflect.get(metrics, "height")
  const width: unknown = Reflect.get(metrics, "width")
  if (typeof height !== "number" || typeof width !== "number") return
  const fontSize = terminal.options.fontSize
  const targetHeight = Math.round(fontSize * GHOSTTY_LINE_HEIGHT_RATIO)
  if (targetHeight !== height) Reflect.set(metrics, "height", targetHeight)
  // ghostty-web ceils the cell to a whole pixel while glyphs advance at the
  // font's true width, so every column drifts off the pixel grid and blurs.
  const advance = measureAdvance(fontSize)
  if (advance !== undefined && advance !== width) Reflect.set(metrics, "width", advance)
}

async function preloadTerminalFont(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`${DEFAULT_FONT_SIZE}px "GeistMono"`),
        document.fonts.load(`${DEFAULT_FONT_SIZE}px "IBMPlexSansKR"`, "한"),
      ]),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 1500)),
    ])
  } catch {
    // font stays on the system fallback; terminal still works
  }
}

export async function createTerminalApp(
  container: HTMLElement,
  theme: TerminalTheme,
  events: TerminalAppEvents,
): Promise<TerminalApp> {
  await init()
  await preloadTerminalFont()
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: TERMINAL_FONT_FAMILY,
    scrollback: TERMINAL_SCROLLBACK_LINES,
    theme,
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)

  const fit = (): void => {
    applyGhosttyCellMetrics(terminal)
    fitAddon.fit()
  }
  fit()
  fitAddon.observeResize()
  // Focus the hidden textarea, not the container: ghostty's focus() targets the
  // contenteditable container whose beforeinput is prevented, which silently drops
  // IME/composed text (Korean). The textarea forwards input correctly.
  // Long-press selection rides ghostty's native mouse selection: synthesizing
  // mouse events on the canvas reuses its SelectionManager AND its
  // copy-on-select clipboard write at mouseup.
  const selectionMouse = (type: string, x: number, y: number): void => {
    const canvas = terminal.renderer?.getCanvas()
    if (canvas === undefined) return
    canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }))
  }
  let selectionAt: readonly [number, number] = [0, 0]
  const detachTouchScroll = attachTouchScroll(container, {
    onTap: () => terminal.textarea?.focus(),
    onSelectStart: (x, y) => {
      selectionAt = [x, y]
      selectionMouse("mousedown", x, y)
    },
    onSelectMove: (x, y) => {
      selectionAt = [x, y]
      selectionMouse("mousemove", x, y)
    },
    onSelectEnd: () => selectionMouse("mouseup", selectionAt[0], selectionAt[1]),
    isMouseTracking: () => terminal.hasMouseTracking(),
  })
  // Load the Nerd Font async (font-display: swap) so first paint is never blocked,
  // then repaint so PUA glyphs upgrade from the fallback once the face is ready.
  // The initial fit can run before stylesheets apply (wrong container width) and
  // before the webfont swaps in (wrong cell metrics). Refit after first paint and
  // again when every font is ready; both are no-ops when the size already matches.
  requestAnimationFrame(fit)
  // ghostty-web's fit() drops calls made within 50ms of a resize (_isResizing
  // lock), which eats the early load-time refits. The final, correct-metrics fit
  // must land after the font swap AND past the lock window.
  void document.fonts.ready.then(() => setTimeout(() => fitAddon.fit(), 120)).catch(() => undefined)
  const detachImeForwarding = attachImeInputForwarding(container, (data) =>
    connection.sendInput(data),
  )
  const detachHangulKeydown = attachHangulKeydownIme(container, terminal)
  const detachImePreedit = attachImePreedit(container, terminal)
  const detachPinchZoom = attachPinchZoom(container, {
    getFontSize: () => terminal.options.fontSize,
    setFontSize: (size) => {
      terminal.options.fontSize = size
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(size))
      fit()
    },
  })
  const detachMouseInput = attachMouseInput(container, terminal, (data) =>
    connection.sendInput(data),
  )

  const connection = new TerminalConnection({
    onOutput: (payload) => terminal.write(payload),
    onReset: () => terminal.write("\u001b[2J\u001b[H"),
    onState: events.onState,
    onLatency: events.onLatency,
    onExit: (code) => {
      // The PTY is gone: keep resuming this id and every reconnect re-attaches to
      // a corpse that accepts no input, which reads as a frozen terminal.
      localStorage.removeItem(SESSION_STORAGE_KEY)
      terminal.write(
        `\r\n\u001b[90m[session exited: ${code}] press Enter to start a new session\u001b[0m\r\n`,
      )
      exited = true
      events.onExit(code)
    },
    onSession: (sessionId) => {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
      events.onSession(sessionId)
    },
  })

  let exited = false
  terminal.onData((data) => {
    if (!exited) {
      connection.sendInput(data)
      return
    }
    // A dead session swallows input server-side; Enter is the documented way back.
    if (!data.includes("\r") && !data.includes("\n")) return
    exited = false
    terminal.write("\u001b[2J\u001b[H")
    connection.switchSession(undefined)
  })
  terminal.onResize(({ cols, rows }) => connection.sendResize(cols, rows))
  terminal.onTitleChange(events.onTitle)
  window.addEventListener("resize", () => fitAddon.fit())
  const storedSession = sessionIdSchema.safeParse(localStorage.getItem(SESSION_STORAGE_KEY))
  connection.connect(
    terminal.cols,
    terminal.rows,
    storedSession.success ? storedSession.data : undefined,
  )

  return {
    terminal,
    connection,
    fit,
    sendKeys: (data) => connection.sendInput(data),
    paste: (text) => terminal.paste(text),
    switchSession: (sessionId) => {
      terminal.write("\u001b[2J\u001b[H")
      connection.switchSession(sessionId)
    },
    dispose: () => {
      detachMouseInput()
      detachPinchZoom()
      detachHangulKeydown()
      detachImePreedit()
      detachImeForwarding()
      detachTouchScroll()
      connection.close()
      terminal.dispose()
    },
  }
}
