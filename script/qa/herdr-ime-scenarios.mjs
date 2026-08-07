// Real-surface QA driver: H1/H2 herdr-connected-by-default, I1/I2/I3 inline IME preedit.
// Usage: node script/qa/herdr-ime-scenarios.mjs --base http://127.0.0.1:7821 --password qa-password-123 --evidence qa-evidence

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7821")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence", "qa-evidence")
mkdirSync(evidenceDir, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

async function login(page) {
  await page.goto(base)
  await page.fill("#password", password)
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
}

// Drives a composition session through the same events the UA emits, on the
// element ghostty focuses. Neither our listeners nor ghostty's check isTrusted.
async function compose(page, steps, commit) {
  await page.evaluate(
    ({ steps, commit }) => {
      const textarea = globalThis.__wt.terminal.textarea
      const fire = (type, data) => {
        textarea.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }))
      }
      fire("compositionstart", "")
      for (const step of steps) fire("compositionupdate", step)
      if (commit !== null) fire("compositionend", commit)
    },
    { steps, commit },
  )
}

async function run() {
  const browser = await chromium.launch()

  // ---- H1: herdr polls on open with zero interaction ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const snapshotWait = page
      .waitForResponse((r) => r.url().includes("/api/herdr/snapshot"), { timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    await login(page)
    const polled = await snapshotWait
    const indicator = await page.evaluate(() => {
      const node = document.querySelector(".tabstrip .tab .dot")
      return node === null ? null : node.dataset.state
    })
    record(
      "H1 herdr connected on open",
      polled && indicator !== null,
      `snapshot request without interaction=${polled}; tab dot state=${indicator}`,
    )
    await page.screenshot({ path: join(evidenceDir, "h1-herdr-default.png") })
    await page.close()
  }

  // ---- H2: unavailable herdr degrades to a state, not an error wall ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.route("**/api/herdr/snapshot", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ status: "unavailable", reason: "socket_missing" }),
      }),
    )
    const requests = []
    page.on("request", (r) => {
      if (r.url().includes("/api/herdr/snapshot")) requests.push(Date.now())
    })
    await login(page)
    await page.waitForFunction(
      () => document.querySelector(".tabstrip .tab .dot")?.dataset.state === "offline",
      undefined,
      { timeout: 10000 },
    )
    await page.click(".tabstrip .tab:nth-child(2)")
    const panelText = await page.textContent("#sidebar-panel")
    const toasts = await page.locator(".toast").count()
    const unavailable = panelText?.includes("herdr is unavailable.") ?? false
    record(
      "H2 herdr unavailable is a state",
      unavailable && toasts === 0,
      `empty-state=${unavailable}; toasts=${toasts}; requests so far=${requests.length}`,
    )
    // Backoff: a flat 5s cadence would issue 6+ requests in 30s.
    await page.waitForTimeout(20000)
    const total = requests.length
    record("H2b herdr backoff engaged", total <= 5, `${total} snapshot requests in ~25s (cap 5)`)
    await page.close()
  }

  // ---- H3: clicking a panel workspace row focuses that herdr workspace ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const snapshotOf = () =>
      page.evaluate(async () => {
        const res = await fetch("/api/herdr/snapshot")
        const data = await res.json()
        const workspaces = data.snapshot?.workspaces ?? []
        return workspaces.map((w) => ({ id: w.workspace_id, focused: w.focused }))
      })
    await login(page)
    await page.waitForSelector("[data-workspace]", { timeout: 10000 })
    const before = await snapshotOf()
    const original = before.find((w) => w.focused)
    const target = before.find((w) => !w.focused)
    if (original === undefined || target === undefined) {
      record("H3 workspace row click focuses workspace", false, "need 2+ workspaces to test")
    } else {
      await page.click(`[data-workspace="${target.id}"]`)
      await page.waitForFunction(
        async (id) => {
          const res = await fetch("/api/herdr/snapshot")
          const data = await res.json()
          return (
            (data.snapshot?.workspaces ?? []).find((w) => w.workspace_id === id)?.focused === true
          )
        },
        target.id,
        { timeout: 8000, polling: 500 },
      )
      // Restore the user's original focus through the same surface being tested.
      await page.waitForSelector(`[data-workspace="${original.id}"]`, { timeout: 8000 })
      await page.click(`[data-workspace="${original.id}"]`)
      await page.waitForFunction(
        async (id) => {
          const res = await fetch("/api/herdr/snapshot")
          const data = await res.json()
          return (
            (data.snapshot?.workspaces ?? []).find((w) => w.workspace_id === id)?.focused === true
          )
        },
        original.id,
        { timeout: 8000, polling: 500 },
      )
      record(
        "H3 workspace row click focuses workspace",
        true,
        `focused ${original.id} -> ${target.id} -> restored ${original.id}`,
      )
    }
    await page.close()
  }

  // ---- H4: tab rows render under workspaces and clicking focuses that tab ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await login(page)
    await page.waitForSelector("[data-tab]", { timeout: 10000 })
    const tabs = await page.evaluate(async () => {
      const res = await fetch("/api/herdr/snapshot")
      const data = await res.json()
      return (data.snapshot?.tabs ?? []).map((t) => ({ id: t.tab_id, focused: t.focused }))
    })
    const original = tabs.find((t) => t.focused)
    const target = tabs.find((t) => !t.focused)
    if (original === undefined || target === undefined) {
      record("H4 tab row click focuses tab", false, "need 2+ tabs to test")
    } else {
      await page.click(`[data-tab="${target.id}"]`)
      await page.waitForFunction(
        async (id) => {
          const res = await fetch("/api/herdr/snapshot")
          const data = await res.json()
          return (data.snapshot?.tabs ?? []).find((t) => t.tab_id === id)?.focused === true
        },
        target.id,
        { timeout: 8000, polling: 500 },
      )
      await page.waitForSelector(`[data-tab="${original.id}"]`, { timeout: 8000 })
      await page.click(`[data-tab="${original.id}"]`)
      await page.waitForFunction(
        async (id) => {
          const res = await fetch("/api/herdr/snapshot")
          const data = await res.json()
          return (data.snapshot?.tabs ?? []).find((t) => t.tab_id === id)?.focused === true
        },
        original.id,
        { timeout: 8000, polling: 500 },
      )
      record("H4 tab row click focuses tab", true, `tab ${original.id} -> ${target.id} -> restored`)
    }
    await page.close()
  }

  // ---- I1/I2/I3: inline preedit at the cursor ----
  for (const profile of ["desktop", "mobile"]) {
    const context =
      profile === "mobile"
        ? await browser.newContext({
            ...devices["iPhone 13"],
            viewport: { width: 375, height: 812 },
            hasTouch: true,
          })
        : await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await login(page)
    await page.waitForTimeout(1500)
    await page.evaluate(() => globalThis.__wt.terminal.textarea?.focus())

    // Count every byte the app sends, so mid-composition silence is provable.
    await page.evaluate(() => {
      const connection = globalThis.__wt.connection
      globalThis.__sent = []
      const original = connection.sendInput.bind(connection)
      connection.sendInput = (data) => {
        globalThis.__sent.push(data)
        return original(data)
      }
    })

    await compose(page, ["ㅎ", "하", "한"], null)
    const during = await page.evaluate(() => {
      const overlay = document.querySelector(".term-preedit")
      const canvas = document.querySelector(".terminal canvas").getBoundingClientRect()
      const cursor = globalThis.__wt.terminal.wasmTerm.getCursor()
      const metrics = globalThis.__wt.terminal.renderer.getMetrics()
      const rect = overlay.getBoundingClientRect()
      const textarea = globalThis.__wt.terminal.textarea.getBoundingClientRect()
      return {
        text: overlay.textContent,
        hidden: overlay.hidden,
        dx: Math.abs(rect.x - (canvas.x + cursor.viewportX * metrics.width)),
        dy: Math.abs(rect.y - (canvas.y + cursor.viewportY * metrics.height)),
        taDx: Math.abs(textarea.x - rect.x),
        taDy: Math.abs(textarea.y - rect.y),
        cellW: metrics.width,
        cellH: metrics.height,
        sent: globalThis.__sent.length,
      }
    })
    const positioned = during.dx <= 1 && during.dy <= 1 && !during.hidden && during.text === "한"
    record(
      `I1 preedit at cursor (${profile})`,
      positioned,
      `text=${during.text} hidden=${during.hidden} dx=${during.dx.toFixed(2)} dy=${during.dy.toFixed(2)} cell=${during.cellW}x${during.cellH}`,
    )
    const anchored = during.taDx <= during.cellW && during.taDy <= during.cellH
    record(
      `I1b textarea anchors candidate window (${profile})`,
      anchored,
      `textarea offset from preedit: ${during.taDx.toFixed(2)}x${during.taDy.toFixed(2)} (cell ${during.cellW}x${during.cellH})`,
    )
    record(
      `I2 silent during composition (${profile})`,
      during.sent === 0,
      `sendInput calls while composing = ${during.sent}`,
    )

    if (profile === "desktop") {
      await page.screenshot({ path: join(evidenceDir, "i1-preedit-desktop.png") })
    } else {
      await page.screenshot({ path: join(evidenceDir, "i1-preedit-mobile.png") })
    }

    await compose(page, [], "한")
    await page.waitForFunction(() => document.querySelector(".term-preedit")?.hidden === true, {
      timeout: 5000,
    })
    const after = await page.evaluate(() => ({
      hidden: document.querySelector(".term-preedit").hidden,
      value: globalThis.__wt.terminal.textarea.value,
      commits: globalThis.__sent.filter((d) => d.includes("한")).length,
    }))
    record(
      `I3 commit exactly once + cleanup (${profile})`,
      after.hidden && after.value === "" && after.commits === 1,
      `hidden=${after.hidden} textarea.value=${JSON.stringify(after.value)} commits=${after.commits}`,
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
