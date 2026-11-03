import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Page } from "playwright"
import type { TerminalApp } from "../src/client/terminal.ts"
import { createUiFixture, openUi, type UiFixture } from "./helpers/ui-browser.ts"

declare global {
  interface Window {
    __wt: TerminalApp
    __resolveFonts: () => void
    __resizeListenerCount: () => number
    __fontTimerCount: () => number
  }
}

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

async function waitForText(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (needle) => {
      const buffer = window.__wt.terminal.buffer.active
      for (let row = 0; row < buffer.length; row++) {
        if (buffer.getLine(row)?.translateToString(true).includes(needle)) return true
      }
      return false
    },
    text,
    { timeout: 2000 },
  )
}

async function waitForSession(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__wt?.connection.sessionId !== undefined)
  return page.evaluate(() => String(window.__wt.connection.sessionId))
}

async function waitForFittedSize(page: Page): Promise<{ cols: number; rows: number }> {
  await page.waitForFunction(
    () => {
      const terminal = window.__wt.terminal
      const metrics = terminal.renderer?.getMetrics()
      const container = document.querySelector(".terminal")
      if (!metrics || !(container instanceof HTMLElement)) return false
      const padding = getComputedStyle(container)
      const width =
        container.clientWidth -
        Number.parseInt(padding.paddingLeft, 10) -
        Number.parseInt(padding.paddingRight, 10) -
        15
      const height =
        container.clientHeight -
        Number.parseInt(padding.paddingTop, 10) -
        Number.parseInt(padding.paddingBottom, 10)
      // Ghostty 0.4 reserves 15px for its scrollbar when fitting the content box.
      return (
        terminal.cols === Math.max(2, Math.floor(width / metrics.width)) &&
        terminal.rows === Math.max(1, Math.floor(height / metrics.height))
      )
    },
    undefined,
    { timeout: 2000 },
  )
  return page.evaluate(() => ({ cols: window.__wt.terminal.cols, rows: window.__wt.terminal.rows }))
}

describe("terminal lifecycle", () => {
  for (const mode of ["desktop", "mobile"] as const) {
    test(`${mode} fits custom font metrics and sends the fitted size to the PTY`, async () => {
      const { context, page } = await openUi(fixture, mode)
      try {
        await waitForSession(page)
        for (const width of mode === "desktop" ? [1280, 1024] : [375, 240]) {
          await page.setViewportSize({ width, height: mode === "desktop" ? 1000 : 844 })
          const size = await waitForFittedSize(page)
          await page.evaluate(() => window.__wt.sendKeys("printf 'GRID:'; stty size\r"))
          await waitForText(page, `GRID:${size.rows} ${size.cols}`)
        }
        const before = await page.evaluate(() => {
          const container = document.querySelector(".terminal")
          if (!(container instanceof HTMLElement)) throw new Error("missing terminal")
          container.style.display = "none"
          window.__wt.fit()
          return { cols: window.__wt.terminal.cols, rows: window.__wt.terminal.rows }
        })
        await page.evaluate(() => {
          const container = document.querySelector(".terminal")
          if (!(container instanceof HTMLElement)) throw new Error("missing terminal")
          container.style.display = ""
          window.__wt.fit()
        })
        expect(
          await page.evaluate(() => ({
            cols: window.__wt.terminal.cols,
            rows: window.__wt.terminal.rows,
          })),
        ).toEqual(before)
      } finally {
        await context.close()
      }
    })
  }

  test("an initially hidden terminal fits when its container becomes visible", async () => {
    const context = await fixture.browser.newContext({ viewport: { width: 1024, height: 844 } })
    try {
      const page = await context.newPage()
      await page.goto(fixture.base)
      const hidden = await page.addStyleTag({ content: ".terminal { display: none !important; }" })
      await page.locator("#password").fill("qa-password-123")
      await page.locator('button[type="submit"]').click()
      await waitForSession(page)
      expect(
        await page.evaluate(() => ({
          cols: window.__wt.terminal.cols,
          rows: window.__wt.terminal.rows,
        })),
      ).toEqual({ cols: 80, rows: 24 })
      await hidden.evaluate((element) => element.parentNode?.removeChild(element))
      const size = await waitForFittedSize(page)
      await page.evaluate(() => window.__wt.sendKeys("printf 'VISIBLE:'; stty size\r"))
      await waitForText(page, `VISIBLE:${size.rows} ${size.cols}`)
    } finally {
      await context.close()
    }
  })

  test("raw input and IME reach a real shell, then Enter restarts an exited session", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const previous = await waitForSession(page)
      await page.locator(".terminal textarea").focus()
      await page.keyboard.type("stty -echo; cat")
      await page.keyboard.press("Enter")
      await page.evaluate(() => {
        const textarea = window.__wt.terminal.textarea
        if (!textarea) throw new Error("missing terminal textarea")
        textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
        textarea.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "한글🙂" }),
        )
      })
      await page.keyboard.press("Enter")
      await waitForText(page, "한글🙂")
      await page.keyboard.press("Control+c")
      await page.keyboard.type("exit 0")
      await page.keyboard.press("Enter")
      await waitForText(page, "session exited: 0")
      await page.keyboard.press("Enter")
      await page.waitForFunction((old) => {
        const session = window.__wt.connection.sessionId
        return session !== undefined && session !== old
      }, previous)
      await page.keyboard.type("echo restarted-$((6*7))")
      await page.keyboard.press("Enter")
      await waitForText(page, "restarted-42")
    } finally {
      await context.close()
    }
  })

  test("a new browser connection resumes the session and replays detached output", async () => {
    const { context, page } = await openUi(fixture, "desktop")
    const session = await waitForSession(page)
    const state = await context.storageState()
    await page.evaluate(() => window.__wt.sendKeys("sleep 0.3; echo replay-$((6*7))\r"))
    await context.close()
    const resumed = await fixture.browser.newContext({ storageState: state })
    try {
      const next = await resumed.newPage()
      await next.goto(fixture.base)
      expect(await waitForSession(next)).toBe(session)
      await waitForText(next, "replay-42")
    } finally {
      await resumed.close()
    }
  })

  test("touch scrolling, pinch zoom, and mouse reports retain their terminal hooks", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const gestures = await page.evaluate(() => {
        const container = document.querySelector(".terminal")
        if (!(container instanceof HTMLElement)) throw new Error("missing terminal")
        const deltas: number[] = []
        container.addEventListener("wheel", (event) => deltas.push(event.deltaY), { capture: true })
        const touch = (identifier: number, clientX: number, clientY: number) =>
          new Touch({ identifier, target: container, clientX, clientY })
        const dispatch = (type: string, touches: Touch[]) =>
          container.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches,
              changedTouches: touches,
            }),
          )
        dispatch("touchstart", [touch(0, 50, 200)])
        dispatch("touchmove", [touch(0, 50, 150)])
        dispatch("touchend", [])
        const before = window.__wt.terminal.options.fontSize
        dispatch("touchstart", [touch(0, 50, 150), touch(1, 150, 150)])
        dispatch("touchmove", [touch(0, 25, 150), touch(1, 175, 150)])
        dispatch("touchend", [])
        return { deltas, before, after: window.__wt.terminal.options.fontSize }
      })
      expect(gestures.deltas).toEqual([100])
      expect(gestures.after).toBeGreaterThan(gestures.before)

      await page.evaluate(() => window.__wt.terminal.write("\u001b[?1000h\u001b[?1006h"))
      await page.waitForFunction(() => window.__wt.terminal.hasMouseTracking())
      const reports = await page.evaluate(() => {
        const app = window.__wt
        const original = app.connection.sendInput.bind(app.connection)
        const sent: string[] = []
        app.connection.sendInput = (data) => {
          sent.push(data)
          original(data)
        }
        const container = document.querySelector(".terminal")
        if (!(container instanceof HTMLElement)) throw new Error("missing terminal")
        const rect = container.getBoundingClientRect()
        for (const type of ["mousedown", "mouseup"]) {
          container.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              button: 0,
              clientX: rect.left + 20,
              clientY: rect.top + 20,
            }),
          )
        }
        return sent
      })
      expect(reports).toHaveLength(2)
      expect(reports.map((report) => report.charCodeAt(0))).toEqual([27, 27])
      expect(reports[0]?.slice(1)).toMatch(/^\[<0;\d+;\d+M$/)
      expect(reports[1]?.slice(1)).toMatch(/^\[<0;\d+;\d+m$/)
    } finally {
      await context.close()
    }
  })

  for (const fontsReadyBeforeDispose of [false, true]) {
    test(`dispose cancels resize work with font readiness ${fontsReadyBeforeDispose ? "before" : "after"} disposal`, async () => {
      const { context, page } = await openUi(fixture, "desktop", undefined, async (target) => {
        await target.addInitScript(() => {
          const listeners = new Set<EventListenerOrEventListenerObject>()
          const add = EventTarget.prototype.addEventListener
          const remove = EventTarget.prototype.removeEventListener
          EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (this === window && type === "resize" && listener) listeners.add(listener)
            if (listener) add.call(this, type, listener, options)
          }
          EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (this === window && type === "resize" && listener) listeners.delete(listener)
            if (listener) remove.call(this, type, listener, options)
          }
          const fontTimers = new Set<number>()
          const schedule = window.setTimeout.bind(window)
          const cancel = window.clearTimeout.bind(window)
          Reflect.set(
            window,
            "setTimeout",
            (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
              const timer = schedule(handler, timeout, ...args)
              if (timeout === 120) fontTimers.add(timer)
              return timer
            },
          )
          Reflect.set(window, "clearTimeout", (timer?: number) => {
            if (timer !== undefined) fontTimers.delete(timer)
            cancel(timer)
          })
          Reflect.defineProperty(document.fonts, "ready", {
            value: new Promise<FontFaceSet>((resolve) => {
              window.__resolveFonts = () => resolve(document.fonts)
            }),
          })
          window.__resizeListenerCount = () => listeners.size
          window.__fontTimerCount = () => fontTimers.size
        })
      })
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      try {
        if (fontsReadyBeforeDispose) {
          await page.evaluate(() => window.__resolveFonts())
          await page.waitForFunction(() => window.__fontTimerCount() === 1)
        }
        const before = await page.evaluate(() => window.__resizeListenerCount())
        const after = await page.evaluate(() => {
          window.__wt.dispose()
          window.__wt.dispose()
          window.__resolveFonts()
          window.dispatchEvent(new Event("resize"))
          window.__wt.fit()
          return window.__resizeListenerCount()
        })
        await page.waitForTimeout(250)
        expect(after).toBe(before - 1)
        expect(await page.evaluate(() => window.__fontTimerCount())).toBe(0)
        expect(await page.locator(".terminal canvas").count()).toBe(0)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
})
