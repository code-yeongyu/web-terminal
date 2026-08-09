import type { Terminal } from "ghostty-web"

// Per-syllable safety valve for the case its exact-cell match can never succeed: the app
// swallowed the input, cleared the screen, or repainted the line so the syllable landed on
// a different column. Sized to outlast a slow tunnel round trip while keeping a stale
// stand-in short enough not to read as a duplicated character.
const COMMIT_ECHO_TIMEOUT_MS = 500
// Plain keys (space, punctuation) are tracked only this close to composition activity:
// they shift where the next syllable will land, but outside a Korean typing flow the
// receiving app may not echo them at all (vim), where a tracked stand-in would flash.
const PLAIN_TRACK_WINDOW_MS = 1000

type CursorPosition = {
  readonly viewportX: number
  readonly viewportY: number
}

type PendingSyllable = {
  readonly text: string
  readonly cell: CursorPosition
  readonly at: number
}

type CellPosition = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// Terminal columns, not code points: CJK syllables occupy two cells, so a committed
// "한" advances the cursor by 2 while "a" advances it by 1.
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
]

function displayColumns(text: string): number {
  let columns = 0
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    columns += WIDE_RANGES.some(([low, high]) => code >= low && code <= high) ? 2 : 1
  }
  return columns
}

function readCursor(terminal: Terminal): CursorPosition | undefined {
  const cursor = terminal.wasmTerm?.getCursor()
  if (cursor === undefined) return undefined
  const { viewportX, viewportY } = cursor
  if (!Number.isFinite(viewportX) || !Number.isFinite(viewportY)) return undefined
  return { viewportX, viewportY }
}

function cellAt(terminal: Terminal, position: CursorPosition): CellPosition | undefined {
  const metrics = terminal.renderer?.getMetrics()
  if (metrics === undefined) return undefined
  // A row scrolled out of the viewport has no on-screen cell; callers hide the overlay
  // rather than pin it to a row the user is not looking at.
  if (position.viewportY < 0 || position.viewportY >= terminal.rows) return undefined
  return {
    x: position.viewportX * metrics.width,
    y: position.viewportY * metrics.height,
    width: metrics.width,
    height: metrics.height,
  }
}

type CellColors = { readonly background: string; readonly foreground: string }

function hexColor(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(6, "0").slice(-6)}`
}

function themeForeground(terminal: Terminal): number | undefined {
  const value = terminal.options.theme?.foreground
  if (typeof value !== "string") return undefined
  const parsed = Number.parseInt(value.replace("#", ""), 16)
  return Number.isFinite(parsed) ? parsed : undefined
}

function cellColors(terminal: Terminal, position: CursorPosition): CellColors | undefined {
  const line = terminal.buffer.active.getLine(position.viewportY)
  const cell = line?.getCell(position.viewportX)
  if (line === null || line === undefined || cell === undefined) return undefined
  // Theme foreground, not the cell's attribute and not a neighbour's: an empty cell carries
  // whatever default the app set on its input row (often plain white), and copying the
  // nearest glyph to the left picks up prompt markers, which turned the first syllable of
  // every line the accent colour. The theme foreground is what native Ghostty draws preedit
  // text in anyway.
  const foreground = themeForeground(terminal) ?? cell.getFgColor()
  return { background: hexColor(cell.getBgColor()), foreground: hexColor(foreground) }
}

/**
 * Renders in-progress IME text at the terminal cursor.
 *
 * ghostty-web ignores `compositionupdate` and only sends text at
 * `compositionend`, and its input textarea is a 1x1 element pinned at the
 * container origin — so browsers anchor the native preedit/candidate window to
 * the bottom-left corner instead of the caret. This moves that textarea to the
 * cursor cell (fixing the UA candidate window) and draws the composing text
 * itself. It never sends input: ghostty's `compositionend` stays the sole
 * sender, so `attachImeInputForwarding` dedup semantics are unaffected.
 */
export function attachImePreedit(container: HTMLElement, terminal: Terminal): () => void {
  const overlay = document.createElement("span")
  overlay.className = "term-preedit"
  overlay.hidden = true
  const committedSpan = document.createElement("span")
  const composingSpan = document.createElement("span")
  const committedGlyphs = document.createElement("span")
  const composingGlyphs = document.createElement("span")
  committedGlyphs.style.position = "relative"
  composingGlyphs.style.position = "relative"
  composingGlyphs.className = "term-preedit__composing"
  committedSpan.appendChild(committedGlyphs)
  composingSpan.appendChild(composingGlyphs)
  // Zero-sized inline-block: its bottom edge sits exactly on the line box's baseline, which
  // is the only reliable way to find where the browser will put the glyphs.
  const baselineProbe = document.createElement("span")
  baselineProbe.className = "term-preedit__baseline"
  overlay.append(committedSpan, composingSpan, baselineProbe)
  container.appendChild(overlay)

  let composing = false
  let trackers: readonly (() => void)[] = []
  // Committed syllables reach the screen only after a PTY round trip, so the overlay keeps
  // each one visible until its own echo lands. One entry per syllable: a single accumulated
  // string can only match or expire as a whole, so one bad entry kept the run alive for as
  // long as typing continued — and replacing instead blanked the previous syllable for a
  // round trip whenever its echo had not arrived yet.
  let pendingCommits: PendingSyllable[] = []
  let composingText = ""
  let composeCell: CursorPosition | undefined
  let lastCompositionAt = 0
  // The colour the app actually paints typed text in, sampled from a retired entry's own
  // cell. The theme foreground is only the first-syllable guess; every later stand-in can
  // use the real colour, which removes the flash when the echo repaints the glyph.
  let appTextColor: string | undefined
  let appTextColorRow = -1
  let frame = 0
  let baselineShiftPx = 0
  let baselineShiftFor = -1

  // Cursor position is not a usable "has the echo landed" signal: a full-screen TUI
  // repaints and moves the cursor for its own reasons, which would retire the commit
  // while the character is still in flight and blank it again. Ask the buffer whether the
  // committed text is actually painted at the cell it was committed on.
  const isPaintedAt = (at: CursorPosition, text: string): boolean => {
    if (text === "") return false
    const line = terminal.buffer.active.getLine(at.viewportY)
    if (line === null || line === undefined) return false
    let painted = ""
    let column = at.viewportX
    while (painted.length < text.length && column < terminal.cols) {
      const cell = line.getCell(column)
      if (cell === undefined) break
      painted += cell.getChars()
      column += Math.max(1, cell.getWidth())
    }
    return painted.startsWith(text)
  }

  const pendingText = (): string => pendingCommits.map((entry) => entry.text).join("")

  const dropEchoedCommits = (): void => {
    if (pendingCommits.length === 0) return
    const now = performance.now()
    pendingCommits = pendingCommits.filter((entry) => {
      if (isPaintedAt(entry.cell, entry.text)) {
        if (entry.text.trim() !== "") {
          const cell = terminal.buffer.active
            .getLine(entry.cell.viewportY)
            ?.getCell(entry.cell.viewportX)
          if (cell !== undefined) {
            appTextColor = hexColor(cell.getFgColor())
            appTextColorRow = entry.cell.viewportY
          }
        }
        return false
      }
      return now - entry.at <= COMMIT_ECHO_TIMEOUT_MS
    })
  }

  // The UA freezes the composition window against the focused element's box at
  // compositionstart, before any text exists, so the box has to already sit on the caret
  // by then — placing it once composition text arrives is one event too late. Clamped
  // inside the container because iOS scrolls an off-screen focused input into view.
  const pendingOffset = (cell: CellPosition): number => displayColumns(pendingText()) * cell.width

  // Anchored to where the run started, never to the live cursor: the echo of an already
  // delivered syllable moves the cursor away, and following it would both misplace the
  // overlay and hide the fact that the terminal has caught up.
  const anchorPosition = (): CursorPosition | undefined => {
    const first = pendingCommits[0]
    if (first !== undefined) return first.cell
    if (composing && composeCell !== undefined) return composeCell
    return readCursor(terminal)
  }

  const anchorCell = (): CellPosition | undefined => {
    const position = anchorPosition()
    return position === undefined ? undefined : cellAt(terminal, position)
  }

  const positionCaretBox = (): void => {
    const cell = anchorCell()
    const textarea = terminal.textarea
    if (cell === undefined || textarea === undefined) return
    const maxX = Math.max(0, container.clientWidth - 1)
    const maxY = Math.max(0, container.clientHeight - 1)
    textarea.style.left = `${Math.min(Math.max(0, cell.x + pendingOffset(cell)), maxX)}px`
    textarea.style.top = `${Math.min(Math.max(0, cell.y), maxY)}px`
    // macOS reads firstRectForCharacterRange off this box; ghostty's 1x1 default is a
    // degenerate rect the IME cannot hang a window from.
    textarea.style.width = `${cell.width}px`
    textarea.style.height = `${cell.height}px`
    textarea.style.fontSize = `${terminal.options.fontSize}px`
    textarea.style.pointerEvents = "none"
  }

  // ghostty draws each glyph with textBaseline "alphabetic" at cellTop + metrics.baseline,
  // while the browser puts the overlay's baseline wherever the line box lands. Left alone
  // the stand-in sits a few pixels low and the character jumps when the echo takes over.
  const baselineShift = (terminalRef: Terminal, cellHeight: number): number => {
    const target = terminalRef.renderer?.getMetrics()?.baseline
    if (target === undefined) return 0
    if (baselineShiftFor === cellHeight) return baselineShiftPx
    const overlayTop = overlay.getBoundingClientRect().top
    const probeBottom = baselineProbe.getBoundingClientRect().bottom
    if (probeBottom === 0) return baselineShiftPx
    baselineShiftPx = target - (probeBottom - overlayTop)
    baselineShiftFor = cellHeight
    return baselineShiftPx
  }

  const place = (): void => {
    dropEchoedCommits()
    positionCaretBox()
    const cell = anchorCell()
    const text = pendingText() + composingText
    // Some input sources deliver each jamo as plain input as well, so the terminal may have
    // already painted what the overlay is still showing — with its composing underline on
    // top. Retire the stand-in the moment the real cells carry the same text.
    const anchor = anchorPosition()
    if (anchor !== undefined && isPaintedAt(anchor, text)) {
      overlay.hidden = true
      committedGlyphs.textContent = ""
      composingGlyphs.textContent = ""
      return
    }
    if (cell === undefined || text === "") {
      overlay.hidden = true
      committedGlyphs.textContent = ""
      composingGlyphs.textContent = ""
      return
    }
    committedGlyphs.textContent = pendingText()
    composingGlyphs.textContent = composingText
    overlay.style.transform = `translate(${cell.x}px, ${cell.y}px)`
    overlay.style.fontSize = `${terminal.options.fontSize}px`
    overlay.style.lineHeight = `${cell.height}px`
    // The stand-in stands in for terminal output, so it has to use the terminal's own face
    // rather than the UI mono stack, or the covered cell changes shape for a round trip.
    overlay.style.fontFamily = terminal.options.fontFamily ?? ""
    // Measured off native Ghostty: the composing syllable sits on the terminal background
    // with an underline, standing out from whatever colour the app painted the row. The
    // committed run is different — it stands in for output the PTY has not echoed yet, so
    // it copies the covered cell instead and must not look marked at all.
    const position = anchorPosition()
    const colors = position === undefined ? undefined : cellColors(terminal, position)
    const theme = terminal.options.theme
    if (colors !== undefined) {
      committedSpan.style.backgroundColor = colors.background
      committedSpan.style.color =
        anchor !== undefined && appTextColorRow === anchor.viewportY && appTextColor !== undefined
          ? appTextColor
          : colors.foreground
      composingSpan.style.backgroundColor = theme?.background ?? colors.background
      composingSpan.style.color = theme?.foreground ?? colors.foreground
    }
    overlay.hidden = false
    // Measured last: the probe has no box while the overlay is hidden.
    const shift = `${baselineShift(terminal, cell.height)}px`
    committedGlyphs.style.top = shift
    composingGlyphs.style.top = shift
  }

  // onCursorMove does not fire for cursor movement driven by PTY output, so the overlay
  // would sit on a stale cell until the next composition event. Re-place every frame while
  // a composition is open or a commit is still waiting for its echo.
  const trackFrames = (): void => {
    if (!composing && pendingCommits.length === 0) {
      place()
      return
    }
    place()
    frame = requestAnimationFrame(trackFrames)
  }

  const startTracking = (): void => {
    if (trackers.length > 0) return
    trackers = [terminal.onCursorMove(place).dispose, terminal.onScroll(place).dispose]
  }

  const stopTracking = (): void => {
    for (const dispose of trackers) dispose()
    trackers = []
  }

  const onCompositionStart = (): void => {
    composing = true
    lastCompositionAt = performance.now()
    if (pendingCommits.length === 0) composeCell = readCursor(terminal)
    startTracking()
    place()
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(trackFrames)
  }

  const onCompositionUpdate = (event: CompositionEvent): void => {
    if (!composing) return
    lastCompositionAt = performance.now()
    composingText = event.data
    place()
  }

  const onCompositionEnd = (event: CompositionEvent): void => {
    composing = false
    composingText = ""
    composeCell = undefined
    stopTracking()
    lastCompositionAt = performance.now()
    dropEchoedCommits()
    const cursor = readCursor(terminal)
    if (cursor !== undefined && event.data !== "") {
      // The cursor still sits before every un-echoed syllable, so this one will be painted
      // after them: its expected cell is cursor + the columns the queue already covers.
      pendingCommits.push({
        text: event.data,
        cell: {
          viewportX: cursor.viewportX + displayColumns(pendingText()),
          viewportY: cursor.viewportY,
        },
        at: performance.now(),
      })
    }
    place()
    const textarea = terminal.textarea
    if (textarea === undefined) return
    // ghostty never clears the textarea after commit; a growing value drifts
    // the caret rect the candidate window anchors to.
    queueMicrotask(() => {
      textarea.value = ""
    })
  }

  // A space or punctuation key between syllables is sent to the PTY by ghostty but never
  // appears in composition events, so without an entry of its own every later syllable's
  // expected cell is short by its width — the run then mismatches until it expires. Enter
  // and Backspace restructure the line instead, invalidating every expected cell at once.
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === "Enter" || event.key === "Backspace") {
      pendingCommits = []
      appTextColor = undefined
      appTextColorRow = -1
      return
    }
    if (event.key.length !== 1) return
    const inKoreanFlow =
      composing ||
      pendingCommits.length > 0 ||
      performance.now() - lastCompositionAt < PLAIN_TRACK_WINDOW_MS
    if (!inKoreanFlow) return
    dropEchoedCommits()
    const cursor = readCursor(terminal)
    if (cursor === undefined) return
    pendingCommits.push({
      text: event.key,
      cell: {
        viewportX: cursor.viewportX + displayColumns(pendingText()),
        viewportY: cursor.viewportY,
      },
      at: performance.now(),
    })
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(trackFrames)
  }
  container.addEventListener("keydown", onKeydown, { capture: true })

  container.addEventListener("compositionstart", onCompositionStart, { capture: true })
  container.addEventListener("compositionupdate", onCompositionUpdate, { capture: true })
  container.addEventListener("compositionend", onCompositionEnd, { capture: true })

  positionCaretBox()
  const caretTrackers = [
    terminal.onCursorMove(positionCaretBox).dispose,
    terminal.onScroll(positionCaretBox).dispose,
  ]

  return () => {
    container.removeEventListener("keydown", onKeydown, { capture: true })
    container.removeEventListener("compositionstart", onCompositionStart, { capture: true })
    container.removeEventListener("compositionupdate", onCompositionUpdate, { capture: true })
    container.removeEventListener("compositionend", onCompositionEnd, { capture: true })
    for (const dispose of caretTrackers) dispose()
    cancelAnimationFrame(frame)
    stopTracking()
    overlay.remove()
  }
}
