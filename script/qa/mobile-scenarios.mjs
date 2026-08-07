// Real-surface QA driver for the Termius-grade mobile criteria:
// M1 iOS Korean composes via delete+reinsert, M2 hold-repeat survives finger
// drift, M3 the shell rides the virtual keyboard's top edge, M4 shift latch
// sends shifted keys, M5 pinch-to-zoom changes font size.
// Usage: node script/qa/mobile-scenarios.mjs --base http://127.0.0.1:7822 --password qa-password-123 --evidence qa-evidence

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7822")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence", "qa-evidence")
mkdirSync(evidenceDir, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

async function newMobilePage(browser, initScript) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  })
  const page = await context.newPage()
  if (initScript !== undefined) await page.addInitScript(initScript)
  await page.goto(base)
  await page.fill("#password", password)
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(2000)
  return { context, page }
}

async function armSendSpy(page) {
  await page.evaluate(() => {
    const connection = globalThis.__wt.connection
    globalThis.__sent = []
    const original = connection.sendInput.bind(connection)
    connection.sendInput = (data) => {
      globalThis.__sent.push(data)
      return original(data)
    }
  })
}

async function run() {
  const browser = await chromium.launch()

  // ---- M1: iOS Korean delete+reinsert composition ----
  {
    const { context, page } = await newMobilePage(browser)
    await page.evaluate(() => globalThis.__wt.terminal.textarea?.focus())
    await armSendSpy(page)
    await page.evaluate(() => {
      const textarea = globalThis.__wt.terminal.textarea
      const fire = (inputType, data) => {
        textarea.dispatchEvent(
          new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }),
        )
      }
      // The exact event stream the iOS Korean keyboard emits for ㅎ->하->한.
      fire("insertText", "ㅎ")
      fire("deleteContentBackward", null)
      fire("insertText", "하")
      fire("deleteContentBackward", null)
      fire("insertText", "한")
    })
    const sent = await page.evaluate(() => globalThis.__sent)
    const expected = ["ㅎ", "\u007f", "하", "\u007f", "한"]
    const pass = JSON.stringify(sent) === JSON.stringify(expected)
    record(
      "M1 iOS Korean composes via delete+reinsert",
      pass,
      `sent=${JSON.stringify(sent)} expected=${JSON.stringify(expected)}`,
    )
    await context.close()
  }

  // ---- M2: hold-repeat survives finger drift ----
  {
    const { context, page } = await newMobilePage(browser)
    await armSendSpy(page)
    const counts = await page.evaluate(async () => {
      const cap = document.querySelector('[data-key="up"]')
      const rect = cap.getBoundingClientRect()
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      const opts = {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      }
      cap.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: cx, clientY: cy }))
      globalThis.__sent.length = 0
      // Finger drift: the browser reports the pointer leaving the cap's bounds.
      cap.dispatchEvent(
        new PointerEvent("pointermove", { ...opts, clientX: cx + 30, clientY: cy - 30 }),
      )
      cap.dispatchEvent(
        new PointerEvent("pointerleave", { ...opts, clientX: cx + 30, clientY: cy - 30 }),
      )
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
      const afterDrift = globalThis.__sent.filter((d) => d === "\u001b[A").length
      cap.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: cx, clientY: cy }))
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
      const afterUp = globalThis.__sent.filter((d) => d === "\u001b[A").length
      return { afterDrift, afterUp }
    })
    const pass = counts.afterDrift >= 4 && counts.afterUp - counts.afterDrift <= 2
    record(
      "M2 hold-repeat survives drift and stops on release",
      pass,
      `repeats after drift=${counts.afterDrift} (need >=4); extra after release=${counts.afterUp - counts.afterDrift} (cap 2)`,
    )
    await context.close()
  }

  // ---- M3: shell rides the virtual keyboard ----
  {
    const { context, page } = await newMobilePage(browser, () => {
      class FakeViewport extends EventTarget {
        height = window.innerHeight
        width = window.innerWidth
        offsetTop = 0
        offsetLeft = 0
        scale = 1
        pageTop = 0
        pageLeft = 0
      }
      const stub = new FakeViewport()
      Object.defineProperty(window, "visualViewport", { value: stub, configurable: true })
      globalThis.__vvStub = stub
    })
    const before = await page.evaluate(() => ({
      rows: globalThis.__wt.terminal.rows,
      shellH: document.querySelector(".shell")?.getBoundingClientRect().height,
    }))
    await page.evaluate(() => {
      const stub = globalThis.__vvStub
      stub.height = 470
      stub.dispatchEvent(new Event("resize"))
    })
    await page.waitForTimeout(1200)
    const after = await page.evaluate(() => ({
      rows: globalThis.__wt.terminal.rows,
      shellH: document.querySelector(".shell")?.getBoundingClientRect().height,
      toolbarBottom: document.querySelector(".keybar")?.closest(".stack")?.getBoundingClientRect()
        .bottom,
    }))
    const pass =
      Math.abs((after.shellH ?? 0) - 470) <= 1 &&
      after.rows < before.rows &&
      Math.abs((after.toolbarBottom ?? 0) - 470) <= 2
    record(
      "M3 shell rides the virtual keyboard top edge",
      pass,
      `shellH ${before.shellH}->${after.shellH} (want 470) rows ${before.rows}->${after.rows} toolbarBottom=${after.toolbarBottom}`,
    )
    await page.screenshot({ path: join(evidenceDir, "m3-keyboard-resize.png") })
    await context.close()
  }

  // ---- M4: shift latch sends shifted keys ----
  {
    const { context, page } = await newMobilePage(browser)
    await armSendSpy(page)
    const shiftCap = await page.locator('[data-key="shift"]').count()
    if (shiftCap === 0) {
      record("M4 shift latch sends shifted keys", false, "no shift cap in the keybar")
    } else {
      const tapKey = (key) =>
        page.evaluate((id) => {
          const cap = document.querySelector(`[data-key="${id}"]`)
          const rect = cap.getBoundingClientRect()
          cap.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 3,
              pointerType: "touch",
              isPrimary: true,
              bubbles: true,
              cancelable: true,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
            }),
          )
          cap.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 3,
              pointerType: "touch",
              isPrimary: true,
              bubbles: true,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
            }),
          )
        }, key)
      await tapKey("shift")
      await tapKey("tab")
      await tapKey("shift")
      await tapKey("up")
      const sent = await page.evaluate(() => globalThis.__sent)
      const pass = sent.includes("\u001b[Z") && sent.includes("\u001b[1;2A")
      record(
        "M4 shift latch sends shifted keys",
        pass,
        `sent=${JSON.stringify(sent)} (want \\x1b[Z and \\x1b[1;2A)`,
      )
    }
    await context.close()
  }

  // ---- M5: pinch-to-zoom font size ----
  {
    const { context, page } = await newMobilePage(browser)
    const result = await page.evaluate(async () => {
      const terminal = globalThis.__wt.terminal
      const container = document.querySelector(".terminal")
      const before = terminal.options.fontSize
      const mk = (id, x, y) =>
        new Touch({ identifier: id, target: container, clientX: x, clientY: y })
      const fire = (type, touches) => {
        container.dispatchEvent(
          new TouchEvent(type, {
            touches,
            changedTouches: touches,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
      fire("touchstart", [mk(1, 150, 300), mk(2, 250, 300)])
      for (let gap = 100; gap <= 220; gap += 20) {
        fire("touchmove", [mk(1, 200 - gap / 2, 300), mk(2, 200 + gap / 2, 300)])
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 30))
      }
      fire("touchend", [])
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
      return { before, after: terminal.options.fontSize }
    })
    const pass = result.after > result.before && result.after <= 24
    record(
      "M5 pinch-to-zoom grows font size",
      pass,
      `fontSize ${result.before} -> ${result.after} (want increase, cap 24)`,
    )
    await page.screenshot({ path: join(evidenceDir, "m5-pinch-zoom.png") })
    await context.close()
  }

  // ---- P1: toolbar paste is bracketed-paste aware ----
  {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      permissions: ["clipboard-read", "clipboard-write"],
    })
    const page = await context.newPage()
    await page.goto(base)
    await page.fill("#password", password)
    await page.click("button[type=submit]")
    await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    await page.waitForTimeout(2000)
    await armSendSpy(page)
    await page.evaluate(async () => {
      // Simulate a full-screen app arming bracketed paste, then a keybar paste.
      globalThis.__wt.terminal.write("\u001b[?2004h")
      await navigator.clipboard.writeText("line1\nline2")
      globalThis.__sent.length = 0
      const cap = document.querySelector('[data-key="paste"]')
      const rect = cap.getBoundingClientRect()
      const opts = {
        pointerId: 5,
        pointerType: "touch",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2,
      }
      cap.dispatchEvent(new PointerEvent("pointerdown", opts))
      cap.dispatchEvent(new PointerEvent("pointerup", opts))
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 400))
    })
    const sent = await page.evaluate(() => globalThis.__sent.join(""))
    const pass = sent === "\u001b[200~line1\nline2\u001b[201~"
    record(
      "P1 keybar paste wraps in bracketed paste",
      pass,
      `pty received ${JSON.stringify(sent)} (want ESC[200~..ESC[201~ wrapping)`,
    )
    await context.close()
  }

  // ---- P2: desktop copy-on-select puts the selection on the clipboard ----
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["clipboard-read", "clipboard-write"],
    })
    const page = await context.newPage()
    await page.goto(base)
    await page.fill("#password", password)
    await page.click("button[type=submit]")
    await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    await page.waitForTimeout(2000)
    await page.click(".terminal")
    await page.keyboard.type("echo copy-target-42")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(1200)
    await page.evaluate(() => navigator.clipboard.writeText(""))
    const found = await page.evaluate(async () => {
      const canvas = document.querySelector(".terminal canvas")
      const t = globalThis.__wt.terminal
      const metrics = t.renderer.getMetrics()
      const rect = canvas.getBoundingClientRect()
      // Find the row that echoed the marker so the drag has a real target.
      const buffer = t.buffer.active
      let row = -1
      for (let y = 0; y < buffer.length; y++) {
        const text = buffer.getLine(y)?.translateToString(true) ?? ""
        if (text.startsWith("copy-target-42")) row = y
      }
      if (row === -1) return { row: -1 }
      const viewportRow = row - t.viewportY
      const y = rect.y + (viewportRow + 0.5) * metrics.height
      const x0 = rect.x + 0.2 * metrics.width
      const x1 = rect.x + 13.8 * metrics.width
      const fire = (type, x) =>
        canvas.dispatchEvent(
          new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }),
        )
      fire("mousedown", x0)
      for (let step = 1; step <= 6; step++) fire("mousemove", x0 + ((x1 - x0) * step) / 6)
      fire("mouseup", x1)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
      return { row, selection: t.getSelection(), clip: await navigator.clipboard.readText() }
    })
    const pass = found.row !== -1 && (found.clip ?? "").includes("copy-target-42")
    record(
      "P2 desktop copy-on-select reaches the clipboard",
      pass,
      `row=${found.row} selection=${JSON.stringify(found.selection)} clipboard=${JSON.stringify(found.clip)}`,
    )
    await context.close()
  }

  // ---- P3: mobile long-press drag selects and copies ----
  {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      permissions: ["clipboard-read", "clipboard-write"],
    })
    const page = await context.newPage()
    await page.goto(base)
    await page.fill("#password", password)
    await page.click("button[type=submit]")
    await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    await page.waitForTimeout(2000)
    await page.evaluate(() => globalThis.__wt.terminal.textarea?.focus())
    await page.evaluate(() => {
      globalThis.__wt.connection.sendInput("echo grab-me-7\r")
    })
    await page.waitForTimeout(1200)
    await page.evaluate(() => navigator.clipboard.writeText(""))
    const result = await page.evaluate(async () => {
      const container = document.querySelector(".terminal")
      const canvas = container.querySelector("canvas")
      const t = globalThis.__wt.terminal
      const metrics = t.renderer.getMetrics()
      const rect = canvas.getBoundingClientRect()
      const buffer = t.buffer.active
      let row = -1
      for (let y = 0; y < buffer.length; y++) {
        const text = buffer.getLine(y)?.translateToString(true) ?? ""
        if (text.startsWith("grab-me-7")) row = y
      }
      if (row === -1) return { row: -1 }
      const viewportRow = row - t.viewportY
      const y = rect.y + (viewportRow + 0.5) * metrics.height
      const x0 = rect.x + 0.2 * metrics.width
      const x1 = rect.x + 8.8 * metrics.width
      const mk = (x) => new Touch({ identifier: 9, target: container, clientX: x, clientY: y })
      const fire = (type, touches) =>
        container.dispatchEvent(
          new TouchEvent(type, {
            touches,
            changedTouches: touches.length > 0 ? touches : [mk(x1)],
            bubbles: true,
            cancelable: true,
          }),
        )
      const scrollBefore = t.viewportY
      fire("touchstart", [mk(x0)])
      // Long-press dwell: no movement until the selection timer arms.
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 550))
      for (let step = 1; step <= 6; step++) fire("touchmove", [mk(x0 + ((x1 - x0) * step) / 6)])
      fire("touchend", [])
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 400))
      return {
        row,
        selection: t.getSelection(),
        clip: await navigator.clipboard.readText(),
        scrolled: t.viewportY !== scrollBefore,
      }
    })
    const pass = result.row !== -1 && (result.clip ?? "").includes("grab-me-7") && !result.scrolled
    record(
      "P3 long-press drag selects and copies on mobile",
      pass,
      `row=${result.row} selection=${JSON.stringify(result.selection)} clipboard=${JSON.stringify(result.clip)} scrolled=${result.scrolled}`,
    )
    await context.close()
  }

  // ---- K1: pinch-zoomed font size survives reload (Termius behavior) ----
  {
    const { context, page } = await newMobilePage(browser)
    const pinched = await page.evaluate(async () => {
      const container = document.querySelector(".terminal")
      const mk = (id, x, y) =>
        new Touch({ identifier: id, target: container, clientX: x, clientY: y })
      container.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [mk(1, 150, 350), mk(2, 230, 350)],
          bubbles: true,
          cancelable: true,
        }),
      )
      container.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [mk(1, 110, 350), mk(2, 270, 350)],
          bubbles: true,
          cancelable: true,
        }),
      )
      container.dispatchEvent(
        new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true }),
      )
      await new Promise((r) => setTimeout(r, 300))
      return globalThis.__wt.terminal.options.fontSize
    })
    await page.reload()
    // The auth cookie survives reload: land directly on the app, log in only if asked.
    await page.waitForSelector(".terminal canvas, #password", { timeout: 15000 })
    if ((await page.locator("#password").count()) > 0) {
      await page.fill("#password", password)
      await page.click("button[type=submit]")
      await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    }
    await page.waitForTimeout(2000)
    const restored = await page.evaluate(() => globalThis.__wt.terminal.options.fontSize)
    record(
      "K1 pinched font size persists across reload",
      pinched > 14 && restored === pinched,
      `pinched=${pinched} afterReload=${restored}`,
    )
    await context.close()
  }

  // ---- K2: keybar has a keyboard-dismiss control that blurs the input ----
  {
    const { context, page } = await newMobilePage(browser)
    await page.evaluate(() => globalThis.__wt.terminal.textarea?.focus())
    const focusedBefore = await page.evaluate(
      () => document.activeElement === document.querySelector(".terminal textarea"),
    )
    const tap = (key) =>
      page.evaluate((id) => {
        const cap = document.querySelector(`[data-key="${id}"]`)
        if (cap === null) return false
        const rect = cap.getBoundingClientRect()
        const opts = {
          pointerId: 4,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        }
        cap.dispatchEvent(new PointerEvent("pointerdown", opts))
        cap.dispatchEvent(new PointerEvent("pointerup", opts))
        return true
      }, key)
    const exists = await tap("kbd-hide")
    await page.waitForTimeout(300)
    const blurredAfter = await page.evaluate(
      () => document.activeElement !== document.querySelector(".terminal textarea"),
    )
    record(
      "K2 keybar hides the virtual keyboard on demand",
      exists && focusedBefore && blurredAfter,
      `hide key exists=${exists} focusedBefore=${focusedBefore} blurredAfter=${blurredAfter}`,
    )
    await context.close()
  }

  // ---- T2: panel lists scroll with a native touch drag (CDP input pipeline) ----
  {
    const { context, page } = await newMobilePage(browser)
    const buttons = await page.locator("header button, .topbar button").all()
    for (const btn of buttons) {
      const label = await btn.getAttribute("aria-label")
      if (label?.toLowerCase().includes("panel") || label?.toLowerCase().includes("menu")) {
        await btn.tap()
        break
      }
    }
    await page.waitForTimeout(700)
    await page.getByRole("tab", { name: "Files" }).tap()
    await page.waitForTimeout(1500)
    const cdp = await context.newCDPSession(page)
    const scroller = () =>
      page.evaluate(() => {
        const bodies = [...document.querySelectorAll(".scroll-body")]
        const body = bodies.find((el) => el.scrollHeight > el.clientHeight)
        if (body === undefined) return null
        const rect = body.getBoundingClientRect()
        return {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          scrollTop: body.scrollTop,
        }
      })
    const start = await scroller()
    if (start === null) {
      record("T2 panel scrolls on native touch drag", false, "no overflowing panel scroller")
    } else {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start.x, y: start.y }],
      })
      for (let step = 1; step <= 6; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x, y: start.y - step * 30 }],
        })
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await page.waitForTimeout(500)
      const end = await scroller()
      record(
        "T2 panel scrolls on native touch drag",
        end !== null && end.scrollTop > start.scrollTop,
        `scrollTop ${start.scrollTop} -> ${end?.scrollTop}`,
      )
    }
    await context.close()
  }

  // ---- T3: drag-scroll never summons the keyboard; a tap does ----
  {
    const { context, page } = await newMobilePage(browser)
    const result = await page.evaluate(async () => {
      const textarea = document.querySelector(".terminal textarea")
      if (document.activeElement === textarea) textarea.blur()
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
      const container = document.querySelector(".terminal")
      const canvas = container.querySelector("canvas")
      const mk = (y) => new Touch({ identifier: 8, target: canvas, clientX: 180, clientY: y })
      const fire = (type, y) =>
        canvas.dispatchEvent(
          new TouchEvent(type, {
            touches: type === "touchend" ? [] : [mk(y)],
            changedTouches: [mk(y)],
            bubbles: true,
            cancelable: true,
          }),
        )
      fire("touchstart", 400)
      for (let step = 1; step <= 5; step++) fire("touchmove", 400 - step * 15)
      fire("touchend", 325)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
      const focusAfterDrag = document.activeElement === textarea
      fire("touchstart", 400)
      fire("touchend", 400)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
      const focusAfterTap = document.activeElement === textarea
      return { focusAfterDrag, focusAfterTap }
    })
    record(
      "T3 drag keeps keyboard down, tap raises it",
      !result.focusAfterDrag && result.focusAfterTap,
      `focus after drag=${result.focusAfterDrag} (want false), after tap=${result.focusAfterTap} (want true)`,
    )
    await context.close()
  }

  await browser.close()
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} scenarios passed`)
  process.exit(passed === results.length ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
