/**
 * Single-finger drag scrolling for touch devices. The browser sees
 * `touch-action: none` on the terminal region, so drags are translated here into
 * pixel WheelEvents, which the terminal's own wheel handler consumes (including
 * alt-screen arrow-key emulation). Taps pass through untouched so tap-to-focus
 * and IME still work.
 */

const DRAG_SLOP_PX = 8
const SCROLL_MULTIPLIER = 2
const LONG_PRESS_MS = 450

export type TouchScrollOptions = {
  readonly onTap?: () => void
  /** Mouse-aware input owns touch gestures while a TUI has tracking enabled. */
  readonly isMouseTracking?: () => boolean
  /** Long-press hands the rest of the gesture to selection instead of scroll. */
  readonly onSelectStart?: (x: number, y: number) => void
  readonly onSelectMove?: (x: number, y: number) => void
  readonly onSelectEnd?: () => void
}

export function attachTouchScroll(
  container: HTMLElement,
  options: TouchScrollOptions = {},
): () => void {
  let lastY: number | undefined
  let dragging = false
  let selecting = false
  let longPressTimer: ReturnType<typeof setTimeout> | undefined

  const cancelLongPress = (): void => {
    if (longPressTimer !== undefined) clearTimeout(longPressTimer)
    longPressTimer = undefined
  }

  const onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) {
      lastY = undefined
      dragging = false
      cancelLongPress()
      return
    }
    const touch = event.touches[0]
    lastY = touch?.clientY
    dragging = false
    if (
      touch !== undefined &&
      options.onSelectStart !== undefined &&
      options.isMouseTracking?.() !== true
    ) {
      const { clientX, clientY } = touch
      longPressTimer = setTimeout(() => {
        longPressTimer = undefined
        selecting = true
        options.onSelectStart?.(clientX, clientY)
      }, LONG_PRESS_MS)
    }
  }

  const onTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0]
    if (touch === undefined || lastY === undefined) return
    if (selecting) {
      event.preventDefault()
      options.onSelectMove?.(touch.clientX, touch.clientY)
      return
    }
    const deltaY = lastY - touch.clientY
    if (!dragging && Math.abs(deltaY) < DRAG_SLOP_PX) return
    cancelLongPress()
    dragging = true
    lastY = touch.clientY
    if (options.isMouseTracking?.() === true) return
    event.preventDefault()
    container.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: deltaY * SCROLL_MULTIPLIER,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  const onTouchEnd = (event: TouchEvent): void => {
    cancelLongPress()
    if (selecting) {
      selecting = false
      options.onSelectEnd?.()
      event.stopPropagation()
      lastY = undefined
      dragging = false
      return
    }
    // ghostty's canvas touchend focuses the input on EVERY touch, so a scroll
    // flick would summon the keyboard; swallow the event for drags, let taps
    // through (tap-to-focus is onTap's job).
    if (dragging) event.stopPropagation()
    if (!dragging && lastY !== undefined) options.onTap?.()
    lastY = undefined
    dragging = false
  }

  // Capture phase: run before ghostty's canvas-level touch handlers so a drag
  // can stop the event from ever reaching them.
  container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
  container.addEventListener("touchmove", onTouchMove, { capture: true, passive: false })
  container.addEventListener("touchend", onTouchEnd, { capture: true, passive: false })
  container.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: false })
  return () => {
    container.removeEventListener("touchstart", onTouchStart, { capture: true })
    container.removeEventListener("touchmove", onTouchMove, { capture: true })
    container.removeEventListener("touchend", onTouchEnd, { capture: true })
    container.removeEventListener("touchcancel", onTouchEnd, { capture: true })
  }
}
