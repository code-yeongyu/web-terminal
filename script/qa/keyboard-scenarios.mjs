import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7821")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence-dir", ".omo/evidence/keyboard-input/red/desktop")

if (base === undefined || password === undefined || evidenceDir === undefined) {
  throw new TypeError("keyboard QA arguments are unavailable")
}

await mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } })
const page = await context.newPage()
const actions = []
let herdrRequestCount = 0

const record = (name, pass, detail) => {
  actions.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

const terminalLines = () =>
  page.evaluate(() => {
    const terminal = globalThis.__wt?.terminal
    const buffer = terminal?.buffer.active
    if (buffer === undefined) return []
    const lines = []
    for (let index = 0; index < buffer.length; index += 1) {
      const line = buffer.getLine(index)
      if (line !== undefined) lines.push(line.translateToString(true))
    }
    return lines
  })

const waitForExactLine = async (expected, count) => {
  try {
    await page.waitForFunction(
      ({ expectedLine, expectedCount }) => {
        const buffer = globalThis.__wt?.terminal?.buffer.active
        if (buffer === undefined) return false
        let matches = 0
        for (let index = 0; index < buffer.length; index += 1) {
          if (buffer.getLine(index)?.translateToString(true) === expectedLine) matches += 1
        }
        return matches === expectedCount
      },
      { expectedCount: count, expectedLine: expected },
      { timeout: 10_000 },
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return false
    throw error
  }
}

try {
  await context.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.route("**/api/herdr/**", async (route) => {
    herdrRequestCount += 1
    await route.fulfill({
      contentType: "application/json",
      json: { status: "unavailable" },
      status: 503,
    })
  })

  const login = await context.request.post(`${base}/api/login`, {
    data: { password },
  })
  if (!login.ok()) throw new Error(`QA login failed with ${login.status()}`)
  const beforeSessionsResponse = await context.request.get(`${base}/api/sessions`)
  const beforeSessions = (await beforeSessionsResponse.json()).sessions

  await page.goto(base)
  await page.locator(".terminal canvas").waitFor()
  await page.waitForFunction(() => globalThis.__wt?.connection.sessionId !== undefined)

  const isolation = await page.evaluate(async () => {
    const response = await fetch("/api/sessions")
    const body = await response.json()
    const sessionId = globalThis.__wt?.connection.sessionId
    return {
      persistedSessionId: localStorage.getItem("wt:session-id"),
      sessionId,
      sessions: body.sessions,
    }
  })
  const isolated =
    typeof isolation.sessionId === "string" &&
    isolation.persistedSessionId === isolation.sessionId &&
    isolation.sessions.length === beforeSessions.length + 1 &&
    !beforeSessions.some((session) => session.id === isolation.sessionId)
  record(
    "fresh standalone session",
    isolated,
    `session=${isolation.sessionId} before=${beforeSessions.length} after=${isolation.sessions.length}`,
  )

  await page.evaluate(() => {
    const connection = globalThis.__wt?.connection
    if (connection === undefined) throw new TypeError("terminal connection is unavailable")
    globalThis.__keyboardQaSent = []
    const original = connection.sendInput.bind(connection)
    connection.sendInput = (data) => {
      globalThis.__keyboardQaSent.push(data)
      original(data)
    }
    globalThis.__wt?.terminal.textarea?.focus()
  })

  await page.keyboard.type("printf 'PTY-PROBE:한\\n'")
  await page.keyboard.press("Enter")
  await waitForExactLine("PTY-PROBE:한", 1)
  const probeLines = await terminalLines()
  record(
    "CJK PTY probe",
    probeLines.filter((line) => line === "PTY-PROBE:한").length === 1,
    "exact output line PTY-PROBE:한 rendered once",
  )

  await page.keyboard.type("printf 'EDIT-OK:XY")
  await page.keyboard.press("Backspace")
  await page.keyboard.type("Z\\n'")
  await page.keyboard.press("Enter")
  const edited = await waitForExactLine("EDIT-OK:XZ", 1)
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Enter")
  const replayed = await waitForExactLine("EDIT-OK:XZ", 2)
  const editingLines = await terminalLines()
  record(
    "editing keys",
    edited && replayed,
    `edited=${edited} replayed=${replayed} tail=${JSON.stringify(editingLines.slice(-8))}`,
  )

  const inputState = await page.evaluate(() => ({
    activeIsTextarea: document.activeElement === globalThis.__wt?.terminal.textarea,
    sent: globalThis.__keyboardQaSent,
  }))
  record(
    "terminal focus",
    inputState.activeIsTextarea,
    `active element remains hidden terminal textarea=${inputState.activeIsTextarea}`,
  )
  record(
    "Herdr route isolation",
    herdrRequestCount >= 1,
    `${herdrRequestCount} requests intercepted`,
  )

  await page.screenshot({ path: join(evidenceDir, "desktop-pty-probe.png"), fullPage: true })
  await writeFile(
    join(evidenceDir, "desktop-actions.json"),
    `${JSON.stringify({ actions, herdrRequestCount, inputState, isolation }, null, 2)}\n`,
  )
} finally {
  await context.close()
  await browser.close()
}

const failed = actions.filter((action) => !action.pass)
console.log(`${actions.length - failed.length}/${actions.length} keyboard scenarios passed`)
process.exit(failed.length === 0 ? 0 : 1)
